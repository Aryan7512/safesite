// Capture (home): three large actions — Scan area QR, Take photo, Speak (PRD §5.1).
import {
  AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState, type RecordingOptions,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatSeconds } from '@/domain/sla';
import { useCapture } from '@/features/capture/store';
import { useOutbox } from '@/features/capture/submit';
import { AreaPicker, Photo, useAreaName, WorkerHeader, WorkerTabs } from '@/features/worker/chrome';
import { radius, space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Button } from '@/ui/Button';
import { Icon, type IconName } from '@/ui/Icon';
import { Row } from '@/ui/Layout';
import { T } from '@/ui/Text';
import { useToast } from '@/ui/Toast';

const MAX_RECORD_MS = 90_000;

// Speech only needs mono at modest quality: small uploads, fast transcription.
const VOICE: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  sampleRate: 22050,
  numberOfChannels: 1,
  bitRate: 48000,
};

export default function Capture() {
  const { t } = useTranslation();
  const { p } = useTheme();
  const toast = useToast();
  const d = useCapture();
  const areaName = useAreaName();
  const pending = useOutbox((s) => s.pending);
  const flush = useOutbox((s) => s.flush);
  const [picker, setPicker] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const recorder = useAudioRecorder(VOICE);
  const rec = useAudioRecorderState(recorder, 250);

  // Location in the background as soon as the screen opens (chip on review).
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const last = await Location.getLastKnownPositionAsync();
        if (last) useCapture.getState().set({ lat: last.coords.latitude, lng: last.coords.longitude });
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        useCapture.getState().set({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch {
        /* GPS is optional */
      }
    })();
  }, []);

  // Visible "time so far" clock (PRD §13 impact is measured with it).
  useEffect(() => {
    if (!d.startedAt) return;
    const id = setInterval(() => setElapsed(Math.round((Date.now() - d.startedAt!) / 1000)), 500);
    return () => clearInterval(id);
  }, [d.startedAt]);
  const shownElapsed = d.startedAt ? elapsed : 0;

  // Auto-stop long clips.
  useEffect(() => {
    if (rec.isRecording && rec.durationMillis >= MAX_RECORD_MS) stopRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec.isRecording, rec.durationMillis]);

  async function startRecording() {
    d.touch();
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) {
      toast({ tone: 'error', title: t('capture.micDenied') });
      return;
    }
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  }

  async function stopRecording() {
    const duration = rec.durationMillis;
    await recorder.stop();
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const uri = recorder.uri;
    if (uri) {
      d.setAudio({ uri, durationMs: duration });
      d.set({ inputMode: 'voice' });
      if (d.areaId) router.push('/review');
    }
  }

  const hasContent = d.photos.length > 0 || !!d.audio || d.transcript.trim().length > 0;
  const ready = !!d.areaId && hasContent;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: p.bg }}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <WorkerHeader />

        {pending.length > 0 ? (
          <Pressable onPress={() => flush()} style={[styles.banner, { backgroundColor: p.mediumSoft, borderColor: p.medium }]}>
            <Icon name="cloud-upload-outline" color={p.medium} />
            <T v="small" style={{ flex: 1 }}>
              {t('review.savedOffline')} ({pending.length})
            </T>
            <T v="small" weight="semibold" color="accent">
              {t('common.retry')}
            </T>
          </Pressable>
        ) : null}

        <Row between>
          <T v="h1">{t('capture.greeting')}</T>
          {d.startedAt ? (
            <View accessibilityLabel={`${t('capture.timer')} ${formatSeconds(shownElapsed)}`} style={[styles.timer, { borderColor: p.border, backgroundColor: p.surface }]}>
              <Icon name="timer-outline" size={18} color={p.textDim} />
              <T v="mono">{formatSeconds(shownElapsed)}</T>
            </View>
          ) : null}
        </Row>

        <BigAction
          icon="qrcode-scan"
          label={t('capture.scan')}
          done={d.areaId ? t('capture.scanDone', { area: areaName(d.areaId) }) : undefined}
          onPress={() => {
            d.touch();
            router.push('/scan');
          }}
        />
        <Pressable accessibilityRole="button" onPress={() => setPicker(true)} style={styles.link} hitSlop={8}>
          <T v="small" weight="semibold" color="accent">
            {t('capture.pickArea')}
          </T>
        </Pressable>

        <BigAction
          icon="camera-outline"
          label={t('capture.photo')}
          done={d.photos.length ? t('capture.photoCount', { count: d.photos.length }) : undefined}
          onPress={() => {
            d.touch();
            router.push('/camera');
          }}
        />
        {d.photos.length > 0 ? (
          <Row gap={space.sm}>
            {d.photos.map((ph, i) => (
              <Pressable key={ph.uri} accessibilityLabel="Remove photo" onLongPress={() => d.removePhoto(i)}>
                <Photo uri={ph.uri} size={72} />
              </Pressable>
            ))}
          </Row>
        ) : null}

        <BigAction
          icon={rec.isRecording ? 'stop-circle' : 'microphone'}
          label={rec.isRecording ? t('capture.recording') : t('capture.speak')}
          sub={rec.isRecording ? undefined : d.audio ? undefined : t('capture.speakHint')}
          done={!rec.isRecording && d.audio ? t('capture.recorded', { time: formatSeconds(d.audio.durationMs / 1000) }) : undefined}
          recording={rec.isRecording}
          timer={rec.isRecording ? formatSeconds(rec.durationMillis / 1000) : undefined}
          onPress={() => (rec.isRecording ? stopRecording() : startRecording())}
        />

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            d.touch();
            d.set({ inputMode: d.audio ? 'voice' : 'text' });
            if (!d.areaId) return toast({ tone: 'info', title: t('capture.needArea') });
            router.push('/review');
          }}
          style={styles.link}
          hitSlop={8}
        >
          <Row gap={6}>
            <Icon name="keyboard-outline" size={18} color={p.accent} />
            <T v="body" weight="semibold" color="accent">
              {t('capture.typeInstead')}
            </T>
          </Row>
        </Pressable>

        <View style={{ gap: space.sm, marginTop: space.sm }}>
          <Button
            label={t('capture.continue')}
            size="xl"
            full
            iconRight="arrow-right"
            disabled={!ready || rec.isRecording}
            onPress={() => router.push('/review')}
          />
          {!ready && d.startedAt ? (
            <T v="small" color="dim" center>
              {!d.areaId ? t('capture.needArea') : t('capture.needContent')}
            </T>
          ) : null}
          {d.startedAt ? <Button label={t('capture.discard')} variant="quiet" size="sm" onPress={() => d.reset()} style={{ alignSelf: 'center' }} /> : null}
        </View>
      </ScrollView>
      <WorkerTabs />

      <AreaPicker
        visible={picker}
        onClose={() => setPicker(false)}
        onPick={(a) => {
          d.setArea(a.id, 'list');
          setPicker(false);
        }}
      />
    </SafeAreaView>
  );
}

