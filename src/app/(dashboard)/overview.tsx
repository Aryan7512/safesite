// Overview (PRD §6) — the main demo surface. Every widget has a defined data
// source in src/domain/metrics.ts; nothing is decorative.
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { HBar, SpeedChart, VolumeChart } from '@/charts/Charts';
import { PlantHeatmap } from '@/charts/PlantHeatmap';
import {
  applyFilters, areaRisk, impact, kpis, repeatGroups, slaCompliance, speedTrend, volumeTrend, type AreaRisk,
} from '@/domain/metrics';
import { plantClock } from '@/domain/shift';
import { formatSeconds } from '@/domain/sla';
import { reportLabel, type AuditRow, type Item } from '@/domain/types';
import { FilterBar } from '@/features/dashboard/Filters';
import { useDash, WIDE } from '@/features/dashboard/store';
import { useAuth } from '@/lib/auth';
import { useAreas, useFeed, useItems, useNow, useSettings } from '@/lib/queries';
import { radius, SEVERITY_GLYPH, severityColors, space } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { CATEGORY_ICON } from '@/ui/Badges';
import { Icon, type IconName } from '@/ui/Icon';
import { Card, Empty, Row, SectionTitle } from '@/ui/Layout';
import { T } from '@/ui/Text';

export default function Overview() {
  const { p } = useTheme();
  const { me } = useAuth();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const { items } = useItems();
  const { data: areas } = useAreas();
  const settings = useSettings();
  const now = useNow(30_000);
  // Recompute at most once per minute.
  const tick = Math.floor(now.getTime() / 60_000);
  const { shift, window } = useDash();

  const m = useMemo(() => {
    const at = new Date(tick * 60_000);
    const filtered = applyFilters(items, { shift, window }, at);
    return {
      filtered,
      kpi: kpis(filtered, at),
      // PRD §6: average time-to-close is always over the last 7 days.
      close7: kpis(applyFilters(items, { shift, window: '7d' }, at), at),
      risk: areaRisk(filtered, areas ?? [], settings, at),
      repeats: repeatGroups(items, areas ?? [], settings, at, shift),
      volume: volumeTrend(filtered, window, at),
      speed: speedTrend(filtered, window, at),
      sla: slaCompliance(filtered, at),
      impact: impact(shift === 'All' ? items : items.filter((i) => i.report.shift === shift), settings, at),
    };
  }, [items, areas, settings, shift, window, tick]);

  // RLS scope made visible: a supervisor only sees their own areas.
  const notMine = useMemo(
    () => new Set(me?.role === 'supervisor' ? (areas ?? []).filter((a) => a.supervisor_id !== me.id).map((a) => a.id) : []),
    [areas, me],
  );

  const heat = (
    <Card>
      <SectionTitle right={<Legend />}>Plant heatmap · highest open severity</SectionTitle>
      <PlantHeatmap risks={m.risk} notMine={notMine} onZonePress={(id) => router.push({ pathname: '/areas', params: { id: String(id) } })} />
    </Card>
  );

  const left = (
    <View style={{ gap: space.lg, flex: wide ? 2 : undefined }}>
      {heat}
      <Row gap={space.lg} align="stretch" wrap={!wide}>
        <Card style={{ flex: 1, minWidth: 300 }}>
          <SectionTitle>{`Volume by category · per ${window === '30d' ? 'week' : window === '7d' ? 'day' : '4 h'}`}</SectionTitle>
          <VolumeChart rows={m.volume} />
        </Card>
        <Card style={{ flex: 1, minWidth: 300 }}>
          <SectionTitle>Speed</SectionTitle>
          <SpeedChart rows={m.speed} />
        </Card>
      </Row>
    </View>
  );

  const right = (
    <View style={{ gap: space.lg, flex: wide ? 1 : undefined, minWidth: wide ? 340 : undefined }}>
      <LiveFeed items={items} />
      <RiskIndex risk={m.risk.filter((r) => !notMine.has(r.area.id))} />
      <Card>
        <SectionTitle>{`Repeat hazards · last ${settings.repeat_window_d} days`}</SectionTitle>
        {m.repeats.length === 0 ? <T color="dim">No repeats.</T> : null}
        {m.repeats.map((g) => (
          <Pressable
            key={`${g.area.id}${g.category}`}
            onPress={() => router.push({ pathname: '/areas', params: { id: String(g.area.id) } })}
            style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.listRow, { backgroundColor: hovered ? p.raised : p.sunken, borderColor: p.border }]}
          >
            <Icon name={CATEGORY_ICON[g.category]} color={p.medium} />
            <View style={{ flex: 1 }}>
              <T v="body" weight="semibold">
                {g.area.name} · {g.category}
              </T>
              <T v="small" color="dim">
                {g.count} reports in {settings.repeat_window_d} days · {g.openCount} open · open or closed counted
              </T>
            </View>
            <View style={[styles.repeatBadge, { backgroundColor: p.mediumSoft, borderColor: p.medium }]}>
              <T v="h3" color={p.name === 'daylight' ? p.text : p.medium}>
                ×{g.count}
              </T>
            </View>
          </Pressable>
        ))}
      </Card>
      <ImpactCard impact={m.impact} sla={m.sla} />
    </View>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxxl }}>
      <FilterBar note={`${m.filtered.length} reports in view${me?.role === 'supervisor' ? ' · your 5 areas' : ' · all areas'} · seed data is simulated`} />
      <Row gap={space.md} wrap align="stretch">
        <Kpi label="Open reports" value={String(m.kpi.open)} icon="folder-open-outline" />
        <Kpi label="High open" value={String(m.kpi.highOpen)} icon="alert-octagon-outline" tone={m.kpi.highOpen ? p.high : undefined} />
        <Kpi label="SLA breaches (open)" value={String(m.kpi.breaches)} icon="timer-alert-outline" tone={m.kpi.breaches ? p.high : undefined} />
        <Kpi
          label="Avg time to close (7 d)"
          value={m.close7.avgCloseHours == null ? '—' : `${m.close7.avgCloseHours.toFixed(1)} h`}
          sub={`${m.close7.closedCount} closed in last 7 days`}
          icon="timer-check-outline"
        />
      </Row>
      {wide ? (
        <Row gap={space.lg} align="flex-start">
          {left}
          {right}
        </Row>
      ) : (
        <>
          {left}
          {right}
        </>
      )}
    </ScrollView>
  );
}

