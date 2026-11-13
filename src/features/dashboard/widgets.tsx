// Shared dashboard building blocks (the "plant control screen" look):
// quiet grey surfaces, ruled sections instead of boxes, and colour only for
// severity. Severity is always shape + colour + word.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path, Rect, Text as SvgText } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import type { AttentionItem, AttentionReason } from '@/domain/metrics';
import { isBreached } from '@/domain/metrics';
import { countdownText, formatDuration } from '@/domain/sla';
import { reportLabel, type AreaRow, type Item, type Severity } from '@/domain/types';
import { MONO } from '@/theme/fonts';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { T } from '@/ui/Text';

export const SEV_ORDER: Severity[] = ['High', 'Medium', 'Low'];
export const SEV_RANK: Record<Severity, number> = { High: 3, Medium: 2, Low: 1 };

export function useSevColor() {
  const { p } = useTheme();
  return (s: Severity | null | 'none') => (s === 'High' ? p.high : s === 'Medium' ? p.medium : s === 'Low' ? p.low : p.clear);
}

/** Triangle = High, diamond = Medium, circle = Low, with the count inside. */
export function SevMark({ severity, n, size = 28 }: { severity: Severity | null; n?: number | string; size?: number }) {
  const { p } = useTheme();
  const s = size;
  const label = n != null ? String(n) : '';
  const fs = s * 0.52;
  if (severity === 'High') {
    return (
      <Svg width={s} height={s * 0.94} viewBox="0 0 30 28" accessibilityLabel={`High${label ? ` ${label}` : ''}`}>
        <Path d="M15 1 L29 27 H1 Z" fill={p.high} />
        {label ? <SvgText x="15" y="23" textAnchor="middle" fontSize="15" fontWeight="700" fill={p.onHigh}>{label}</SvgText> : null}
      </Svg>
    );
  }
  if (severity === 'Medium') {
    return (
      <Svg width={s} height={s} viewBox="0 0 28 28" accessibilityLabel={`Medium${label ? ` ${label}` : ''}`}>
        <Rect x="5" y="5" width="18" height="18" transform="rotate(45 14 14)" fill={p.medium} />
        {label ? <SvgText x="14" y="19" textAnchor="middle" fontSize="14" fontWeight="700" fill={p.onMedium}>{label}</SvgText> : null}
      </Svg>
    );
  }
  if (severity === 'Low') {
    return (
      <Svg width={s} height={s} viewBox="0 0 28 28" accessibilityLabel={`Low${label ? ` ${label}` : ''}`}>
        <Circle cx="14" cy="14" r="11.5" fill={p.low} />
        {label ? <SvgText x="14" y="19" textAnchor="middle" fontSize="14" fontWeight="700" fill={p.onLow}>{label}</SvgText> : null}
      </Svg>
    );
  }
  return (
    <Svg width={s} height={s} viewBox="0 0 28 28" accessibilityLabel="Unclassified">
      <Circle cx="14" cy="14" r="11" fill="none" stroke={p.borderStrong} strokeWidth="2" strokeDasharray="4 3" />
      <SvgText x="14" y="19" textAnchor="middle" fontSize={fs} fontWeight="700" fill={p.textDim}>?</SvgText>
    </Svg>
  );
}

/** A flat panel: hairline border, small radius, no shadow, no decoration. */
export function Panel({
  title, meta, right, children, style, pad = true,
}: { title?: string; meta?: string; right?: ReactNode; children: ReactNode; style?: StyleProp<ViewStyle>; pad?: boolean }) {
  const { p } = useTheme();
  return (
    <View style={[{
      backgroundColor: p.surface,
      borderColor: p.border,
      borderWidth: 1,
      borderRadius: radius.md,
      overflow: 'hidden',
      shadowColor: '#182432',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: p.name === 'control' ? 0 : 0.055,
      shadowRadius: 8,
      elevation: p.name === 'control' ? 0 : 1,
    }, style]}>
      {title ? (
        <View style={[styles.panelHead, { borderBottomColor: p.border }]}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: space.sm, flexWrap: 'wrap' }}>
            <T v="h2" weight="bold">{title}</T>
            {meta ? (
              <T v="small" color="faint">
                {meta}
              </T>
            ) : null}
          </View>
          {right}
        </View>
      ) : null}
      <View style={pad ? { padding: space.lg, gap: space.md } : undefined}>{children}</View>
    </View>
  );
}

