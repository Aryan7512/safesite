// Report detail / Closure view (PRD §5.1 screen 6) — the answer to
// "reporting feels pointless": status timeline, owner, due date, and on
// closure the fix note and fix photo.
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { plantClock, plantDate } from '@/domain/shift';
import { reportLabel } from '@/domain/types';
import { Photo, useAreaName } from '@/features/worker/chrome';
import { useItems, useUserName } from '@/lib/queries';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { CategoryLabel, SeverityBadge, StatusChip } from '@/ui/Badges';
import { Icon, type IconName } from '@/ui/Icon';
import { Card, Row } from '@/ui/Layout';
import { T } from '@/ui/Text';

const when = (iso: string) => `${plantDate(new Date(iso))}, ${plantClock(new Date(iso))}`;

export default function ReportDetail() {
  const { t } = useTranslation();
  const { p } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { items } = useItems();
  const areaName = useAreaName();
  const userName = useUserName();
  const item = items.find((i) => i.report.id === Number(id));

  if (!item) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }} />;
  }
  const { report: r, action: a } = item;
  const closed = a.status === 'Closed';

  const steps: { icon: IconName; label: string; at: string | null; done: boolean; tone?: string }[] = [
    { icon: 'send-check-outline', label: t('timeline.created'), at: r.created_at, done: true },
    { icon: 'account-arrow-right-outline', label: t('timeline.assigned', { name: userName(a.owner_id) }), at: a.assigned_at, done: !!a.assigned_at },
    ...(a.escalated_at ? [{ icon: 'arrow-up-bold-circle-outline' as IconName, label: t('timeline.escalated'), at: a.escalated_at, done: true, tone: p.escalated }] : []),
    { icon: 'progress-wrench', label: t('timeline.started'), at: a.started_at, done: !!a.started_at },
    { icon: 'check-decagram', label: t('timeline.closed'), at: a.closed_at, done: closed, tone: p.clear },
  ];

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: p.bg }}>
      <Row between style={{ paddingHorizontal: space.lg, paddingVertical: space.sm }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/reports'))} style={styles.back}>
          <Icon name="arrow-left" size={26} />
          <T v="mono" color="dim">
            {reportLabel(r.report_no)}
          </T>
        </Pressable>
        <StatusChip status={a.status} merged={a.merged_into != null} size="lg" />
      </Row>

      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxxl }}>
        {closed ? (
          <View style={[styles.closure, { backgroundColor: p.clearSoft, borderColor: p.clear }]}>
            <Row gap={space.sm}>
              <Icon name="check-decagram" size={28} color={p.clear} />
              <T v="h2">{t('reports.whatWasDone')}</T>
            </Row>
            <T v="bodyLg">{a.resolution_note}</T>
            {a.fix_photo_url ? (
              <View style={{ gap: space.xs }}>
                <T v="label" color="dim">
                  {t('reports.fixPhoto')}
                </T>
                <Photo path={a.fix_photo_url} size="100%" />
              </View>
            ) : null}
            <T v="small" color="dim">
              {t('reports.closedBy', { name: userName(a.owner_id) })} · {a.closed_at ? when(a.closed_at) : ''}
            </T>
            <T v="body" weight="semibold">
              {t('reports.thanks')}
            </T>
          </View>
        ) : (
          <Card>
            <Row gap={space.sm} align="flex-start">
              <Icon name="account-clock-outline" color={p.accent} />
              <T v="body" style={{ flex: 1 }}>
                {t('reports.notYet')}
              </T>
            </Row>
          </Card>
        )}

        <Card>
          <Row gap={space.sm} wrap>
            <SeverityBadge severity={r.severity} size="lg" />
            <CategoryLabel category={r.category} v="h3" />
          </Row>
          <Meta icon="map-marker-outline" label={t('reports.area')} value={areaName(r.area_id)} />
          <Meta icon="clock-outline" label={t('reports.reported')} value={when(r.created_at)} />
          <Meta icon="account-hard-hat-outline" label={t('reports.owner')} value={userName(a.owner_id)} />
          {!closed ? <Meta icon="calendar-clock" label={t('reports.due')} value={when(a.due_at)} /> : null}
        </Card>

        <Card>
          <T v="label" color="dim">
            {t('reports.timeline')}
          </T>
          <View>
            {steps.map((s, i) => (
              <View key={s.label} style={styles.step}>
                <View style={{ alignItems: 'center' }}>
                  <View style={[styles.node, { backgroundColor: s.done ? (s.tone ?? p.accent) : p.sunken, borderColor: s.done ? (s.tone ?? p.accent) : p.borderStrong }]}>
                    <Icon name={s.icon} size={16} color={s.done ? p.bg : p.textFaint} />
                  </View>
                  {i < steps.length - 1 ? <View style={[styles.line, { backgroundColor: steps[i + 1].done ? p.accent : p.border }]} /> : null}
                </View>
                <View style={{ flex: 1, paddingBottom: space.lg }}>
                  <T v="h3" color={s.done ? 'text' : 'faint'}>
                    {s.label}
                  </T>
                  {s.at ? (
                    <T v="small" color="dim">
                      {when(s.at)}
                    </T>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        </Card>

        <Card>
          <T v="label" color="dim">
            {t('reports.youSaid')}
          </T>
          <T v="bodyLg">{r.transcript || '—'}</T>
          {r.photo_urls.length ? (
            <Row gap={space.sm} wrap>
              {r.photo_urls.map((path) => (
                <Photo key={path} path={path} size={96} />
              ))}
            </Row>
          ) : null}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function Meta({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  const { p } = useTheme();
  return (
    <Row gap={space.md}>
      <Icon name={icon} size={20} color={p.textDim} />
      <T v="small" color="dim" style={{ width: 96 }}>
        {label}
      </T>
      <T v="body" weight="medium" style={{ flex: 1 }}>
        {value}
      </T>
    </Row>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48 },
  closure: { gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 2 },
  step: { flexDirection: 'row', gap: space.md },
  node: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  line: { width: 2, flex: 1, minHeight: 18 },
});
