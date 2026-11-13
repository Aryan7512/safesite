// Shift briefing: a few plain sentences, written by the assistant from the live
// numbers, at the top of the Overview. Refreshes itself when a High report or an
// escalation arrives. It is advice, labelled as AI, and never changes anything.
import { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, useWindowDimensions, View } from 'react-native';
import { WIDE } from '@/features/dashboard/store';
import { Panel } from '@/features/dashboard/widgets';
import { assistant } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useItems, useSettings } from '@/lib/queries';
import { onNotification } from '@/lib/realtime';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Icon } from '@/ui/Icon';
import { T } from '@/ui/Text';
import { useAssistant } from './store';
import { plantClock } from '@/domain/shift';

const TTL_MS = 10 * 60_000;

export function AssistantBriefing() {
  const { p } = useTheme();
  const { me } = useAuth();
  const { items, isLoading } = useItems();
  const briefing = useAssistant((s) => s.briefing);
  const state = useAssistant((s) => s.briefingState);
  const setBriefing = useAssistant((s) => s.setBriefing);
  const setOpen = useAssistant((s) => s.setOpen);
  const settings = useSettings();
  const wide = useWindowDimensions().width >= WIDE;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef(false);

  const load = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    const keep = useAssistant.getState().briefing;
    setBriefing(keep, 'loading');
    const r = await assistant.briefing();
    inflight.current = false;
    if (r.ok && r.bullets?.length) setBriefing({ bullets: r.bullets, at: Date.now() }, 'idle');
    else setBriefing(keep, 'error');
  }, [setBriefing]);

  // First load once data is in, then keep it fresh.
  useEffect(() => {
    if (me?.role === 'worker' || isLoading || items.length === 0) return;
    if (!briefing || Date.now() - briefing.at > TTL_MS) load();
  }, [me?.role, isLoading, items.length, briefing, load]);

  // New High report or an escalation → refresh shortly after (debounced).
  useEffect(
    () =>
      onNotification((n) => {
        if (n.type !== 'high_severity' && n.type !== 'escalation' && n.type !== 'new_report') return;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(load, 6000);
      }),
    [load],
  );
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  if (me?.role === 'worker') return null;
  if (!briefing && state !== 'loading' && state !== 'error') return null;

  const updated = briefing ? plantClock(new Date(briefing.at + settings.demo_offset_minutes * 60_000)) : null;

  return (
    <Panel
      title="Shift notes"
      meta={updated ? `Open reports · updated ${updated}` : 'Current open work'}
      right={(
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          {state === 'loading' ? <ActivityIndicator size="small" color={p.textDim} /> : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Refresh shift notes" onPress={load} hitSlop={8} style={{ minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="refresh" size={20} color={p.textDim} />
          </Pressable>
          {wide ? (
            <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={{ paddingHorizontal: 8, minHeight: 40, justifyContent: 'center' }}>
              <T v="body" weight="semibold" color="accent">Ask a question</T>
            </Pressable>
          ) : null}
        </View>
      )}
    >
      {briefing ? (
        <View style={{ gap: 0 }} accessibilityLiveRegion="polite">
          {briefing.bullets.map((b, i) => (
            <View key={`${i}-${b}`} style={{ paddingVertical: space.sm, borderTopWidth: i ? 1 : 0, borderTopColor: p.border }}>
              <T v="body" style={{ lineHeight: 22 }}>{b}</T>
            </View>
          ))}
        </View>
      ) : state === 'error' ? (
        <T v="body" color="dim">
          Shift notes are unavailable. Refresh to try again.
        </T>
      ) : (
        <T v="body" color="dim">
          Checking current open work…
        </T>
      )}
      {briefing && state === 'error' ? (
        <T v="small" color="faint">
          Showing the last update; refresh failed.
        </T>
      ) : null}
    </Panel>
  );
}
