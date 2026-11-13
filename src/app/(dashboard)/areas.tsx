// Areas (PRD §5.2): one area at a time — open reports, repeat hazards, closure times.
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { applyFilters, areaRisk, closureBySeverity, isBreached, isOpen, median, repeatGroups } from '@/domain/metrics';
import { ago, countdownText } from '@/domain/sla';
import { reportLabel } from '@/domain/types';
import { FilterBar } from '@/features/dashboard/Filters';
import { useDash, WIDE } from '@/features/dashboard/store';
import { useAuth } from '@/lib/auth';
import { useAreas, useItems, useNow, useSettings } from '@/lib/queries';
import { radius, SEVERITY_GLYPH, severityColors, space } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { CategoryLabel, Flag, SeverityBadge, StatusChip } from '@/ui/Badges';
import { Card, Empty, Row, SectionTitle } from '@/ui/Layout';
import { T } from '@/ui/Text';

export default function Areas() {
  const { p } = useTheme();
  const { me } = useAuth();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const params = useLocalSearchParams<{ id?: string }>();
  const { data: allAreas } = useAreas();
  const { items } = useItems();
  const settings = useSettings();
  const now = useNow(30_000);
  // Recompute at most once per minute.
  const tick = Math.floor(now.getTime() / 60_000);
  const { shift, window, open } = useDash();

  const areas = useMemo(
    () => (allAreas ?? []).filter((a) => me?.role !== 'supervisor' || a.supervisor_id === me.id),
    [allAreas, me],
  );
  const selected = areas.find((a) => a.id === Number(params.id)) ?? areas[0];

  const m = useMemo(() => {
    const at = new Date(tick * 60_000);
    if (!selected) return null;
    const filtered = applyFilters(items, { shift, window }, at).filter((i) => i.report.area_id === selected.id);
    const risk = areaRisk(filtered, [selected], settings, at)[0];
    const openItems = filtered.filter(isOpen).sort((a, b) => Number(isBreached(b, at)) - Number(isBreached(a, at)) || new Date(a.action.due_at).getTime() - new Date(b.action.due_at).getTime());
    const closed = filtered.filter((i) => i.action.closed_at);
    return {
      risk,
      openItems,
      repeats: repeatGroups(items, [selected], settings, at, shift),
      bySev: closureBySeverity(filtered),
      medianAll: median(closed.map((i) => (new Date(i.action.closed_at!).getTime() - new Date(i.report.created_at).getTime()) / 3_600_000)),
      closedCount: closed.length,
      total: filtered.length,
    };
  }, [items, selected, settings, shift, window, tick]);

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxxl }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {areas.map((a) => {
          const on = a.id === selected?.id;
          return (
            <Pressable
              key={a.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => router.setParams({ id: String(a.id) })}
              style={[styles.tab, { backgroundColor: on ? p.accent : p.surface, borderColor: on ? p.accent : p.border, borderWidth: p.borderWidth }]}
            >
              <T v="body" weight="semibold" color={on ? p.accentText : p.text}>
                {a.name}
              </T>
            </Pressable>
          );
        })}
      </ScrollView>

      <FilterBar />

      {selected && m ? (
        <>
          <Row gap={space.md} wrap align="stretch">
            <Stat label="Open" value={String(m.risk.openCount)} sub={`${SEVERITY_GLYPH.High}${m.risk.counts.High}  ${SEVERITY_GLYPH.Medium}${m.risk.counts.Medium}  ${SEVERITY_GLYPH.Low}${m.risk.counts.Low}`} tone={m.risk.level === 'none' ? undefined : severityColors(p, m.risk.level).fill} />
            <Stat label="Risk index" value={String(m.risk.score)} sub={`${m.risk.openWeight} open + ${m.risk.repeatFlags * settings.risk_weights.repeat} repeat + ${m.risk.openBreaches * settings.risk_weights.breach} breach`} />
            <Stat label="Open SLA breaches" value={String(m.risk.openBreaches)} tone={m.risk.openBreaches ? p.high : undefined} />
            <Stat label="Median time to close" value={m.medianAll == null ? '—' : `${m.medianAll.toFixed(1)} h`} sub={`${m.closedCount} closed of ${m.total} in window`} />
          </Row>

          <View style={{ flexDirection: wide ? 'row' : 'column', gap: space.lg, alignItems: 'flex-start' }}>
            <Card style={{ flex: wide ? 2 : undefined, width: wide ? undefined : '100%' }}>
              <SectionTitle>{`Open reports · ${selected.name}`}</SectionTitle>
              {m.openItems.length === 0 ? <Empty title="Nothing open" body="All reports in this area are closed for this window." /> : null}
              {m.openItems.map((i) => {
                const cd = countdownText(i.action, now);
                return (
                  <Pressable key={i.report.id} onPress={() => open(i.report.id)} style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.row, { backgroundColor: hovered ? p.raised : p.sunken, borderColor: p.border }]}>
                    <View style={{ width: 92 }}>
                      <T v="mono">{reportLabel(i.report.report_no)}</T>
                      <T v="micro" color="faint">
                        {ago(i.report.created_at, now)}
                      </T>
                    </View>
                    <SeverityBadge severity={i.report.severity} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <CategoryLabel category={i.report.category} />
                      <T v="micro" color="dim" numberOfLines={1}>
                        {i.report.summary ?? i.report.transcript}
                      </T>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <StatusChip status={i.action.status} />
                      <T v="micro" color={cd.overdue ? 'high' : 'dim'}>
                        {cd.text}
                      </T>
                    </View>
                  </Pressable>
                );
              })}
            </Card>

            <View style={{ flex: wide ? 1 : undefined, gap: space.lg, width: wide ? undefined : '100%' }}>
              <Card>
                <SectionTitle>{`Repeat hazards · ${settings.repeat_window_d} days`}</SectionTitle>
                {m.repeats.length === 0 ? (
                  <T v="small" color="dim">
                    No repeats in this area.
                  </T>
                ) : null}
                {m.repeats.map((g) => (
                  <Row key={g.category} between>
                    <CategoryLabel category={g.category} v="body" />
                    <Flag icon="repeat" label={`${g.count} in ${settings.repeat_window_d} days · ${g.openCount} open`} tone="warn" />
                  </Row>
                ))}
              </Card>
              <Card>
                <SectionTitle>Closure times (median)</SectionTitle>
                {(['High', 'Medium', 'Low'] as const).map((s) => (
                  <Row key={s} between>
                    <SeverityBadge severity={s} solid={false} />
                    <T v="mono">
                      {m.bySev[s] == null ? '—' : `${m.bySev[s]!.toFixed(1)} h`}
                      <T v="micro" color="faint">
                        {'  '}SLA {settings.sla[s].due_h} h
                      </T>
                    </T>
                  </Row>
                ))}
              </Card>
            </View>
          </View>
        </>
      ) : (
        <Empty title="No areas" />
      )}
    </ScrollView>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <Card style={{ flex: 1, minWidth: 170, gap: space.xs }} accent={tone}>
      <T v="label" color="dim">
        {label}
      </T>
      <T v="kpi" color={tone ?? 'text'}>
        {value}
      </T>
      {sub ? (
        <T v="micro" color="faint">
          {sub}
        </T>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  tab: { paddingHorizontal: 16, minHeight: 44, borderRadius: radius.pill, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1 },
});
