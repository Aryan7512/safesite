// Charts coloured by severity: High red, Medium amber, Low yellow. The same
// colours mean the same thing on every chart, tile and badge.
import { scaleBand, scaleLinear } from 'd3-scale';
import { View } from 'react-native';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';
import type { SevCounts, SevVolumeRow } from '@/domain/metrics';
import type { Severity, SlaEntry } from '@/domain/types';
import { MONO } from '@/theme/fonts';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { T } from '@/ui/Text';
import { SVG_FONT, useWidth } from './useWidth';

const ORDER: Severity[] = ['High', 'Medium', 'Low']; // High sits on the baseline

function useSev() {
  const { p } = useTheme();
  return { p, color: (s: Severity) => (s === 'High' ? p.high : s === 'Medium' ? p.medium : p.low) };
}

function niceMax(v: number) {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / (pow / 2)) * (pow / 2);
}

/** Reports per period, stacked by severity. Latest period is full strength; earlier ones are slightly softer. */
export function SevVolumeChart({ rows, height = 220 }: { rows: SevVolumeRow[]; height?: number }) {
  const { p, color } = useSev();
  const { width, onLayout } = useWidth();
  const PAD = { top: 22, right: 6, bottom: 28, left: 28 };
  const max = niceMax(Math.max(1, ...rows.map((r) => r.total)));
  const x = scaleBand<number>().domain(rows.map((_, i) => i)).range([PAD.left, Math.max(PAD.left + 1, width - PAD.right)]).padding(0.3);
  const y = scaleLinear().domain([0, max]).range([height - PAD.bottom, PAD.top]);
  return (
    <View onLayout={onLayout} style={{ height }} accessibilityRole="image" accessibilityLabel={`Reports per period by severity. ${rows.map((r) => `${r.bucket.label}: ${r.sev.High} high, ${r.sev.Medium} medium, ${r.sev.Low} low`).join('; ')}`}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          <G fontFamily={SVG_FONT}>
            {y.ticks(4).map((tk) => (
              <G key={tk}>
                <Line x1={PAD.left} x2={width - PAD.right} y1={y(tk)} y2={y(tk)} stroke={p.border} strokeWidth={1} />
                <SvgText x={PAD.left - 6} y={y(tk) + 4} fill={p.textFaint} fontSize={12} textAnchor="end">
                  {tk}
                </SvgText>
              </G>
            ))}
            {rows.map((r, i) => {
              let acc = 0;
              const bw = x.bandwidth();
              const last = i === rows.length - 1;
              return (
                <G key={i}>
                  {ORDER.map((s) => {
                    const v = r.sev[s];
                    if (!v) return null;
                    const y0 = y(acc);
                    acc += v;
                    const y1 = y(acc);
                    return <Rect key={s} x={x(i)} y={y1} width={bw} height={Math.max(0, y0 - y1 - 1)} fill={color(s)} opacity={last ? 1 : 0.82} rx={2} />;
                  })}
                  {r.total > 0 ? (
                    <SvgText x={(x(i) ?? 0) + bw / 2} y={y(r.total) - 6} fill={p.text} fontSize={13} fontWeight="700" textAnchor="middle">
                      {r.total}
                    </SvgText>
                  ) : null}
                  <SvgText x={(x(i) ?? 0) + bw / 2} y={height - 8} fill={last ? p.text : p.textDim} fontSize={12} fontWeight={last ? '700' : '400'} textAnchor="middle">
                    {r.bucket.label}
                  </SvgText>
                </G>
              );
            })}
          </G>
        </Svg>
      ) : null}
    </View>
  );
}

