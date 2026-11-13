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

const DEMO: { email: string; key: 'demoWorker' | 'demoSupervisor' | 'demoEhs'; name: string; icon: IconName }[] = [
  { email: 'worker@safesite.test', key: 'demoWorker', name: 'Ravi Kumar', icon: 'hard-hat' },
  { email: 'supervisor@safesite.test', key: 'demoSupervisor', name: 'Priya Nair', icon: 'clipboard-account-outline' },
  { email: 'ehs@safesite.test', key: 'demoEhs', name: 'Anil Deshmukh', icon: 'shield-account-outline' },
];

export default function Login() {
  const { t } = useTranslation();
  const { p, name, setTheme } = useTheme();
  const lang = useLang();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
                  onPress={() => setTheme(name === 'control' ? 'daylight' : 'control')}
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
                    key={d.email}
                    accessibilityRole="button"
                    accessibilityLabel={`${t(`login.${d.key}`)} ${d.name}`}
                    onPress={() => go(d.email, DEMO_PASSWORD)}
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
                    <Icon name={busy === d.email ? 'loading' : 'chevron-right'} color={p.textDim} />
                  </Pressable>
                ))}
              </View>
            ) : null}

            <Card>
              <Field
                label={t('login.email')}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                inputMode="email"
              />
              <Field
                label={t('login.password')}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="password"
                onSubmitEditing={() => go(email, password)}
                error={error}
              />
              <Button
                label={t('login.submit')}
                size="lg"
                full
                loading={!!busy && busy === email}
                disabled={!email || !password}
                onPress={() => go(email, password)}
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