function Kpi({ label, value, sub, icon, tone }: { label: string; value: string; sub?: string; icon: IconName; tone?: string }) {
  const { p } = useTheme();
  return (
    <Card style={{ flex: 1, minWidth: 160, gap: space.xs }} accent={tone}>
      <Row between>
        <T v="label" color="dim">
          {label}
        </T>
        <Icon name={icon} size={20} color={tone ?? p.textFaint} />
      </Row>
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

function Legend() {
  const { p } = useTheme();
  const entries = [
    { k: 'High' as const, label: '▲ High' },
    { k: 'Medium' as const, label: '◆ Medium' },
    { k: 'Low' as const, label: '● Low' },
    { k: 'none' as const, label: '✓ Clear' },
  ];
  return (
    <Row gap={space.md} wrap>
      {entries.map((e) => (
        <Row key={e.k} gap={4}>
          <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: e.k === 'none' ? p.zoneNone : severityColors(p, e.k).fill, borderWidth: e.k === 'none' ? 1.5 : 0, borderColor: p.clear }} />
          <T v="micro" color="dim">
            {e.label}
          </T>
        </Row>
      ))}
    </Row>
  );
}

function RiskIndex({ risk }: { risk: AreaRisk[] }) {
  const { p } = useTheme();
  const settings = useSettings();
  const [openId, setOpenId] = useState<number | null>(null);
  const max = Math.max(1, ...risk.map((r) => r.score));
  const w = settings.risk_weights;
  return (
    <Card>
      <SectionTitle>Risk index per area</SectionTitle>
      <T v="micro" color="faint">
        Current-risk index, not a prediction. Σ open (High {w.High} · Medium {w.Medium} · Low {w.Low}) + {w.repeat} × repeat flag + {w.breach} × open breach. Tap a row
        for its inputs.
      </T>
      {risk.map((r, i) => {
        const open = openId === r.area.id;
        const color = r.level === 'none' ? p.clear : severityColors(p, r.level).fill;
        return (
          <Pressable key={r.area.id} onPress={() => setOpenId(open ? null : r.area.id)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ gap: space.xs }}>
            <Row gap={space.sm}>
              <T v="mono" color="faint" style={{ width: 18 }}>
                {i + 1}
              </T>
              <T v="small" weight="semibold" style={{ width: 128 }} numberOfLines={1}>
                {r.area.name}
              </T>
              <HBar value={r.score} max={max} color={color} />
              <T v="mono" style={{ width: 30, textAlign: 'right' }}>
                {r.score}
              </T>
            </Row>
            {open ? (
              <View style={[styles.components, { backgroundColor: p.sunken, borderColor: p.border }]}>
                <Component label={`Open reports (${SEVERITY_GLYPH.High}${r.counts.High} ${SEVERITY_GLYPH.Medium}${r.counts.Medium} ${SEVERITY_GLYPH.Low}${r.counts.Low})`} value={r.openWeight} />
                <Component label={`Repeat flags × ${w.repeat}`} value={r.repeatFlags * w.repeat} detail={`${r.repeatFlags}`} />
                <Component label={`Open SLA breaches × ${w.breach}`} value={r.openBreaches * w.breach} detail={`${r.openBreaches}`} />
                <Row between style={{ borderTopWidth: 1, borderTopColor: p.border, paddingTop: 6 }}>
                  <T v="small" weight="bold">
                    Risk index
                  </T>
                  <T v="mono">{r.score}</T>
                </Row>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </Card>
  );
}

function Component({ label, value, detail }: { label: string; value: number; detail?: string }) {
  return (
    <Row between>
      <T v="small" color="dim">
        {label}
        {detail ? ` · ${detail}` : ''}
      </T>
      <T v="mono">{value}</T>
    </Row>
  );
}

const FEED: Record<string, { icon: IconName; label: string; tone: 'accent' | 'high' | 'escalated' | 'clear' | 'dim' }> = {
  created: { icon: 'plus-circle-outline', label: 'New', tone: 'accent' },
  ai_classified: { icon: 'robot-outline', label: 'Classified', tone: 'dim' },
  assigned: { icon: 'account-arrow-right-outline', label: 'Assigned', tone: 'dim' },
  escalated: { icon: 'arrow-up-bold-circle', label: 'Escalated', tone: 'escalated' },
  sla_breached: { icon: 'timer-alert', label: 'SLA breach', tone: 'high' },
  closed: { icon: 'check-decagram', label: 'Closed', tone: 'clear' },
  demo_clock: { icon: 'fast-forward', label: 'Demo clock', tone: 'escalated' },
  demo_reset: { icon: 'restore', label: 'Demo reset', tone: 'dim' },
};

function LiveFeed({ items }: { items: Item[] }) {
  const { p } = useTheme();
  const { data } = useFeed();
  const open = useDash((s) => s.open);
  const now = useNow(10_000);
  const { data: areas } = useAreas();
  const byId = useMemo(() => new Map(items.map((i) => [i.report.id, i])), [items]);
  const shift = useDash((st) => st.shift);
  // Shift filter applies here too (PRD §6: filters every widget).
  const rows = (data ?? [])
    .filter((r) => shift === 'All' || !r.report_id || byId.get(Number(r.report_id))?.report.shift === shift)
    .slice(0, 9);

  const line = (row: AuditRow) => {
    const it = row.report_id ? byId.get(Number(row.report_id)) : undefined;
    const area = it ? areas?.find((a) => a.id === it.report.area_id)?.name : undefined;
    const n = (row.new_value ?? {}) as Record<string, unknown>;
    if (row.action_type === 'demo_clock') return `Clock moved to +${Math.round(Number(n.demo_offset_minutes) / 60)} h`;
    if (row.action_type === 'demo_reset') return `Seed restored · ${n.reports} reports`;
    const parts = [it ? reportLabel(it.report.report_no) : `#${row.report_id}`, area];
    if (row.action_type === 'ai_classified') parts.push(`${n.ai_category ?? ''} · ${n.severity ?? ''}`);
    if (row.action_type === 'created' && it?.report.severity) parts.push(it.report.severity);
    if (row.action_type === 'escalated') parts.push('to EHS Lead');
    return parts.filter(Boolean).join(' · ');
  };

  return (
    <Card>
      <SectionTitle right={<View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.clear }} />}>Live feed</SectionTitle>
      {rows.length === 0 ? <Empty title="Quiet" body="New reports and escalations appear here as they happen." /> : null}
      {rows.map((row) => {
        const f = FEED[row.action_type] ?? FEED.created;
        const fresh = now.getTime() - new Date(row.ts).getTime() < 2 * 60_000;
        const color = f.tone === 'accent' ? p.accent : f.tone === 'high' ? p.high : f.tone === 'escalated' ? p.escalated : f.tone === 'clear' ? p.clear : p.textDim;
        return (
          <Pressable
            key={row.id}
            disabled={!row.report_id}
            onPress={() => row.report_id && open(Number(row.report_id))}
            style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.feedRow, { backgroundColor: fresh ? p.accentSoft : hovered ? p.raised : 'transparent' }]}
          >
            <Icon name={f.icon} size={20} color={color} />
            <View style={{ flex: 1 }}>
              <T v="small" weight="semibold">
                {f.label}
              </T>
              <T v="micro" color="dim" numberOfLines={1}>
                {line(row)}
              </T>
            </View>
            <T v="mono" color="faint">
              {plantClock(new Date(row.ts))}
            </T>
          </Pressable>
        );
      })}
    </Card>
  );
}

function ImpactCard({ impact: im, sla }: { impact: ReturnType<typeof impact>; sla: ReturnType<typeof slaCompliance> }) {
  const { p } = useTheme();
  const hoursSaved = im.minutesSavedPerWeek != null ? im.minutesSavedPerWeek / 60 : null;
  return (
    <Card accent={p.accent}>
      <SectionTitle>Impact indicator</SectionTitle>
      <Row gap={space.lg} wrap>
        <View style={{ gap: 2 }}>
          <T v="micro" color="dim">
            Median time to report
          </T>
          <T v="kpi">{im.medianReportSeconds == null ? '—' : formatSeconds(im.medianReportSeconds)}</T>
          <T v="micro" color="faint">
            on-screen timer · seed values simulated · vs ~{im.paperMinutes} min on paper (assumption)
          </T>
        </View>
        <View style={{ gap: 2 }}>
          <T v="micro" color="dim">
            Time saved / week
          </T>
          <T v="kpi">{hoursSaved == null ? '—' : `${hoursSaved.toFixed(1)} h`}</T>
          <T v="micro" color="faint">
            {im.weeklyReports} reports this week
          </T>
        </View>
        <View style={{ gap: 2 }}>
          <T v="micro" color="dim">
            SLA compliance
          </T>
          <T v="kpi">{sla.rate == null ? '—' : `${Math.round(sla.rate * 100)}%`}</T>
          <T v="micro" color="faint">
            of {sla.resolved} resolved · simulated
          </T>
        </View>
      </Row>
      <T v="micro" color="faint">
        {im.weeklyReports} reports × ({im.paperMinutes} min − {im.medianReportSeconds == null ? '?' : (im.medianReportSeconds / 60).toFixed(1)} min) = {im.minutesSavedPerWeek ?? '?'} min. Fictional plant, stated
        assumptions; same reporting volume assumed.
      </T>
    </Card>
  );
}

const styles = StyleSheet.create({
  listRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1 },
  repeatBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.md, borderWidth: 1 },
  components: { gap: 4, padding: space.md, borderRadius: radius.md, borderWidth: 1, marginLeft: 26 },
  feedRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 8, paddingHorizontal: 8, borderRadius: radius.md },
});

