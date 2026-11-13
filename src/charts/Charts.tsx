// Simple bar and line charts (PRD §6: "keep charts simple (bar and line)"),
// drawn with react-native-svg so they work on web and phone alike.
import { scaleBand, scaleLinear } from 'd3-scale';
import { line as d3line } from 'd3-shape';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import type { SpeedRow, VolumeRow } from '@/domain/metrics';
import { CATEGORIES } from '@/domain/types';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Row } from '@/ui/Layout';
import { T } from '@/ui/Text';
import { SVG_FONT, useWidth } from './useWidth';

const PAD = { top: 18, right: 8, bottom: 26, left: 34 };

function niceMax(v: number) {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / (pow / 2)) * (pow / 2);
}

export function VolumeChart({ rows, height = 210 }: { rows: VolumeRow[]; height?: number }) {
  const { p } = useTheme();
  const { width, onLayout } = useWidth();
  const max = niceMax(Math.max(1, ...rows.map((r) => r.total)));
  const x = scaleBand<number>().domain(rows.map((_, i) => i)).range([PAD.left, Math.max(PAD.left + 1, width - PAD.right)]).padding(0.28);
  const y = scaleLinear().domain([0, max]).range([height - PAD.bottom, PAD.top]);
  const ticks = y.ticks(4);
  const present = CATEGORIES.filter((c) => rows.some((r) => r.byCategory[c] > 0));

  return (
    <View style={{ gap: space.sm }}>
      <View onLayout={onLayout} style={{ height }} accessibilityRole="image" accessibilityLabel="Reports per period by category">
        {width > 0 ? (
          <Svg width={width} height={height}>
              <G fontFamily={SVG_FONT}>
            {ticks.map((t) => (
              <G key={t}>
                <Line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={p.border} strokeWidth={1} />
                <SvgText x={PAD.left - 6} y={y(t) + 4} fill={p.textFaint} fontSize={11} textAnchor="end">
                  {t}
                </SvgText>
              </G>
            ))}
            {rows.map((r, i) => {
              let acc = 0;
              const bw = x.bandwidth();
              return (
                <G key={i}>
                  {CATEGORIES.map((c, ci) => {
                    const v = r.byCategory[c];
                    if (!v) return null;
                    const y0 = y(acc);
                    acc += v;
                    const y1 = y(acc);
                    return <Rect key={c} x={x(i)} y={y1} width={bw} height={Math.max(0, y0 - y1 - 1)} fill={p.series[ci]} rx={2} />;
                  })}
                  {r.total > 0 ? (
                    <SvgText x={(x(i) ?? 0) + bw / 2} y={y(r.total) - 5} fill={p.text} fontSize={12} fontWeight="700" textAnchor="middle">
                      {r.total}
                    </SvgText>
                  ) : null}
                  <SvgText x={(x(i) ?? 0) + bw / 2} y={height - 8} fill={p.textDim} fontSize={11} textAnchor="middle">
                    {r.bucket.label}
                  </SvgText>
                </G>
              );
            })}
          </G>
            </Svg>
        ) : null}
      </View>
      <Row wrap gap={space.md}>
        {present.map((c) => (
          <Row key={c} gap={6}>
            <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: p.series[CATEGORIES.indexOf(c)] }} />
            <T v="micro" color="dim">
              {c}
            </T>
          </Row>
        ))}
      </Row>
    </View>
  );
}

