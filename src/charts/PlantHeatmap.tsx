// Plant X schematic (fictional site) with clickable zones coloured by the
// highest open severity (PRD §6): High red, Medium amber, Low yellow, none green.
// Control-room style: dark plan drawing, each zone has a solid severity header
// and a tinted body, so colour marks risk without flooding the screen.
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, Path, Pattern, Rect, Text as SvgText } from 'react-native-svg';
import type { AreaRisk } from '@/domain/metrics';
import { SEVERITY_GLYPH, severityColors } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { SVG_FONT, useWidth } from './useWidth';

const VB_W = 1000;
const VB_H = 600;
const HEAD = 40; // header band height
const R = 10; // corner radius

interface Zone {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  short: string;
  /** Equipment line-art, drawn in the zone's ink colour. */
  art: (z: Zone, ink: string) => ReactNode;
}

const sw = 2; // art stroke width

const ZONES: Zone[] = [
  {
    id: 'zone-tank', x: 30, y: 36, w: 300, h: 224, short: 'Tank Farm',
    art: (z, ink) => (
      <G>
        {/* bund wall */}
        <Rect x={z.x + 16} y={z.y + HEAD + 16} width={z.w - 32} height={z.h - HEAD - 58} rx={6} stroke={ink} strokeWidth={1.5} strokeDasharray="7 6" fill="none" opacity={0.7} />
        {[0, 1, 2].map((i) => {
          const cx = z.x + 62 + i * 88;
          const cy = z.y + HEAD + 80;
          return (
            <G key={i}>
              <Circle cx={cx} cy={cy} r={34} stroke={ink} strokeWidth={sw} fill="none" />
              <Circle cx={cx} cy={cy} r={12} stroke={ink} strokeWidth={1.5} fill="none" opacity={0.7} />
              <Line x1={cx} y1={cy - 34} x2={cx} y2={cy - 12} stroke={ink} strokeWidth={1.5} opacity={0.7} />
            </G>
          );
        })}
      </G>
    ),
  },
  {
    id: 'zone-react', x: 350, y: 36, w: 270, h: 224, short: 'Reactor Block',
    art: (z, ink) => (
      <G>
        {[0, 1].map((i) => {
          const x = z.x + 58 + i * 100;
          const y = z.y + HEAD + 44;
          return (
            <G key={i}>
              <Rect x={x} y={y} width={56} height={84} rx={26} stroke={ink} strokeWidth={sw} fill="none" />
              {/* agitator + motor */}
              <Line x1={x + 28} y1={y - 14} x2={x + 28} y2={y + 56} stroke={ink} strokeWidth={1.5} />
              <Rect x={x + 18} y={y - 26} width={20} height={12} rx={2} stroke={ink} strokeWidth={1.5} fill="none" />
              <Line x1={x + 14} y1={y + 56} x2={x + 42} y2={y + 56} stroke={ink} strokeWidth={sw} />
              {/* legs */}
              <Line x1={x + 10} y1={y + 78} x2={x + 6} y2={y + 96} stroke={ink} strokeWidth={1.5} />
              <Line x1={x + 46} y1={y + 78} x2={x + 50} y2={y + 96} stroke={ink} strokeWidth={1.5} />
            </G>
          );
        })}
      </G>
    ),
  },
  {
    id: 'zone-dist', x: 640, y: 36, w: 330, h: 224, short: 'Distillation',
    art: (z, ink) => (
      <G>
        {[0, 1, 2].map((i) => {
          const hgt = [116, 132, 104][i];
          const x = z.x + 70 + i * 86;
          const bottom = z.y + z.h - 44;
          return (
            <G key={i}>
              <Rect x={x} y={bottom - hgt} width={30} height={hgt} rx={13} stroke={ink} strokeWidth={sw} fill="none" />
              {[1, 2, 3, 4].map((k) => (
                <Line key={k} x1={x + 5} x2={x + 25} y1={bottom - (hgt / 5) * k} y2={bottom - (hgt / 5) * k} stroke={ink} strokeWidth={1.2} opacity={0.7} />
              ))}
              {i < 2 ? <Path d={`M${x + 30} ${bottom - hgt + 16} H${x + 58} V${bottom - 20} H${x + 86}`} stroke={ink} strokeWidth={1.2} fill="none" opacity={0.6} /> : null}
            </G>
          );
        })}
      </G>
    ),
  },
  {
    id: 'zone-load', x: 30, y: 332, w: 215, h: 238, short: 'Loading Bay',
    art: (z, ink) => (
      <G>
        {[0, 1, 2].map((i) => {
          const x = z.x + 26 + i * 60;
          const y = z.y + HEAD + 26;
          return (
            <G key={i}>
              {/* tanker: cab + trailer */}
              <Rect x={x + 6} y={y} width={30} height={22} rx={4} stroke={ink} strokeWidth={1.5} fill="none" />
              <Rect x={x} y={y + 26} width={42} height={84} rx={8} stroke={ink} strokeWidth={sw} fill="none" />
              <Line x1={x - 8} x2={x - 8} y1={y - 6} y2={y + 116} stroke={ink} strokeWidth={1} strokeDasharray="5 5" opacity={0.6} />
            </G>
          );
        })}
      </G>
    ),
  },
  {
    id: 'zone-ware', x: 260, y: 332, w: 215, h: 238, short: 'Warehouse',
    art: (z, ink) => (
      <G>
        {[0, 1, 2, 3].map((i) => (
          <G key={i}>
            <Rect x={z.x + 24} y={z.y + HEAD + 24 + i * 30} width={z.w - 48} height={14} rx={2} stroke={ink} strokeWidth={1.5} fill="none" />
            {[1, 2, 3, 4].map((k) => (
              <Line key={k} x1={z.x + 24 + ((z.w - 48) / 5) * k} x2={z.x + 24 + ((z.w - 48) / 5) * k} y1={z.y + HEAD + 24 + i * 30} y2={z.y + HEAD + 38 + i * 30} stroke={ink} strokeWidth={1} opacity={0.6} />
            ))}
          </G>
        ))}
      </G>
    ),
  },
  {
    id: 'zone-util', x: 490, y: 332, w: 200, h: 238, short: 'Utilities',
    art: (z, ink) => (
      <G>
        {/* boiler drum */}
        <Rect x={z.x + 22} y={z.y + HEAD + 62} width={96} height={52} rx={26} stroke={ink} strokeWidth={sw} fill="none" />
        <Circle cx={z.x + 48} cy={z.y + HEAD + 88} r={8} stroke={ink} strokeWidth={1.5} fill="none" opacity={0.7} />
        {/* stack */}
        <Path d={`M${z.x + 142} ${z.y + HEAD + 114} L${z.x + 147} ${z.y + HEAD + 22} H${z.x + 163} L${z.x + 168} ${z.y + HEAD + 114} Z`} stroke={ink} strokeWidth={sw} fill="none" />
        <Path d={`M${z.x + 118} ${z.y + HEAD + 88} H${z.x + 143}`} stroke={ink} strokeWidth={1.5} />
      </G>
    ),
  },
  {
    id: 'zone-etp', x: 705, y: 332, w: 265, h: 140, short: 'Effluent Treatment',
    art: (z, ink) => (
      <G>
        {[0, 1].map((i) => {
          const cx = z.x + 150 + i * 62;
          const cy = z.y + HEAD + 44;
          return (
            <G key={i}>
              <Circle cx={cx} cy={cy} r={24} stroke={ink} strokeWidth={sw} fill="none" />
              <Circle cx={cx} cy={cy} r={5} stroke={ink} strokeWidth={1.5} fill="none" />
              <Line x1={cx} y1={cy} x2={cx + 24} y2={cy} stroke={ink} strokeWidth={1.5} />
            </G>
          );
        })}
      </G>
    ),
  },
  {
    id: 'zone-wksp', x: 705, y: 486, w: 265, h: 84, short: 'Workshop',
    art: () => null,
  },
];

