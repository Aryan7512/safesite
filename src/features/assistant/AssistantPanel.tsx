// Assistant panel: ask about the plant, get an answer built from live data, and
// confirm any suggested change with one tap. Nothing is applied without Apply.
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WIDE } from '@/features/dashboard/store';
import { api, assistant, type AssistantProposal } from '@/lib/api';
import { qk } from '@/lib/queries';
import { fontFor } from '@/theme/fonts';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Button } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { T } from '@/ui/Text';
import { useAssistant, type ChatMsg } from './store';

const SUGGESTIONS = [
  'What needs my attention first?',
  'Which reports are overdue and who owns them?',
  'Are there repeat hazards I should act on?',
  'Who has the most open work?',
  'Write a short handover for the next shift.',
];

/** **bold** → bold segments; lines starting with -, * or 1. → bullets. */
function RichText({ text }: { text: string }) {
  const lines = text.split('\n').filter((l) => l.trim().length);
  return (
    <View style={{ gap: 6 }}>
      {lines.map((line, i) => {
        const bullet = /^\s*(?:[-*•]|\d+[.)])\s+/.test(line);
        const body = line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '');
        const parts = body.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
        const inner: ReactNode[] = parts.map((s, k) =>
          s.startsWith('**') ? (
            <T key={k} v="body" weight="bold">
              {s.slice(2, -2)}
            </T>
          ) : (
            s
          ),
        );
        return (
          <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
            {bullet ? <T v="body" color="dim">•</T> : null}
            <T v="body" style={{ flex: 1 }}>
              {inner}
            </T>
          </View>
        );
      })}
    </View>
  );
}

function describe(p: AssistantProposal): { title: string; detail: string; apply: string } {
  switch (p.type) {
    case 'assign':
      return { title: `Assign ${p.ref} to ${p.owner_name}`, detail: p.title, apply: 'Assign' };
    case 'reclassify':
      return { title: `Change ${p.ref} to ${p.severity}, ${p.category}`, detail: p.title, apply: 'Apply change' };
    case 'start':
      return { title: `Start work on ${p.ref}`, detail: p.title, apply: 'Start work' };
    default:
      return { title: `Close ${p.ref}`, detail: p.note ?? p.title, apply: 'Close' };
  }
}

function ProposalCard({ msg, prop }: { msg: ChatMsg; prop: NonNullable<ChatMsg['proposals']>[number] }) {
  const { p } = useTheme();
  const qc = useQueryClient();
  const patch = useAssistant((s) => s.patchProposal);
  const [busy, setBusy] = useState(false);
  const d = describe(prop);
  const done = prop.state === 'applied';

  async function apply() {
    setBusy(true);
    try {
      if (prop.type === 'assign') await api.assign(prop.report_id, prop.owner_id!);
      else if (prop.type === 'reclassify') await api.reclassify(prop.report_id, prop.category!, prop.severity!, 'Suggested by the assistant, confirmed by a person');
      else if (prop.type === 'start') await api.start(prop.report_id);
      else await api.close(prop.report_id, prop.note ?? '');
      patch(msg.id, prop.report_id, prop.type, { state: 'applied' });
      await Promise.all([qc.invalidateQueries({ queryKey: qk.reports }), qc.invalidateQueries({ queryKey: qk.actions }), qc.invalidateQueries({ queryKey: ['audit'] }), qc.invalidateQueries({ queryKey: qk.feed })]);
    } catch (e) {
      patch(msg.id, prop.report_id, prop.type, { state: 'failed', error: String((e as Error).message ?? e) });
    } finally {
      setBusy(false);
    }
  }

  if (prop.state === 'dismissed') return null;
  return (
    <View style={{ borderWidth: 1, borderColor: done ? p.clear : p.accent, borderLeftWidth: 4, borderRadius: 4, backgroundColor: done ? p.clearSoft : p.surface, padding: space.md, gap: 6 }}>
      <T v="body" weight="semibold">
        {d.title}
      </T>
      <T v="small" color="dim" numberOfLines={3}>
        {d.detail}
      </T>
      <T v="small" color="dim">
        Why: {prop.reason}
      </T>
      {prop.state === 'failed' ? (
        <T v="small" color="danger">
          Not applied: {prop.error}
        </T>
      ) : null}
      {done ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="check-circle" size={18} color={p.clear} />
          <T v="body" weight="semibold" color="clear">
            Done
          </T>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: space.sm, marginTop: 4 }}>
          <Button label={d.apply} size="sm" loading={busy} onPress={apply} />
          <Button label="Dismiss" size="sm" variant="quiet" onPress={() => patch(msg.id, prop.report_id, prop.type, { state: 'dismissed' })} />
        </View>
      )}
    </View>
  );
}