export function Legend({ items }: { items?: { sev: Severity | 'none'; label: string }[] }) {
  const { p } = useTheme();
  const list = items ?? [
    { sev: 'High' as const, label: 'High' },
    { sev: 'Medium' as const, label: 'Medium' },
    { sev: 'Low' as const, label: 'Low' },
  ];
  return (
    <View style={{ flexDirection: 'row', gap: space.lg, flexWrap: 'wrap', alignItems: 'center' }}>
      {list.map((l) => (
        <View key={l.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {l.sev === 'none' ? (
            <View style={{ width: 14, height: 12, borderWidth: 1.5, borderColor: p.borderStrong, borderRadius: 2 }} />
          ) : (
            <SevMark severity={l.sev} size={16} />
          )}
          <T v="small" color="dim">
            {l.label}
          </T>
        </View>
      ))}
    </View>
  );
}

// ─── Plant status: one sentence, then a ruled line of numbers ───────────────
export function StatusHeadline({
  high, highAreas, overdue, scope,
}: { high: number; highAreas: string[]; overdue: number; scope: string }) {
  const { p } = useTheme();
  const areas = highAreas.length === 0 ? '' : highAreas.length === 1 ? highAreas[0] : `${highAreas.slice(0, -1).join(', ')} and ${highAreas[highAreas.length - 1]}`;
  const calm = high === 0 && overdue === 0;
  const sentence = calm
    ? 'No high-severity hazards are open and nothing is past its due time.'
    : [
        high > 0 ? `${high === 1 ? 'A high-severity hazard is' : `${high} high-severity hazards are`} open${areas ? ` in ${areas}` : ''}` : null,
        overdue > 0 ? `${overdue === 1 ? '1 action is' : `${overdue} actions are`} past ${overdue === 1 ? 'its' : 'their'} due time` : null,
      ]
        .filter(Boolean)
        .join(', and ') + '.';
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md }}>
        <View style={{ paddingTop: 5 }}>{calm ? <SevMark severity={null} size={30} /> : <SevMark severity="High" n={high || overdue} size={32} />}</View>
        <T v="h1" style={{ flex: 1, color: calm ? p.text : p.text }} accessibilityRole="header" accessibilityLiveRegion="polite">
          {sentence}
        </T>
      </View>
      <T v="body" color="dim">
        {scope}
      </T>
    </View>
  );
}

export interface Num {
  value: string;
  unit?: string;
  label: string;
  tone?: 'alarm' | 'good';
}

export function NumbersLine({ nums, narrow }: { nums: Num[]; narrow: boolean }) {
  const { p } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: narrow ? space.sm : space.md }}>
      {nums.map((n, i) => {
        return (
          <View
            key={n.label}
            style={{
              flexGrow: 1,
              flexBasis: narrow ? '46%' : 145,
              minHeight: narrow ? 106 : 122,
              padding: narrow ? space.md : space.lg,
              borderWidth: 1,
              borderColor: p.border,
              borderRadius: radius.md,
              backgroundColor: p.surface,
              justifyContent: 'center',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
              <T v="kpi" color={n.tone === 'alarm' ? 'high' : n.tone === 'good' ? 'clear' : 'text'} style={{ fontSize: narrow ? 34 : 40, lineHeight: narrow ? 38 : 44 }}>
                {n.value}
              </T>
              {n.unit ? (
                <T v="h2" color="dim">
                  {n.unit}
                </T>
              ) : null}
            </View>
            <T v="small" color="dim" style={{ marginTop: 2, lineHeight: 18 }}>
              {n.label}
            </T>
          </View>
        );
      })}
    </View>
  );
}

