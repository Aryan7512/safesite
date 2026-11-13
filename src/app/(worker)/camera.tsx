import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MAX_PHOTOS, useCapture } from '@/features/capture/store';
import { Photo } from '@/features/worker/chrome';
import { compressPhoto } from '@/lib/media';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Button } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { Row } from '@/ui/Layout';
import { T } from '@/ui/Text';

export default function Camera() {
  const { t } = useTranslation();
  const { p } = useTheme();
  const [perm, request] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const photos = useCapture((s) => s.photos);
  const addPhoto = useCapture((s) => s.addPhoto);

  if (!perm) return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  if (!perm.granted) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: p.bg }]}>
        <Icon name="camera-off-outline" size={48} color={p.textDim} />
        <T v="h2" center>
          {t('camera.denied')}
        </T>
        <Button label={t('camera.allow')} size="xl" onPress={request} />
        <Button label={t('common.back')} variant="quiet" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  async function shoot() {
    if (!cam.current || busy || photos.length >= MAX_PHOTOS) return;
    setBusy(true);
    try {
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      const pic = await cam.current.takePictureAsync({ quality: 0.8, skipProcessing: Platform.OS === 'android' });
      if (pic?.uri) {
        const uri = await compressPhoto(pic.uri, pic.width);
        addPhoto({ uri, width: Math.min(pic.width ?? 1280, 1280) });
      }
    } finally {
      setBusy(false);
    }
  }

  const full = photos.length >= MAX_PHOTOS;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView ref={cam} style={StyleSheet.absoluteFill} facing="back" onCameraReady={() => setReady(true)} />
      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <Row between style={{ padding: space.lg }}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => router.back()} style={styles.round}>
            <Icon name="close" size={28} color="#fff" />
          </Pressable>
          <View style={styles.pill}>
            <T v="small" weight="semibold" color="#fff">
              {photos.length}/{MAX_PHOTOS} · {t('camera.max')}
            </T>
          </View>
        </Row>

        <View style={{ gap: space.lg, padding: space.lg }}>
          {photos.length > 0 ? (
            <Row gap={space.sm}>
              {photos.map((ph) => (
                <Photo key={ph.uri} uri={ph.uri} size={60} />
              ))}
            </Row>
          ) : null}
          <Row between>
            <View style={{ width: 120 }} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('camera.shutter')}
              disabled={!ready || busy || full}
              onPress={shoot}
              style={[styles.shutter, { opacity: !ready || full ? 0.4 : 1 }]}
            >
              {busy ? <ActivityIndicator color="#000" /> : <View style={styles.shutterInner} />}
            </Pressable>
            <View style={{ width: 120, alignItems: 'flex-end' }}>
              {photos.length > 0 ? (
                <Button label={t('common.done')} icon="check" size="lg" onPress={() => router.back()} />
              ) : null}
            </View>
          </Row>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg, padding: space.xl },
  overlay: { flex: 1, justifyContent: 'space-between' },
  round: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.55)' },
  shutter: { width: 84, height: 84, borderRadius: 42, borderWidth: 5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#fff' },
});
