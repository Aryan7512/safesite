import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import { setLanguage, useLang } from '@/lib/i18n';
import { DEMO_MODE, DEMO_PASSWORD } from '@/lib/supabase';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Brand } from '@/ui/Brand';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { Icon, type IconName } from '@/ui/Icon';
import { Card, Row } from '@/ui/Layout';
import { Segmented } from '@/ui/Segmented';
import { T } from '@/ui/Text';

const DEMO: { phone: string; key: 'demoWorker' | 'demoSupervisor' | 'demoEhs'; name: string; icon: IconName }[] = [
  { phone: '9000000001', key: 'demoWorker', name: 'Ravi Kumar', icon: 'hard-hat' },
  { phone: '9000000002', key: 'demoSupervisor', name: 'Priya Nair', icon: 'clipboard-account-outline' },
  { phone: '9000000003', key: 'demoEhs', name: 'Anil Deshmukh', icon: 'shield-account-outline' },
];

export default function Login() {
  const { t } = useTranslation();
  const { p, name, setTheme } = useTheme();
  const lang = useLang();
  const { signIn } = useAuth();
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function go(e: string, pw: string) {
    setBusy(e);
    setError(null);
    const err = await signIn(e, pw);
    setBusy(null);
    if (err) setError(t('login.failed'));
    else router.replace('/');
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.col}>
            <Row between wrap gap={space.md}>
              <Brand sub={t('app.plant')} />
              <Row gap={space.sm}>
                <Segmented
                  size="lg"
            label={t('common.language')}
                  value={lang}
                  onChange={(l) => setLanguage(l)}
                  options={[
                    { value: 'en', label: 'EN' },
                    { value: 'hi', label: 'हिं' },
                  ]}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('common.theme')}
                  onPress={() => setTheme(name === 'control' ? 'plant' : 'control')}
                  style={[styles.iconBtn, { borderColor: p.border, borderWidth: p.borderWidth }]}
                >
                  <Icon name={name === 'control' ? 'white-balance-sunny' : 'weather-night'} color={p.textDim} />
                </Pressable>
              </Row>
            </Row>

            <View style={{ gap: space.sm, marginTop: space.xl }}>
              <T v="display">{t('login.title')}</T>
              <T v="bodyLg" color="dim">
                {t('login.subtitle')}
              </T>
            </View>

            {DEMO_MODE && DEMO_PASSWORD ? (
              <View style={{ gap: space.sm }}>
                <T v="label" color="dim">
                  {t('login.demo')}
                </T>
                {DEMO.map((d) => (
                  <Pressable
                    key={d.phone}
                    accessibilityRole="button"
                    accessibilityLabel={`${t(`login.${d.key}`)} ${d.name}`}
                    onPress={() => go(d.phone, DEMO_PASSWORD)}
                    disabled={!!busy}
                    style={({ pressed }) => [
                      styles.tile,
                      { backgroundColor: pressed ? p.raised : p.surface, borderColor: p.border, borderWidth: p.borderWidth },
                    ]}
                  >
                    <View style={[styles.tileIcon, { backgroundColor: p.accentSoft }]}>
                      <Icon name={d.icon} size={26} color={p.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <T v="h3">{t(`login.${d.key}`)}</T>
                      <T v="small" color="dim">
                        {d.name}
                      </T>
                    </View>
                    <Icon name={busy === d.phone ? 'loading' : 'chevron-right'} color={p.textDim} />
                  </Pressable>
                ))}
              </View>
            ) : null}

            <Card>
              <Field
                label={t('login.phone')}
                value={phone}
                onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 10))}
                keyboardType="number-pad"
                inputMode="numeric"
                autoComplete="tel"
                textContentType="telephoneNumber"
                maxLength={10}
                placeholder="98765 43210"
                large
                style={{ fontSize: 24, letterSpacing: 2 }}
              />
              <Field
                label={t('login.pin')}
                value={pin}
                onChangeText={(v) => setPin(v.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                inputMode="numeric"
                secureTextEntry
                maxLength={6}
                placeholder="••••••"
                large
                style={{ fontSize: 24, letterSpacing: 8 }}
                onSubmitEditing={() => phone.length === 10 && pin.length === 6 && go(phone, pin)}
                error={error}
              />
              <Button
                label={t('login.submit')}
                size="xl"
                full
                loading={!!busy && busy === phone}
                disabled={phone.length !== 10 || pin.length !== 6}
                onPress={() => go(phone, pin)}
              />
            </Card>

            <Row gap={space.sm} align="flex-start">
              <Icon name="shield-check-outline" size={18} color={p.clear} />
              <T v="small" color="dim" style={{ flex: 1 }}>
                {t('login.noBlame')}
              </T>
            </Row>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, padding: space.lg, alignItems: 'center' },
  col: { width: '100%', maxWidth: 460, gap: space.xl },
  iconBtn: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  tile: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, minHeight: 72 },
  tileIcon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
