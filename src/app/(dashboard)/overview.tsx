// Overview: the plant at a glance. One sentence says what the plant's state is,
// numbers sit on a single ruled line, the area tiles are the hero, and every
// chart is coloured by severity. Updates live as reports arrive (Realtime).
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SevHBars, SevVolumeChart, ClosureVsTarget, RiskBars } from '@/charts/SevCharts';
import {
  applyFilters, areaRisk, attention, categoryMix, closureBySeverity, impact, isMerged, isOpen, kpis, ownerLoad, plantStatus, repeatGroups,
  shiftMix, slaCompliance, timeToAssignMinutes, volumeBySeverity,
} from '@/domain/metrics';
import { plantClock } from '@/domain/shift';
import { formatSeconds } from '@/domain/sla';
import { reportLabel, type AuditRow, type Item, type Severity } from '@/domain/types';
import { AssistantBriefing } from '@/features/assistant/Briefing';
import { FilterBar } from '@/features/dashboard/Filters';
import { useDash, WIDE } from '@/features/dashboard/store';
import { AreaTile, AttentionRow, Legend, NumbersLine, Panel, SevMark, StatusHeadline, type AreaTileData } from '@/features/dashboard/widgets';
import { useAuth } from '@/lib/auth';
import { useAreas, useFeed, useItems, useNow, useSettings, useUserName } from '@/lib/queries';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { CATEGORY_ICON } from '@/ui/Badges';
import { Icon, type IconName } from '@/ui/Icon';
import { Empty } from '@/ui/Layout';
import { T } from '@/ui/Text';

// Site order: process units first, then logistics and services.
const PROCESS = ['TANK', 'REACT', 'DIST', 'UTIL'];
const SUPPORT = ['LOAD', 'WARE', 'ETP', 'WKSP'];
const RANK: Record<Severity, number> = { High: 3, Medium: 2, Low: 1 };