const headPath = (z: Zone) =>
  `M${z.x} ${z.y + HEAD} V${z.y + R} Q${z.x} ${z.y} ${z.x + R} ${z.y} H${z.x + z.w - R} Q${z.x + z.w} ${z.y} ${z.x + z.w} ${z.y + R} V${z.y + HEAD} Z`;

export function PlantHeatmap({
  risks, onZonePress, selectedAreaId, notMine,
}: {
  risks: AreaRisk[];
  onZonePress?: (areaId: number) => void;
  selectedAreaId?: number | null;
  /** Areas owned by another supervisor: RLS hides their reports, so show them as out of scope. */
  notMine?: Set<number>;
}) {
  const { p } = useTheme();
  const { width, onLayout } = useWidth();
  const height = width * (VB_H / VB_W);
  const byZone = new Map(risks.map((r) => [r.area.svg_region_id, r]));

  return (
    <View onLayout={onLayout} style={{ width: '100%', height: height || 280 }} accessibilityRole="image" accessibilityLabel="Plant X heatmap by highest open severity">
      {width > 0 ? (
        <Svg width={width} height={height} viewBox={`0 0 ${VB_W} ${VB_H}`}>
          <Defs>
            <Pattern id="grid" width={24} height={24} patternUnits="userSpaceOnUse">
              <Circle cx={1} cy={1} r={1} fill={p.plantLine} opacity={0.55} />
            </Pattern>
          </Defs>
          <G fontFamily={SVG_FONT}>
            {/* site: plan sheet with dot grid, road, gate, pipe rack */}
            <Rect x={6} y={6} width={VB_W - 12} height={VB_H - 12} rx={16} fill={p.sunken} stroke={p.border} strokeWidth={1.5} />
            <Rect x={6} y={6} width={VB_W - 12} height={VB_H - 12} rx={16} fill="url(#grid)" />
            <Rect x={7} y={274} width={VB_W - 14} height={44} fill={p.surface} />
            <Line x1={7} y1={274} x2={VB_W - 7} y2={274} stroke={p.border} strokeWidth={1.5} />
            <Line x1={7} y1={318} x2={VB_W - 7} y2={318} stroke={p.border} strokeWidth={1.5} />
            <Line x1={70} y1={296} x2={900} y2={296} stroke={p.plantLine} strokeWidth={2} strokeDasharray="20 16" />
            <Rect x={420} y={284} width={160} height={24} fill={p.surface} />
            <SvgText x={500} y={301} fill={p.textFaint} fontSize={12} textAnchor="middle" letterSpacing={4}>
              MAIN ROAD
            </SvgText>
            <Rect x={6} y={282} width={10} height={28} rx={2} fill={p.accent} />
            <SvgText x={24} y={301} fill={p.textDim} fontSize={12} letterSpacing={2}>
              GATE
            </SvgText>
            <Path d="M958 285 L966 307 L958 302 L950 307 Z" fill={p.textDim} />
            <SvgText x={938} y={301} fill={p.textDim} fontSize={12} textAnchor="middle">
              N
            </SvgText>
            {/* process line: tank farm → reactors → distillation */}
            <Path d="M330 150 H350 M620 150 H640" stroke={p.plantLine} strokeWidth={5} strokeLinecap="round" />

            {ZONES.map((z) => {
              const r = byZone.get(z.id);
              const outOfScope = r ? !!notMine?.has(r.area.id) : false;
              const level = outOfScope ? 'none' : (r?.level ?? 'none');
              const c = severityColors(p, level);
              const clear = level === 'none';
              const selected = !!r && selectedAreaId === r.area.id;
              const fullName = r?.area.name ?? z.short;
              const hasCount = !!r && r.openCount > 0 && !outOfScope;
              const room = z.w - 28 - (hasCount ? 44 : 0);
              const name = fullName.length * 10.5 > room ? z.short : fullName;

              // Clear zones stay quiet (dark, thin green edge) so hazards stand out.
              const bodyFill = outOfScope ? p.surface : clear ? p.surface : c.soft;
              const edge = outOfScope ? p.plantLine : c.fill;
              const headFill = outOfScope ? p.raised : clear ? p.clearSoft : c.fill;
              const headInk = outOfScope ? p.textFaint : clear ? p.text : c.on;
              const artInk = outOfScope ? p.plantLine : clear ? p.plantLine : c.fill;

              return (
                <G key={z.id}>
                  <Rect x={z.x} y={z.y} width={z.w} height={z.h} rx={R} fill={bodyFill} />
                  <Path d={headPath(z)} fill={headFill} />
                  {z.art(z, artInk)}
                  <Rect
                    x={z.x}
                    y={z.y}
                    width={z.w}
                    height={z.h}
                    rx={R}
                    fill="none"
                    stroke={selected ? p.accent : edge}
                    strokeWidth={selected ? 5 : clear || outOfScope ? 1.5 : 3}
                    strokeDasharray={outOfScope ? '8 7' : undefined}
                  />
                  <SvgText x={z.x + 14} y={z.y + 27} fill={headInk} fontSize={18} fontWeight="700">
                    {name}
                  </SvgText>
                  {hasCount ? (
                    <G>
                      <Rect x={z.x + z.w - 46} y={z.y + 8} width={36} height={24} rx={12} fill={p.bg} opacity={0.9} />
                      <SvgText x={z.x + z.w - 28} y={z.y + 26} fill={p.text} fontSize={16} fontWeight="700" textAnchor="middle">
                        {r!.openCount}
                      </SvgText>
                    </G>
                  ) : null}
                  <SvgText x={z.x + 14} y={z.y + z.h - 14} fill={outOfScope ? p.textFaint : clear ? p.clear : p.text} fontSize={14} fontWeight="600">
                    {outOfScope
                      ? 'Other supervisor'
                      : clear
                        ? '✓ Nothing open'
                        : `${SEVERITY_GLYPH[level]} ${level} · ${r!.openCount} open`}
                  </SvgText>
                </G>
              );
            })}
          </G>
        </Svg>
      ) : null}
      {/* Real buttons over each zone: reliable taps on web and phone, and keyboard/screen-reader access. */}
      {width > 0 && onZonePress
        ? ZONES.map((z) => {
            const r = byZone.get(z.id);
            if (!r || notMine?.has(r.area.id)) return null;
            const k = width / VB_W;
            return (
              <Pressable
                key={`hit-${z.id}`}
                accessibilityRole="button"
                accessibilityLabel={`${r.area.name}: ${r.openCount} open, highest ${r.level === 'none' ? 'none' : r.level}. Open area.`}
                onPress={() => onZonePress(r.area.id)}
                style={({ hovered }: { pressed: boolean; hovered?: boolean }) => ({
                  position: 'absolute', left: z.x * k, top: z.y * k, width: z.w * k, height: z.h * k, borderRadius: R * k,
                  backgroundColor: hovered ? 'rgba(255,255,255,0.07)' : 'transparent',
                })}
              />
            );
          })
        : null}
    </View>
  );
}
