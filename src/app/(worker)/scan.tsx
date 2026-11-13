import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCapture } from '@/features/capture/store';
import { AreaPicker } from '@/features/worker/chrome';
import { useLang } from '@/lib/i18n';
import { useAreas } from '@/lib/queries';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Button } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { T } from '@/ui/Text';

export default function Scan() {
  const { t } = useTranslation();
  const { p } = useTheme();
  const lang = useLang();
  const [perm, request] = useCameraPermissions();
  const { data: areas } = useAreas();
  const setArea = useCapture((s) => s.setArea);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [picker, setPicker] = useState(false);
  const locked = useRef(false);

  function onScan(r: BarcodeScanningResult) {
    if (locked.current) return;
    const area = areas?.find((a) => a.qr_code === r.data.trim());
    if (!area) {
      setMsg({ text: t('scan.unknown'), ok: false });
      return;
    }
    locked.current = true;
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setArea(area.id, 'qr');
    setMsg({ text: t('scan.found', { area: lang === 'hi' ? area.name_hi : area.name }), ok: true });
    setTimeout(() => router.back(), 650);
  }

  if (!perm) return <View style={{ flex: 1, backgroundColor: '#000' }} />;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {perm.granted ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={onScan}
        />
      ) : null}
      <SafeAreaView style={styles.overlay}>
        <View style={{ padding: space.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => router.back()} style={styles.round}>
            <Icon name="close" size={28} color="#fff" />
          </Pressable>
          <T v="h3" color="#fff">
            {t('scan.title')}
          </T>
          <View style={{ width: 56 }} />
        </View>

        {perm.granted ? (
          <View style={styles.frameWrap} pointerEvents="none">
            <View style={[styles.frame, { borderColor: msg?.ok ? p.clear : '#fff' }]} />
          </View>
        ) : (
          <View style={{ alignItems: 'center', gap: space.lg, padding: space.xl }}>
            <T v="h2" color="#fff" center>
              {t('camera.denied')}
            </T>
            <Button label={t('camera.allow')} size="xl" onPress={request} />
          </View>
        )}

        <View style={{ padding: space.lg, gap: space.md }}>
          <View style={[styles.msg, { backgroundColor: msg ? (msg.ok ? p.clear : p.high) : 'rgba(0,0,0,0.6)' }]}>
            <T v="h3" center color={msg ? (msg.ok ? p.onClear : p.onHigh) : '#fff'}>
              {msg?.text ?? t('scan.hint')}
            </T>
          </View>
          <Button label={t('scan.list')} variant="secondary" size="lg" icon="format-list-bulleted" full onPress={() => setPicker(true)} />
        </View>
      </SafeAreaView>

      <AreaPicker
        visible={picker}
        onClose={() => setPicker(false)}
        onPick={(a) => {
          setArea(a.id, 'list');
          setPicker(false);
          router.back();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'space-between' },
  round: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  frameWrap: { alignItems: 'center' },
  frame: { width: 240, height: 240, borderWidth: 4, borderRadius: radius.xl },
  msg: { padding: space.md, borderRadius: radius.md },
});