export function AssistantPanel() {
  const { p } = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const open = useAssistant((s) => s.open);
  const setOpen = useAssistant((s) => s.setOpen);
  const messages = useAssistant((s) => s.messages);
  const busy = useAssistant((s) => s.busy);
  const [text, setText] = useState('');
  const scroll = useRef<{ scrollToEnd: (o?: { animated?: boolean }) => void } | null>(null);

  async function ask(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    const st = useAssistant.getState();
    st.push({ role: 'user', content: question });
    setText('');
    st.setBusy(true);
    const history = useAssistant.getState().messages.map((m) => ({ role: m.role, content: m.content }));
    const r = await assistant.chat(history);
    const s2 = useAssistant.getState();
    s2.push({ role: 'assistant', content: r.ok ? r.reply ?? '' : r.error ?? 'The assistant could not answer right now.', proposals: r.proposals });
    s2.setBusy(false);
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 80);
  }

  if (!open) return null;
  return (
    <Modal visible transparent animationType={wide ? 'fade' : 'slide'} onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        {wide ? <Pressable style={{ flex: 1, backgroundColor: p.overlay }} onPress={() => setOpen(false)} accessibilityLabel="Close assistant" /> : null}
        <SafeAreaView edges={['top', 'bottom']} style={{ width: wide ? 480 : '100%', backgroundColor: p.bg, borderLeftWidth: wide ? 1 : 0, borderLeftColor: p.borderStrong }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space.lg, borderBottomWidth: 1, borderBottomColor: p.border, backgroundColor: p.surface }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flex: 1 }}>
                <Icon name="creation" size={22} color={p.accent} />
                <View style={{ flex: 1 }}>
                  <T v="h2">Assistant</T>
                  <T v="small" color="faint">
                    Reads your live data. Changes only after you tap Apply.
                  </T>
                </View>
              </View>
              {messages.length ? <Button label="Clear" size="sm" variant="quiet" onPress={() => useAssistant.getState().clear()} /> : null}
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setOpen(false)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="close" color={p.textDim} />
              </Pressable>
            </View>

            <ScrollView ref={scroll as never} contentContainerStyle={{ padding: space.lg, gap: space.md }} keyboardShouldPersistTaps="handled">
              {messages.length === 0 ? (
                <View style={{ gap: space.sm }}>
                  <T v="body" color="dim">
                    Ask about what is open, what is slipping, or what to do next.
                  </T>
                  {SUGGESTIONS.map((s) => (
                    <Pressable key={s} accessibilityRole="button" onPress={() => ask(s)} style={({ hovered }: { pressed: boolean; hovered?: boolean }) => ({ borderWidth: 1, borderColor: p.border, borderRadius: radius.md, padding: space.md, minHeight: 48, justifyContent: 'center', backgroundColor: hovered ? p.raised : p.surface })}>
                      <T v="body">{s}</T>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {messages.map((m) =>
                m.role === 'user' ? (
                  <View key={m.id} style={{ alignSelf: 'flex-end', maxWidth: '88%', backgroundColor: p.accent, borderRadius: radius.md, padding: space.md }}>
                    <T v="body" style={{ color: p.accentText }}>
                      {m.content}
                    </T>
                  </View>
                ) : (
                  <View key={m.id} style={{ gap: space.sm }}>
                    <View style={{ backgroundColor: p.surface, borderWidth: 1, borderColor: p.border, borderRadius: radius.md, padding: space.md }}>
                      <RichText text={m.content} />
                    </View>
                    {(m.proposals ?? []).map((pr) => (
                      <ProposalCard key={`${pr.type}${pr.report_id}`} msg={m} prop={pr} />
                    ))}
                  </View>
                ),
              )}
              {busy ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }} accessibilityLiveRegion="polite">
                  <ActivityIndicator color={p.accent} />
                  <T v="body" color="dim">
                    Checking the plant data…
                  </T>
                </View>
              ) : null}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: space.sm, padding: space.md, borderTopWidth: 1, borderTopColor: p.border, backgroundColor: p.surface }}>
              <TextInput
                value={text}
                onChangeText={setText}
                onSubmitEditing={() => ask(text)}
                placeholder="Ask about the plant…"
                placeholderTextColor={p.textFaint}
                returnKeyType="send"
                accessibilityLabel="Ask the assistant"
                style={{ flex: 1, minHeight: 48, borderWidth: 1, borderColor: p.borderStrong, borderRadius: radius.md, paddingHorizontal: space.md, color: p.text, backgroundColor: p.sunken, fontSize: 16, fontFamily: fontFor('regular', false), outlineStyle: 'none' } as object}
              />
              <Button label="Ask" icon="send" size="md" disabled={!text.trim() || busy} onPress={() => ask(text)} />
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