function BigAction({
  icon, label, sub, done, onPress, recording, timer,
}: { icon: IconName; label: string; sub?: string; done?: string; onPress: () => void; recording?: boolean; timer?: string }) {
  const { p } = useTheme();
  const isDone = !!done && !recording;
  const border = recording ? p.high : isDone ? p.clear : p.borderStrong;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[label, done, timer].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => [
        styles.big,
        {
          backgroundColor: recording ? p.highSoft : pressed ? p.raised : p.surface,
          borderColor: border,
          borderWidth: recording || isDone ? 2 : p.borderWidth,
        },
      ]}
    >
      <View style={[styles.bigIcon, { backgroundColor: recording ? p.high : isDone ? p.clearSoft : p.accentSoft }]}>
        <Icon name={isDone ? 'check-bold' : icon} size={30} color={recording ? p.onHigh : isDone ? p.clear : p.accent} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="h2">{label}</T>
        {done && !recording ? (
          <T v="body" color="clear" weight="semibold">
            {done}
          </T>
        ) : sub ? (
          <T v="small" color="dim">
            {sub}
          </T>
        ) : null}
      </View>
      {timer ? (
        <Row gap={6}>
          <View style={[styles.dot, { backgroundColor: p.high }]} />
          <T v="monoLg">{timer}</T>
        </Row>
      ) : (
        <Icon name="chevron-right" color={p.textFaint} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  big: {
    flexDirection: 'row', alignItems: 'center', gap: space.lg, padding: space.lg, borderRadius: radius.lg,
    minHeight: touch.primary + 28,
  },
  bigIcon: { width: 56, height: 56, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  link: { alignSelf: 'flex-start', minHeight: touch.secondary, justifyContent: 'center', paddingHorizontal: space.xs },
  timer: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