export function SpeedChart({ rows, height = 150 }: { rows: SpeedRow[]; height?: number }) {
  const { p } = useTheme();
  const { width, onLayout } = useWidth();
  const maxH = niceMax(Math.max(1, ...rows.map((r) => r.medianCloseHours ?? 0)));
  const x = scaleBand<number>().domain(rows.map((_, i) => i)).range([PAD.left, Math.max(PAD.left + 1, width - PAD.right)]).padding(0.3);
  const yH = scaleLinear().domain([0, maxH]).range([height - PAD.bottom, PAD.top]);
  const yR = scaleLinear().domain([0, 1]).range([height - PAD.bottom, PAD.top]);
  const pts = rows
    .map((r, i) => (r.medianCloseHours == null ? null : ([(x(i) ?? 0) + x.bandwidth() / 2, yH(r.medianCloseHours)] as [number, number])))
    .filter((v): v is [number, number] => v !== null);
  const path = d3line()(pts) ?? '';

  return (
    <View style={{ gap: space.md }}>
      <View>
        <T v="small" weight="semibold">
          Median time to close (hours)
        </T>
        <View onLayout={onLayout} style={{ height }} accessibilityRole="image" accessibilityLabel="Median time to close per period">
          {width > 0 ? (
            <Svg width={width} height={height}>
              <G fontFamily={SVG_FONT}>
              {yH.ticks(3).map((t) => (
                <G key={t}>
                  <Line x1={PAD.left} x2={width - PAD.right} y1={yH(t)} y2={yH(t)} stroke={p.border} />
                  <SvgText x={PAD.left - 6} y={yH(t) + 4} fill={p.textFaint} fontSize={11} textAnchor="end">
                    {t}
                  </SvgText>
                </G>
              ))}
              <Path d={path} stroke={p.accent} strokeWidth={3} fill="none" />
              {rows.map((r, i) =>
                r.medianCloseHours == null ? null : (
                  <G key={i}>
                    <Circle cx={(x(i) ?? 0) + x.bandwidth() / 2} cy={yH(r.medianCloseHours)} r={5} fill={p.accent} stroke={p.surface} strokeWidth={2} />
                    <SvgText x={(x(i) ?? 0) + x.bandwidth() / 2} y={yH(r.medianCloseHours) - 10} fill={p.text} fontSize={11} fontWeight="700" textAnchor="middle">
                      {r.medianCloseHours.toFixed(1)}
                    </SvgText>
                  </G>
                ),
              )}
              {rows.map((r, i) => (
                <SvgText key={`l${i}`} x={(x(i) ?? 0) + x.bandwidth() / 2} y={height - 8} fill={p.textDim} fontSize={11} textAnchor="middle">
                  {r.bucket.label}
                </SvgText>
              ))}
            </G>
            </Svg>
          ) : null}
        </View>
      </View>
      <View>
        <T v="small" weight="semibold">
          SLA breach rate
        </T>
        <View style={{ height }}>
          {width > 0 ? (
            <Svg width={width} height={height}>
              <G fontFamily={SVG_FONT}>
              {[0, 0.5, 1].map((t) => (
                <G key={t}>
                  <Line x1={PAD.left} x2={width - PAD.right} y1={yR(t)} y2={yR(t)} stroke={p.border} />
                  <SvgText x={PAD.left - 6} y={yR(t) + 4} fill={p.textFaint} fontSize={11} textAnchor="end">
                    {Math.round(t * 100)}%
                  </SvgText>
                </G>
              ))}
              {rows.map((r, i) => {
                const bw = x.bandwidth();
                const rate = r.breachRate ?? 0;
                return (
                  <G key={i}>
                    <Rect x={x(i)} y={yR(rate)} width={bw} height={Math.max(0, yR(0) - yR(rate))} fill={rate > 0.2 ? p.high : p.medium} rx={radius.sm / 2} />
                    <SvgText x={(x(i) ?? 0) + bw / 2} y={yR(rate) - 5} fill={p.text} fontSize={11} fontWeight="700" textAnchor="middle">
                      {r.breachRate == null ? '–' : `${Math.round(rate * 100)}%`}
                    </SvgText>
                    <SvgText x={(x(i) ?? 0) + bw / 2} y={height - 8} fill={p.textDim} fontSize={11} textAnchor="middle">
                      {r.bucket.label}
                    </SvgText>
                  </G>
                );
              })}
            </G>
            </Svg>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/** Inline horizontal bar for ranked lists (risk index). */
export function HBar({ value, max, color }: { value: number; max: number; color: string }) {
  const { p } = useTheme();
  return (
    <View style={{ height: 10, borderRadius: 5, backgroundColor: p.sunken, overflow: 'hidden', flex: 1 }}>
      <View style={{ width: `${max ? Math.min(100, (value / max) * 100) : 0}%`, height: '100%', backgroundColor: color, borderRadius: 5 }} />
    </View>
  );
}