/** Horizontal stacked bars, one row per label (hazard type, shift …). */
export function SevHBars({
  rows, max, labelWidth = 120, formatLabel,
}: {
  rows: { key: string; label: string; sev: SevCounts; total: number }[];
  max?: number;
  labelWidth?: number;
  formatLabel?: (l: string) => string;
}) {
  const { p, color } = useSev();
  const m = max ?? Math.max(1, ...rows.map((r) => r.total));
  return (
    <View style={{ gap: 9 }}>
      {rows.map((r) => (
        <View key={r.key} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }} accessibilityLabel={`${r.label}: ${r.sev.High} high, ${r.sev.Medium} medium, ${r.sev.Low} low`}>
          <T v="body" numberOfLines={1} style={{ width: labelWidth }}>
            {formatLabel ? formatLabel(r.label) : r.label}
          </T>
          <View style={{ flex: 1, height: 16, flexDirection: 'row', backgroundColor: p.raised, borderRadius: 3, overflow: 'hidden' }}>
            {ORDER.map((s) =>
              r.sev[s] ? <View key={s} style={{ width: `${(r.sev[s] / m) * 100}%`, backgroundColor: color(s), borderRightWidth: 1, borderRightColor: p.surface }} /> : null,
            )}
          </View>
          <T v="body" weight="semibold" style={{ width: 28, textAlign: 'right', fontFamily: MONO.semibold }}>
            {r.total}
          </T>
        </View>
      ))}
    </View>
  );
}

/** Median time to close against the target for each severity. Green only when inside target. */
export function ClosureVsTarget({
  median, sla, counts,
}: { median: Record<Severity, number | null>; sla: Record<Severity, SlaEntry>; counts: Record<Severity, number> }) {
  const { p, color } = useSev();
  return (
    <View style={{ gap: space.lg }}>
      {ORDER.map((s) => {
        const m = median[s];
        const target = sla[s].due_h;
        const scale = Math.max(target * 1.25, (m ?? 0) * 1.1);
        const within = m != null && m <= target;
        return (
          <View key={s} style={{ gap: 6 }} accessibilityLabel={`${s}: ${m == null ? 'no closed reports' : `median ${m.toFixed(1)} hours`}, target ${target} hours`}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: color(s) }} />
                <T v="body" weight="semibold">
                  {s}
                </T>
                <T v="small" color="faint">
                  {counts[s]} closed
                </T>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                <T v="h2" color={m == null ? 'faint' : within ? 'clear' : 'high'}>
                  {m == null ? 'None yet' : `${m.toFixed(1)} h`}
                </T>
                <T v="small" color="faint">
                  target {target} h
                </T>
              </View>
            </View>
            <View style={{ height: 14, backgroundColor: p.raised, borderRadius: 3, overflow: 'visible' }}>
              {m != null ? <View style={{ width: `${Math.min(100, (m / scale) * 100)}%`, height: '100%', backgroundColor: color(s), borderRadius: 3 }} /> : null}
              <View style={{ position: 'absolute', left: `${(target / scale) * 100}%`, top: -4, bottom: -4, width: 2, backgroundColor: p.text }} />
            </View>
          </View>
        );
      })}
      <T v="small" color="faint">
        The black mark is the target time for that severity.
      </T>
    </View>
  );
}

/** Ranked risk list: bar colour is the worst severity open in that area. */
export function RiskBars({
  rows, onPress,
}: {
  rows: { id: number; name: string; score: number; worst: Severity | null; detail: string }[];
  onPress?: (id: number) => void;
}) {
  const { p, color } = useSev();
  const m = Math.max(1, ...rows.map((r) => r.score));
  return (
    <View style={{ gap: 4 }}>
      {rows.map((r) => (
        <View key={r.id} style={{ gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 28 }} accessibilityLabel={`${r.name}: risk ${r.score}. ${r.detail}`}>
            <T v="body" numberOfLines={1} style={{ width: 138 }} onPress={onPress ? () => onPress(r.id) : undefined}>
              {r.name}
            </T>
            <View style={{ flex: 1, height: 10, backgroundColor: p.raised, borderRadius: 5, overflow: 'hidden' }}>
              <View style={{ width: `${(r.score / m) * 100}%`, height: '100%', backgroundColor: r.worst ? color(r.worst) : p.borderStrong, borderRadius: 5 }} />
            </View>
            <T v="body" weight="semibold" style={{ width: 30, textAlign: 'right', fontFamily: MONO.semibold }}>
              {r.score}
            </T>
          </View>
        </View>
      ))}
    </View>
  );
}

export function Swatch({ s }: { s: Severity }) {
  const { color } = useSev();
  return <View style={{ width: 12, height: 12, borderRadius: radius.sm / 2, backgroundColor: color(s) }} />;
}