export default function Overview() {
  const { p } = useTheme();
  const { me } = useAuth();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const narrow = width < 640;
  const { items } = useItems();
  const { data: areas } = useAreas();
  const settings = useSettings();
  const now = useNow(30_000);
  const userName = useUserName();
  const { shift, window } = useDash();
  const open = useDash((s) => s.open);
  const tick = Math.floor(now.getTime() / 30_000);
  const isEhs = me?.role === 'ehs';

  const m = useMemo(() => {
    const at = new Date(tick * 30_000);
    const all = areas ?? [];
    // Live state (what is open right now) ignores the time window; the shift filter still applies.
    const live = items.filter((i) => !isMerged(i) && (shift === 'All' || i.report.shift === shift));
    const filtered = applyFilters(items, { shift, window }, at);
    const closed = filtered.filter((i) => i.action.closed_at);
    const bySev = (s: Severity) => closed.filter((i) => (i.report.severity ?? 'Medium') === s).length;
    return {
      at,
      live,
      status: plantStatus(live, all, at),
      attention: attention(live, at, 6),
      close7: kpis(applyFilters(items, { shift, window: '7d' }, at), at),
      sla: slaCompliance(filtered, at),
      assign: timeToAssignMinutes(filtered),
      risk: areaRisk(filtered, all, settings, at),
      volume: volumeBySeverity(filtered, window, at),
      cats: categoryMix(filtered).slice(0, 6),
      shifts: shiftMix(filtered),
      closure: closureBySeverity(filtered),
      closedCounts: { High: bySev('High'), Medium: bySev('Medium'), Low: bySev('Low') } as Record<Severity, number>,
      repeats: repeatGroups(items, all, settings, at, shift),
      impact: impact(shift === 'All' ? items : items.filter((i) => i.report.shift === shift), settings, at),
      load: ownerLoad(live, at),
    };
  }, [items, areas, settings, shift, window, tick]);

  const notMine = useMemo(
    () => new Set(me?.role === 'supervisor' ? (areas ?? []).filter((a) => a.supervisor_id !== me.id).map((a) => a.id) : []),
    [areas, me],
  );
  const areaName = (id: number) => areas?.find((a) => a.id === id)?.name ?? '';

  const tiles = useMemo(() => {
    const by = (codes: string[]): AreaTileData[] =>
      codes
        .map((c) => (areas ?? []).find((a) => a.code === c))
        .filter((a): a is NonNullable<typeof a> => !!a)
        .map((area) => {
          const openItems = m.live.filter((i) => i.report.area_id === area.id && isOpen(i));
          const worst = openItems.reduce<Severity | null>((w, i) => {
            const s = i.report.severity ?? 'Medium';
            return !w || RANK[s] > RANK[w] ? s : w;
          }, null);
          const overdue = openItems.filter((i) => i.action.breached_at != null || m.at.getTime() >= new Date(i.action.due_at).getTime()).length;
          return { area, open: openItems, worst, overdue, outOfScope: notMine.has(area.id) };
        });
    return { process: by(PROCESS), support: by(SUPPORT) };
  }, [areas, m.live, m.at, notMine]);

  const goArea = (id: number) => router.push({ pathname: '/areas', params: { id: String(id) } });
  const windowText = window === '24h' ? '24 hours' : window === '7d' ? '7 days' : '30 days';
  const scope = `${me?.role === 'supervisor' ? 'Your areas' : 'All areas'} of Plant X · ${shift === 'All' ? 'all shifts' : `shift ${shift}`} · open work is live, charts cover the last ${windowText}`;

  const nums = [
    { value: String(m.status.openCount), label: 'Open reports' },
    { value: String(m.status.highCount), label: 'High severity open', tone: m.status.highCount ? ('alarm' as const) : undefined },
    { value: String(m.status.overdueCount), label: 'Past due time', tone: m.status.overdueCount ? ('alarm' as const) : undefined },
    { value: m.close7.avgCloseHours == null ? '—' : m.close7.avgCloseHours.toFixed(1), unit: m.close7.avgCloseHours == null ? undefined : 'h', label: 'Average time to close, last 7 days' },
    { value: m.sla.rate == null ? '—' : String(Math.round(m.sla.rate * 100)), unit: m.sla.rate == null ? undefined : '%', label: 'Closed within target time', tone: m.sla.rate != null && m.sla.rate >= 0.9 ? ('good' as const) : undefined },
    { value: m.assign.median == null ? '—' : m.assign.median < 90 ? String(Math.round(m.assign.median)) : (m.assign.median / 60).toFixed(1), unit: m.assign.median == null ? undefined : m.assign.median < 90 ? 'min' : 'h', label: 'Median time to assign an owner' },
  ];

  const tileRow = (list: AreaTileData[]) => (
    <View style={styles.tileRow}>
      {list.map((d) => (
        <AreaTile key={d.area.id} d={d} now={m.at} narrow={narrow} onPress={() => goArea(d.area.id)} />
      ))}
    </View>
  );

  const riskRows = m.risk
    .filter((r) => !notMine.has(r.area.id))
    .map((r) => ({
      id: r.area.id,
      name: r.area.name,
      score: r.score,
      worst: r.level === 'none' ? null : r.level,
      detail: `${r.openCount} open, ${r.repeatFlags} repeats, ${r.openBreaches} overdue`,
    }));
  const w = settings.risk_weights;
  const cell = (flex: number) => ({ flexGrow: flex, flexShrink: 1, flexBasis: narrow ? '100%' : 340, minWidth: narrow ? 0 : 300 }) as const;

  return (
    <ScrollView contentContainerStyle={{ alignItems: 'center' }}>
      <View style={[styles.page, { padding: narrow ? space.md : space.xl, gap: space.lg }]}>
        <View style={{ flexDirection: wide ? 'row' : 'column', justifyContent: 'space-between', alignItems: wide ? 'flex-end' : 'stretch', gap: space.lg }}>
          <View style={{ flex: 1, gap: space.md }}>
            <View style={styles.pageTitleRow}>
              <View style={[styles.pageTitleIcon, { backgroundColor: p.accentSoft }]}>
                <Icon name="view-dashboard-outline" size={19} color={p.accent} />
              </View>
              <View style={{ gap: 1 }}>
                <T v="label" color="dim">PLANT X · OPERATIONS</T>
                <T v="h1" weight="bold">Overview</T>
              </View>
              <View style={[styles.roleBadge, { backgroundColor: p.raised, borderColor: p.border }]}>
                <T v="small" weight="semibold" color="dim">{isEhs ? 'EHS lead' : 'Supervisor'}</T>
              </View>
            </View>
            <StatusHeadline high={m.status.highCount} highAreas={m.status.highAreas} overdue={m.status.overdueCount} scope={scope} />
          </View>
          <FilterBar />
        </View>

        <AssistantBriefing />

        <NumbersLine nums={nums} narrow={narrow} />

        <View style={{ flexDirection: wide ? 'row' : 'column', gap: space.lg, alignItems: 'flex-start' }}>
          <View style={{ flex: wide ? 1.75 : undefined, width: wide ? undefined : '100%' }}>
            <Panel title="Plant areas" right={<Legend items={[{ sev: 'High', label: 'High' }, { sev: 'Medium', label: 'Medium' }, { sev: 'Low', label: 'Low' }, { sev: 'none', label: 'Nothing open' }]} />}>
              <T v="label" color="dim">
                Process units
              </T>
              {tileRow(tiles.process)}
              <T v="label" color="dim" style={{ marginTop: space.sm }}>
                Logistics and services
              </T>
              {tileRow(tiles.support)}
            </Panel>
          </View>
          <View style={{ flex: wide ? 1 : undefined, width: wide ? undefined : '100%' }}>
            <Panel title="Needs attention" meta="Most urgent first" pad={false}>
              {m.attention.length === 0 ? (
                <View style={{ padding: space.lg }}>
                  <Empty title="Nothing needs attention" body="No high-severity, overdue, escalated or untriaged reports." />
                </View>
              ) : (
                m.attention.map((e, i) => (
                  <AttentionRow key={e.item.report.id} entry={e} first={i === 0} now={m.at} areaName={areaName(e.item.report.area_id)} onPress={() => open(e.item.report.id)} />
                ))
              )}
              <Pressable onPress={() => router.push('/inbox')} accessibilityRole="link" style={[styles.footLink, { borderTopColor: p.border }]}>
                <T v="body" weight="semibold" color="accent">
                  Open the inbox ({m.live.filter((i) => i.action.status === 'New' && i.action.merged_into == null).length} new)
                </T>
              </Pressable>
            </Panel>
          </View>
        </View>

        <View style={[styles.grid, { gap: space.lg }]}>
          <Panel title="Reports over time" meta={window === '30d' ? 'Per week' : window === '7d' ? 'Per day' : 'Per 4 hours'} right={<Legend />} style={cell(1.4)}>
            <SevVolumeChart rows={m.volume} />
          </Panel>
          <Panel title="Risk by area" meta="Open work, repeats, overdue" style={cell(1)}>
            <RiskBars rows={riskRows} onPress={goArea} />
            <T v="small" color="faint">
              Score = open reports (High {w.High}, Medium {w.Medium}, Low {w.Low}) + {w.repeat} per repeat + {w.breach} per overdue action. Bar colour is the worst severity open.
            </T>
          </Panel>
        </View>

        <View style={[styles.grid, { gap: space.lg }]}>
          <Panel title="By hazard type" right={<Legend />} style={cell(1)}>
            {m.cats.length ? <SevHBars rows={m.cats.map((c) => ({ key: c.category, label: c.category, sev: c.sev, total: c.total }))} labelWidth={132} /> : <T color="dim">No reports in this window.</T>}
          </Panel>
          <Panel title="By shift" meta="Which shift raises the most" style={cell(0.8)}>
            <SevHBars rows={m.shifts.map((s) => ({ key: s.shift, label: `Shift ${s.shift}`, sev: s.sev, total: s.total }))} labelWidth={74} />
            <T v="small" color="faint">
              A 06–14, B 14–22, C 22–06.
            </T>
          </Panel>
          <Panel title="Time to close" meta="Median against target" style={cell(1)}>
            <ClosureVsTarget median={m.closure} sla={settings.sla} counts={m.closedCounts} />
          </Panel>
        </View>

        <View style={[styles.grid, { gap: space.lg }]}>
          <Panel title="Repeat hazards" meta={`Same area and type, ${settings.repeat_window_d} days`} style={cell(1)}>
            {m.repeats.length === 0 ? <T color="dim">No repeats.</T> : null}
            {m.repeats.map((g) => (
              <Pressable key={`${g.area.id}${g.category}`} onPress={() => goArea(g.area.id)} accessibilityRole="button" style={styles.repeatRow}>
                <Icon name={CATEGORY_ICON[g.category]} size={22} color={p.medium} />
                <View style={{ flex: 1 }}>
                  <T v="body" weight="semibold">
                    {g.category}
                  </T>
                  <T v="small" color="dim">
                    {g.area.name} · {g.openCount} still open
                  </T>
                </View>
                <T v="h1" color="medium">
                  {g.count}×
                </T>
              </Pressable>
            ))}
          </Panel>
          {isEhs ? (
            <Panel title="Team workload" meta="Open work per supervisor" style={cell(1.2)}>
              {m.load.length === 0 ? <T color="dim">No open work is assigned.</T> : null}
              {m.load.map((o) => (
                <View key={o.ownerId} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <T v="body" weight="semibold">
                      {userName(o.ownerId)}
                    </T>
                    <T v="small" color={o.overdue ? 'high' : 'dim'} weight={o.overdue ? 'semibold' : 'regular'}>
                      {o.open} open{o.overdue ? `, ${o.overdue} overdue` : ''}
                    </T>
                  </View>
                  <SevHBars rows={[{ key: o.ownerId, label: '', sev: o.sev, total: o.open }]} labelWidth={0} max={Math.max(...m.load.map((x) => x.open))} />
                </View>
              ))}
            </Panel>
          ) : null}
          <Panel title="Reporting speed" meta="Measured on the phone" style={cell(1)}>
            <View style={{ flexDirection: 'row', gap: space.xl, flexWrap: 'wrap' }}>
              <View>
                <T v="kpi">{m.impact.medianReportSeconds == null ? '—' : formatSeconds(m.impact.medianReportSeconds)}</T>
                <T v="small" color="dim">
                  Median time to report
                </T>
              </View>
              <View>
                <T v="kpi">{m.impact.minutesSavedPerWeek == null ? '—' : (m.impact.minutesSavedPerWeek / 60).toFixed(1)}</T>
                <T v="small" color="dim">
                  Hours saved per week
                </T>
              </View>
            </View>
            <T v="small" color="faint">
              {m.impact.weeklyReports} reports this week, each saving the difference between {m.impact.paperMinutes} minutes on paper (an assumption) and the measured time. Seeded history is simulated and Plant X is fictional.
            </T>
          </Panel>
        </View>

        <LiveActivity items={items} />
      </View>
    </ScrollView>
  );
}

