// My Reports (PRD §5.1 screen 5): live status chips via Realtime.
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ago } from '@/domain/sla';
import { reportLabel } from '@/domain/types';
import { useOutbox } from '@/features/capture/submit';
import { useAreaName, WorkerHeader, WorkerTabs } from '@/features/worker/chrome';
import { useItems, useNow } from '@/lib/queries';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { CategoryLabel, StatusChip } from '@/ui/Badges';
import { Icon } from '@/ui/Icon';
import { Card, Empty, Row } from '@/ui/Layout';
import { T } from '@/ui/Text';

export default function MyReports() {
  const { t } = useTranslation();
  const { p } = useTheme();
  const { items, isLoading, refetch } = useItems();
  const pending = useOutbox((s) => s.pending);
  const flush = useOutbox((s) => s.flush);
  const areaName = useAreaName();
  const now = useNow(30_000);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: p.bg }}>
      <FlatList
        data={items}
        keyExtractor={(i) => String(i.report.id)}
        contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xxl }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => void refetch()} tintColor={p.accent} />}
        ListHeaderComponent={
          <View style={{ gap: space.lg, marginBottom: space.sm }}>
            <WorkerHeader />
            <T v="h1">{t('reports.title')}</T>
            {pending.map((x) => (
              <Card key={x.draft.clientId} accent={p.medium} onPress={() => flush()}>
                <Row between>
                  <Row gap={space.sm}>
                    <Icon name="cloud-upload-outline" color={p.medium} />
                    <T v="h3">{t('reports.pending')}</T>
                  </Row>
                  <T v="small" weight="semibold" color="accent">
                    {t('common.retry')}
                  </T>
                </Row>
                <T v="small" color="dim" numberOfLines={2}>
                  {areaName(x.draft.areaId)} · {x.draft.transcript || '—'}
                </T>
              </Card>
            ))}
          </View>
        }
        ListEmptyComponent={isLoading ? undefined : <Empty title={t('reports.empty')} />}
        renderItem={({ item: { report: r, action: a } }) => (
          <Card onPress={() => router.push(`/reports/${r.id}`)} accent={a.status === 'Closed' ? p.clear : undefined}>
            <Row between>
              <T v="mono" color="dim">
                {reportLabel(r.report_no)}
              </T>
              <StatusChip status={a.status} merged={a.merged_into != null} />
            </Row>
            <CategoryLabel category={r.category} v="h3" />
            <T v="body" color="dim" numberOfLines={2}>
              {r.transcript || r.summary || '—'}
            </T>
            <Row between>
              <Row gap={6}>
                <Icon name="map-marker-outline" size={16} color={p.textFaint} />
                <T v="small" color="dim">
                  {areaName(r.area_id)}
                </T>
              </Row>
              <T v="small" color="faint">
                {ago(r.created_at, now)}
              </T>
            </Row>
            {a.status === 'Closed' && a.resolution_note ? (
              <Row gap={6} align="flex-start">
                <Icon name="check-decagram" size={18} color={p.clear} />
                <T v="small" style={{ flex: 1 }} numberOfLines={2}>
                  {a.resolution_note}
                </T>
              </Row>
            ) : null}
          </Card>
        )}
      />
      <WorkerTabs />
    </SafeAreaView>
  );
}
