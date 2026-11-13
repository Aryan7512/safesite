// Contractor check-in (PRD §5.1 screen 7, bonus): 3-question induction quiz
// after first login. Each question must be answered correctly to continue.
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { radius, space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Button } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { Row, Screen } from '@/ui/Layout';
import { T } from '@/ui/Text';
import { useToast } from '@/ui/Toast';
import { WorkerHeader } from '@/features/worker/chrome';

const QUESTIONS = [
  { q: 'q1', answers: ['q1a', 'q1b', 'q1c'], correct: 'q1a' },
  { q: 'q2', answers: ['q2a', 'q2b', 'q2c'], correct: 'q2b' },
  { q: 'q3', answers: ['q3a', 'q3b', 'q3c'], correct: 'q3b' },
] as const;

export default function Induction() {
  const { t } = useTranslation();
  const { p } = useTheme();
  const toast = useToast();
  const { refreshMe } = useAuth();
  const [n, setN] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const q = QUESTIONS[n];
  const right = picked === q.correct;

  async function next() {
    if (n < QUESTIONS.length - 1) {
      setN(n + 1);
      setPicked(null);
      return;
    }
    setBusy(true);
    try {
      await api.completeInduction(3);
      await refreshMe();
      router.replace('/capture');
    } catch (e) {
      toast({ tone: 'error', title: String((e as Error).message) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll edges={['top', 'left', 'right', 'bottom']}>
      <WorkerHeader />
      <View style={{ gap: space.sm }}>
        <T v="h1">{t('induction.title')}</T>
        <T v="body" color="dim">
          {t('induction.intro')}
        </T>
      </View>

      <Row gap={6}>
        {QUESTIONS.map((_, i) => (
          <View key={i} style={[styles.bar, { backgroundColor: i <= n ? p.accent : p.border }]} />
        ))}
      </Row>
      <T v="label" color="dim">
        {t('induction.progress', { n: n + 1 })}
      </T>
      <T v="h2">{t(`induction.${q.q}`)}</T>

      <View style={{ gap: space.md }}>
        {q.answers.map((a) => {
          const on = picked === a;
          const isRight = on && a === q.correct;
          const isWrong = on && a !== q.correct;
          return (
            <Pressable
              key={a}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => setPicked(a)}
              style={[
                styles.answer,
                {
                  backgroundColor: isRight ? p.clearSoft : isWrong ? p.highSoft : p.surface,
                  borderColor: isRight ? p.clear : isWrong ? p.high : p.borderStrong,
                  borderWidth: on ? 2 : p.borderWidth,
                },
              ]}
            >
              <Icon name={isRight ? 'check-circle' : isWrong ? 'close-circle' : 'circle-outline'} size={26} color={isRight ? p.clear : isWrong ? p.high : p.textDim} />
              <T v="bodyLg" weight="medium" style={{ flex: 1 }}>
                {t(`induction.${a}`)}
              </T>
            </Pressable>
          );
        })}
      </View>

      {picked && !right ? (
        <T v="body" color="high" weight="semibold">
          {t('induction.wrong')}
        </T>
      ) : null}

      <View style={{ marginTop: 'auto' }}>
        <Button
          label={n === QUESTIONS.length - 1 ? t('induction.finish') : t('common.next')}
          size="xl"
          full
          iconRight="arrow-right"
          disabled={!right}
          loading={busy}
          onPress={next}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  bar: { flex: 1, height: 6, borderRadius: 3 },
  answer: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, minHeight: touch.primary + 8 },
});