const FEED: Record<string, { icon: IconName; label: string }> = {
  created: { icon: 'plus-circle-outline', label: 'New report' },
  ai_classified: { icon: 'robot-outline', label: 'Sorted by AI' },
  assigned: { icon: 'account-arrow-right-outline', label: 'Assigned' },
  escalated: { icon: 'arrow-up-bold-circle', label: 'Escalated' },
  sla_breached: { icon: 'timer-alert', label: 'Past due time' },
  closed: { icon: 'check-decagram', label: 'Closed' },
  demo_clock: { icon: 'fast-forward', label: 'Demo clock' },
  demo_reset: { icon: 'restore', label: 'Demo reset' },
};

function LiveActivity({ items }: { items: Item[] }) {
  const { p } = useTheme();
  const { data } = useFeed();
  const open = useDash((s) => s.open);
  const { data: areas } = useAreas();
  const now = useNow(10_000);
  const byId = useMemo(() => new Map(items.map((i) => [i.report.id, i])), [items]);
  const rows = (data ?? []).slice(0, 8);
  const text = (row: AuditRow) => {
    const it = row.report_id ? byId.get(Number(row.report_id)) : undefined;
    const area = it ? areas?.find((a) => a.id === it.report.area_id)?.name : undefined;
    const n = (row.new_value ?? {}) as Record<string, unknown>;
    if (row.action_type === 'demo_clock') return `Clock moved to +${Math.round(Number(n.demo_offset_minutes) / 60)} h`;
    if (row.action_type === 'demo_reset') return `Seed restored, ${n.reports} reports`;
    return [it ? reportLabel(it.report.report_no) : null, it?.report.title ?? it?.report.summary, area].filter(Boolean).join(' · ');
  };
  return (
    <Panel title="Live activity" meta="Updates as it happens" right={<View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: p.clear }} />} pad={false}>
      {rows.length === 0 ? (
        <View style={{ padding: space.lg }}>
          <Empty title="Quiet" body="New reports and escalations appear here as they arrive." />
        </View>
      ) : null}
      {rows.map((row, i) => {
        const f = FEED[row.action_type] ?? FEED.created;
        const it = row.report_id ? byId.get(Number(row.report_id)) : undefined;
        const fresh = now.getTime() - new Date(row.ts).getTime() < 2 * 60_000;
        return (
          <Pressable
            key={row.id}
            disabled={!row.report_id}
            onPress={() => row.report_id && open(Number(row.report_id))}
            style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.feedRow, { borderTopWidth: i ? 1 : 0, borderTopColor: p.border, backgroundColor: fresh ? p.accentSoft : hovered ? p.raised : 'transparent' }]}
          >
            <Icon name={f.icon} size={20} color={row.action_type === 'escalated' ? p.escalated : row.action_type === 'sla_breached' ? p.high : p.textDim} />
            <T v="body" weight="semibold" style={{ width: 118 }}>
              {f.label}
            </T>
            <T v="body" color="dim" numberOfLines={1} style={{ flex: 1 }}>
              {text(row)}
            </T>
            {it?.report.severity ? <SevMark severity={it.report.severity} size={20} /> : null}
            <T v="mono" color="faint">
              {plantClock(new Date(row.ts))}
            </T>
          </Pressable>
        );
      })}
    </Panel>
  );
}

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 1560 },
  pageTitleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.xs },
  pageTitleIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  roleBadge: { marginLeft: space.sm, paddingHorizontal: space.md, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1 },
  tileRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' },
  footLink: { padding: space.lg, borderTopWidth: 1 },
  repeatRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 4 },
  feedRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10, paddingHorizontal: space.lg },
});
