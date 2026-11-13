// Transcript review (PRD §5.1 screen 3): the worker confirms or fixes the
// transcript before submit. Shows area + GPS chip. The human check is the
// control on speech-to-text errors.
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatSeconds } from '@/domain/sla';
import { captureSeconds, useCapture } from '@/features/capture/store';
import { isNetworkError, submitDraft, useOutbox } from '@/features/capture/submit';
import { Photo, useAreaName } from '@/features/worker/chrome';
import { transcribe } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { audioMime, upload } from '@/lib/media';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { Icon } from '@/ui/Icon';
import { Row } from '@/ui/Layout';
import { T } from '@/ui/Text';
import { useToast } from '@/ui/Toast';

export default function Review() {
  const { t } = useTranslation();
  const { p } = useTheme();
  const toast = useToast();
  const { session } = useAuth();
  const uid = session?.user.id ?? '';
  const d = useCapture();
  const areaName = useAreaName();
  const enqueue = useOutbox((s) => s.enqueue);
  const [submitting, setSubmitting] = useState(false);
  const [elapsed, setElapsed] = useState(captureSeconds(d) ?? 0);
  const started = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setElapsed(captureSeconds(useCapture.getState()) ?? 0), 500);
    return () => clearInterval(id);
  }, []);

  // Upload the clip and transcribe it once.
  useEffect(() => {
    if (!d.audio || d.transcribeState !== 'idle' || started.current || !uid) return;
    started.current = true;
    (async () => {
      d.set({ transcribeState: 'running' });
      try {
        const { ext, type } = audioMime(d.audio!.uri);
        const path = await upload(`${uid}/${d.clientId}/voice.${ext}`, d.audio!.uri, type);
        d.set({ audioPath: path });
        const r = await transcribe(path);
        const cur = useCapture.getState();
        if (r.ok && r.text) {
          // Don't overwrite anything the worker already typed.
          cur.set({
            transcript: cur.transcript.trim() ? cur.transcript : r.text,
            transcriptLanguage: r.language ?? null,
            transcribeState: 'done',
          });
        } else {
          cur.set({ transcribeState: 'failed', inputMode: 'text' });
        }
      } catch {
        useCapture.getState().set({ transcribeState: 'failed' });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.audio, d.transcribeState, uid]);

  async function submit() {
    if (!d.areaId) return toast({ tone: 'info', title: t('capture.needArea') });
    setSubmitting(true);
    const draft = useCapture.getState();
    const secs = captureSeconds(draft);
    try {
      const created = await submitDraft(draft, uid, secs);
      router.replace({ pathname: '/submitted', params: { id: String(created.id), label: created.label, secs: String(secs ?? '') } });
      useCapture.getState().reset();
    } catch (e) {
      if (isNetworkError(e)) {
        // Basic retry (PRD §10): keep it on the phone and send on reconnect.
        await enqueue({ draft, uid, captureSeconds: secs }, String((e as Error).message));
        router.replace({ pathname: '/submitted', params: { queued: '1', secs: String(secs ?? '') } });
        useCapture.getState().reset();
      } else {
        toast({ tone: 'error', title: t('common.error'), body: String((e as Error).message ?? e) });
      }
    } finally {
      setSubmitting(false);
    }
  }

  const transcribing = d.transcribeState === 'running';
  const canSubmit = !!d.areaId && (d.transcript.trim().length > 0 || d.photos.length > 0 || !!d.audioPath) && !transcribing;

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: p.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Row between style={{ paddingHorizontal: space.lg, paddingVertical: space.sm }}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => router.back()} style={styles.back} hitSlop={8}>
            <Icon name="arrow-left" size={26} />
            <T v="h3">{t('review.title')}</T>
          </Pressable>
          <Row gap={6}>
            <Icon name="timer-outline" size={18} color={p.textDim} />
            <T v="monoLg">{formatSeconds(elapsed)}</T>
          </Row>
        </Row>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Row gap={space.sm} wrap>
            <Chip icon="map-marker" label={areaName(d.areaId)} tone={d.areaId ? 'ok' : 'warn'} onPress={() => router.back()} />
            <Chip icon={d.lat != null ? 'crosshairs-gps' : 'crosshairs-off'} label={d.lat != null ? `${t('review.gps')} ✓` : t('review.gpsOff')} tone={d.lat != null ? 'ok' : 'neutral'} />
          </Row>

          {d.photos.length > 0 ? (
            <Row gap={space.sm}>
              {d.photos.map((ph) => (
                <Photo key={ph.uri} uri={ph.uri} size={96} />
              ))}
            </Row>
          ) : null}

          {transcribing ? (
            <View style={[styles.processing, { backgroundColor: p.surface, borderColor: p.border }]}>
              <ActivityIndicator color={p.accent} />
              <T v="body" style={{ flex: 1 }}>
                {t('review.transcribing')}
              </T>
            </View>
          ) : null}

          {d.transcribeState === 'failed' ? (
            <View style={[styles.processing, { backgroundColor: p.mediumSoft, borderColor: p.medium }]}>
              <Icon name="alert-outline" color={p.medium} />
              <T v="small" style={{ flex: 1 }}>
                {t('review.transcribeFailed')}
              </T>
            </View>
          ) : null}

          <Field
            label={d.audio ? t('review.transcriptLabel') : t('review.typeLabel')}
            placeholder={t('review.placeholder')}
            value={d.transcript}
            onChangeText={(v) => d.set({ transcript: v })}
            multiline
            large
            editable={!transcribing}
            style={{ minHeight: 150 }}
            maxLength={2000}
          />

          {d.audio ? <Playback uri={d.audio.uri} onReRecord={() => {
            d.setAudio(null);
            d.set({ transcript: '' });
            router.back();
          }} /> : null}

          <Row gap={space.sm} align="flex-start">
            <Icon name="robot-outline" size={18} color={p.textDim} />
            <T v="small" color="dim" style={{ flex: 1 }}>
              {t('review.aiNote')}
            </T>
          </Row>
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: p.border, backgroundColor: p.bg }]}>
          <Button
            label={submitting ? t('review.submitting') : t('review.submit')}
            size="xl"
            full
            icon="send"
            haptic
            loading={submitting}
            disabled={!canSubmit}
            onPress={submit}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Playback({ uri, onReRecord }: { uri: string; onReRecord: () => void }) {
  const { t } = useTranslation();
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  return (
    <Row gap={space.sm} wrap>
      <Button
        label={status.playing ? t('review.stop') : t('review.play')}
        icon={status.playing ? 'stop' : 'play'}
        variant="secondary"
        onPress={() => {
          if (status.playing) player.pause();
          else {
            player.seekTo(0);
            player.play();
          }
        }}
      />
      <Button label={t('review.reRecord')} icon="microphone-outline" variant="ghost" onPress={onReRecord} />
    </Row>
  );
}

function Chip({ icon, label, tone, onPress }: { icon: 'map-marker' | 'crosshairs-gps' | 'crosshairs-off'; label: string; tone: 'ok' | 'warn' | 'neutral'; onPress?: () => void }) {
  const { p } = useTheme();
  const c = tone === 'ok' ? p.clear : tone === 'warn' ? p.medium : p.textDim;
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={[styles.chip, { borderColor: c, borderWidth: p.borderWidth }]}>
      <Icon name={icon} size={18} color={c} />
      <T v="body" weight="semibold">
        {label}
      </T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48 },
  scroll: { padding: space.lg, gap: space.lg },
  processing: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 40, borderRadius: radius.pill },
  footer: { padding: space.lg, borderTopWidth: 1 },
});