// ─── Attention list ─────────────────────────────────────────────────────────
const REASON_TAG: Record<AttentionReason, { label: string; tone: 'esc' | 'dup' | 'rev' | 'plain' } | null> = {
  high: null,
  overdue: null,
  escalated: { label: 'Escalated to EHS Lead', tone: 'esc' },
  untriaged: null,
  review: { label: 'Check the AI’s category', tone: 'rev' },
  duplicate: { label: 'Possible duplicate', tone: 'dup' },
};

export function Tag({ label, tone }: { label: string; tone: 'esc' | 'dup' | 'rev' | 'plain' }) {
  const { p } = useTheme();
  const c =
    tone === 'esc' ? { fg: p.escalated, bg: p.escalatedSoft } : tone === 'dup' ? { fg: p.accent, bg: p.accentSoft } : tone === 'rev' ? { fg: p.name === 'control' ? p.medium : '#8A5000', bg: p.mediumSoft } : { fg: p.textDim, bg: p.raised };
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: c.bg, borderRadius: 3, paddingHorizontal: 7, paddingVertical: 1 }}>
      <T v="small" weight="semibold" style={{ color: c.fg }}>
        {label}
      </T>
    </View>
  );
}

export function AttentionRow({
  entry, areaName, now, onPress, first,
}: { entry: AttentionItem; areaName: string; now: Date; onPress: () => void; first?: boolean }) {
  const { p } = useTheme();
  const { item } = entry;
  const r = item.report;
  const a = item.action;
  const cd = countdownText(a, now);
  const overdue = isBreached(item, now);
  const tags = entry.reasons.map((x) => REASON_TAG[x]).filter(Boolean) as { label: string; tone: 'esc' | 'dup' | 'rev' | 'plain' }[];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${reportLabel(r.report_no)}, ${r.severity ?? 'unclassified'}, ${r.title ?? r.summary ?? r.category ?? 'report'}, ${areaName}`}
      onPress={onPress}
      style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.attRow,
        { borderTopWidth: first ? 0 : 1, borderTopColor: p.border, backgroundColor: hovered ? p.raised : 'transparent' },
      ]}
    >
      <SevMark severity={r.severity} n={r.severity ? undefined : undefined} size={26} />
      <View style={{ flex: 1, gap: 2 }}>
        <T v="body" weight="semibold" numberOfLines={2} style={{ lineHeight: 20 }}>
          {r.title || r.summary || r.transcript || 'New report'}
        </T>
        <T v="small" color="dim" numberOfLines={1}>
          {areaName} · {reportLabel(r.report_no)}
        </T>
        {tags.length ? (
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
            {tags.map((tg) => (
              <Tag key={tg.label} {...tg} />
            ))}
          </View>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end', minWidth: 74 }}>
        {a.status === 'New' && !overdue ? (
          <>
            <T v="h3" style={{ fontFamily: MONO.semibold }}>
              New
            </T>
            <T v="small" color="faint">
              {formatDuration(now.getTime() - new Date(r.created_at).getTime())} ago
            </T>
          </>
        ) : (
          <>
            <T v="h3" color={overdue ? 'high' : 'text'}>
              {cd.text.replace(/^Due in |^Overdue /, '')}
            </T>
            <T v="small" color={overdue ? 'high' : 'faint'}>
              {overdue ? 'overdue' : 'left'}
            </T>
          </>
        )}
      </View>
    </Pressable>
  );
}

// ─── Area tiles ─────────────────────────────────────────────────────────────
export interface AreaTileData {
  area: AreaRow;
  open: Item[];
  worst: Severity | null;
  overdue: number;
  outOfScope: boolean;
}

export function AreaTile({ d, now, narrow, onPress }: { d: AreaTileData; now: Date; narrow: boolean; onPress: () => void }) {
  const { p } = useTheme();
  const { t } = useTranslation();
  void t;
  const sevColor = useSevColor();
  const alarm = d.worst === 'High';
  const n = d.open.length;
  const top = [...d.open].sort(
    (a, b) => SEV_RANK[b.report.severity ?? 'Medium'] - SEV_RANK[a.report.severity ?? 'Medium'] || new Date(a.action.due_at).getTime() - new Date(b.action.due_at).getTime(),
  )[0];
  const fg = alarm ? p.onHigh : p.text;
  const dim = alarm ? p.onHigh : p.textDim;
  const bars = [...d.open].sort((a, b) => SEV_RANK[b.report.severity ?? 'Medium'] - SEV_RANK[a.report.severity ?? 'Medium']);

  if (d.outOfScope) {
    return (
      <View style={[styles.tile, { borderColor: p.border, borderStyle: 'dashed', backgroundColor: 'transparent', minHeight: narrow ? 128 : 176 }]}>
        <T v="h2" color="faint">
          {d.area.name}
        </T>
        <T v="small" color="faint">
          Managed by another supervisor
        </T>
      </View>
    );
  }
  const status = alarm
    ? `${n} open, high severity`
    : d.overdue
      ? `${d.overdue} overdue`
      : n
        ? top
          ? countdownText(top.action, now).text.replace('Due in ', '') + ' left'
          : ''
        : 'Nothing open';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${d.area.name}: ${n ? `${n} open, highest ${d.worst}` : 'nothing open'}${d.overdue ? `, ${d.overdue} overdue` : ''}. Open area.`}
      onPress={onPress}
      style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.tile,
        {
          minHeight: narrow ? 132 : 176,
          backgroundColor: alarm ? p.high : hovered ? p.raised : p.surface,
          borderColor: alarm ? p.high : p.border,
        },
      ]}
    >
      {!alarm && d.worst ? <View style={[styles.edge, { backgroundColor: sevColor(d.worst) }]} /> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
        <View style={{ flex: 1 }}>
          <T v="h2" numberOfLines={2} style={{ color: n ? fg : p.textFaint, fontSize: narrow ? 18 : 20, lineHeight: narrow ? 21 : 23 }}>
            {d.area.name}
          </T>
          <T v="small" weight={d.overdue && !alarm ? 'semibold' : 'regular'} style={{ color: alarm ? dim : d.overdue ? p.high : p.textDim }}>
            {status}
          </T>
        </View>
        <T v="kpi" style={{ color: n ? fg : p.textFaint, fontSize: narrow ? 30 : 36, lineHeight: narrow ? 32 : 38 }}>
          {n}
        </T>
      </View>
      {top ? (
        <View style={{ marginTop: 'auto', gap: 2 }}>
          <T v="small" style={{ color: alarm ? dim : p.textFaint }}>
            Most urgent
          </T>
          <T v="body" numberOfLines={2} style={{ color: fg, lineHeight: 19 }}>
            {top.report.title || top.report.summary || top.report.transcript}
          </T>
        </View>
      ) : null}
      {n ? (
        <View style={{ flexDirection: 'row', gap: 3, height: 6, marginTop: space.sm }}>
          {bars.map((b) => (
            <View key={b.report.id} style={{ flex: 1, borderRadius: 2, backgroundColor: alarm ? p.onHigh : sevColor(b.report.severity ?? 'Medium'), opacity: alarm ? 0.9 : 1 }} />
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, gap: space.md },
  attRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.lg },
  tile: { flexGrow: 1, flexBasis: 150, borderWidth: 1, borderRadius: radius.sm + 1, padding: space.md, paddingLeft: space.lg, overflow: 'hidden' },
  edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
});
