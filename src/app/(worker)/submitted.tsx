// Submit confirmation (PRD §5.1 screen 4): report number, time taken, "track in My Reports".
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { formatSeconds } from '@/domain/sla';
import { useItems } from '@/lib/queries';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { CategoryLabel, SeverityBadge } from '@/ui/Badges';
import { Button } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { Card, Row, Screen } from '@/ui/Layout';
import { T } from '@/ui/Text';

export default function Submitted() {
  const { t } = useTranslation();
  const { p } = useTheme();
  const params = useLocalSearchParams<{ id?: string; label?: string; secs?: string; queued?: string }>();
  const { items } = useItems();
  const item = items.find((i) => i.report.id === Number(params.id));
  const queued = params.queued === '1';
  const secs = params.secs ? Number(params.secs) : null;
  const r = item?.report;

  return (
    <Screen scroll edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.hero}>
        <View style={[styles.check, { backgroundColor: queued ? p.mediumSoft : p.clearSoft, borderColor: queued ? p.medium : p.clear }]}>
          <Icon name={queued ? 'cloud-upload-outline' : 'check-bold'} size={56} color={queued ? p.medium : p.clear} />
        </View>
        <T v="h1" center>
          {queued ? t('submitted.queued') : t('submitted.title')}
        </T>
        {queued ? (
          <T v="body" color="dim" center>
            {t('review.savedOffline')}
          </T>
        ) : null}
      </View>

      {!queued ? (
        <Card style={{ alignItems: 'center' }}>
          <T v="label" color="dim">
            {t('submitted.number')}
          </T>
          <T v="kpi" style={{ fontSize: 44, lineHeight: 52 }} accessibilityLabel={params.label?.split('').join(' ')}>
            {params.label ?? '—'}
          </T>
        </Card>
      ) : null}

      {secs != null ? (
        <Row gap={space.sm} style={{ alignSelf: 'center' }}>
          <Icon name="timer-check-outline" size={24} color={p.accent} />
          <T v="h2">{t('submitted.time', { time: formatSeconds(secs) })}</T>
        </Row>
      ) : null}

      {!queued ? (
        <Card>
          {!r || r.ai_status === 'pending' ? (
            <Row gap={space.md}>
              <ActivityIndicator color={p.accent} />
              <T v="body">{t('submitted.classifying')}</T>
            </Row>
          ) : r.category ? (
            <Row gap={space.md} wrap>
              <SeverityBadge severity={r.severity} size="lg" />
              <CategoryLabel category={r.category} v="h3" />
            </Row>
          ) : (
            <Row gap={space.md}>
              <Icon name="account-check-outline" color={p.textDim} />
              <T v="body" style={{ flex: 1 }}>
                {t('submitted.unclassified')}
              </T>
            </Row>
          )}
          <T v="small" color="dim">
            {t('submitted.track')}
          </T>
        </Card>
      ) : null}

      <View style={{ gap: space.sm, marginTop: 'auto' }}>
        <Button label={t('submitted.mine')} size="xl" full icon="clipboard-text-clock-outline" onPress={() => router.replace(item ? `/reports/${item.report.id}` : '/reports')} />
        <Button label={t('submitted.another')} variant="secondary" size="lg" full icon="plus" onPress={() => router.replace('/capture')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: space.md, paddingTop: space.xl },
  check: { width: 112, height: 112, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 3 },
});
