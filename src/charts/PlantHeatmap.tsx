// Plant X schematic (fictional site) with clickable zones coloured by the
// highest open severity (PRD §6): High red, Medium amber, Low yellow, none green.
// Hand-drawn SVG so it renders identically on the projector and on a phone.
import { Pressable, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import type { AreaRisk } from '@/domain/metrics';
import { SEVERITY_GLYPH, severityColors } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { SVG_FONT, useWidth } from './useWidth';

interface Zone {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  short: string;
  decor: (stroke: string) => React.ReactNode;
}

const VB_W = 1000;
const VB_H = 640;

// Layout of the fictional site. Decorations hint at what each area is.
const ZONES: Zone[] = [
  {
    id: 'zone-tank', x: 40, y: 50, w: 290, h: 220, short: 'Tank Farm',
    decor: (s) => (
      <G>
        {[0, 1, 2].map((i) => (
          <Circle key={i} cx={95 + i * 90} cy={185} r={32} stroke={s} strokeWidth={2} fill="none" />
        ))}
        <Path d="M60 245 H310" stroke={s} strokeWidth={2} strokeDasharray="6 6" />
      </G>
    ),
  },
  {
    id: 'zone-react', x: 360, y: 50, w: 250, h: 220, short: 'Reactor Block',
    decor: (s) => (
      <G>
        {[0, 1].map((i) => (
          <G key={i}>
            <Rect x={395 + i * 100} y={150} width={60} height={80} rx={26} stroke={s} strokeWidth={2} fill="none" />
            <Line x1={425 + i * 100} y1={150} x2={425 + i * 100} y2={135} stroke={s} strokeWidth={2} />
          </G>
        ))}
      </G>
    ),
  },
  {
    id: 'zone-dist', x: 640, y: 50, w: 320, h: 220, short: 'Distillation',
    decor: (s) => (
      <G>
        {[0, 1, 2].map((i) => (
          <Rect key={i} x={690 + i * 85} y={120 - i * 8} width={34} height={130 + i * 8} rx={12} stroke={s} strokeWidth={2} fill="none" />
        ))}
      </G>
    ),
  },
  {
    id: 'zone-load', x: 40, y: 350, w: 220, h: 250, short: 'Loading Bay',
    decor: (s) => (
      <G>
        {[0, 1, 2].map((i) => (
          <Rect key={i} x={70 + i * 62} y={470} width={44} height={100} rx={4} stroke={s} strokeWidth={2} fill="none" />
        ))}
      </G>
    ),
  },
  {
    id: 'zone-ware', x: 285, y: 350, w: 205, h: 250, short: 'Warehouse',
    decor: (s) => (
      <G>
        <Path d="M310 570 V470 L387 440 L465 470 V570 Z" stroke={s} strokeWidth={2} fill="none" />
        <Line x1={310} y1={520} x2={465} y2={520} stroke={s} strokeWidth={1.5} strokeDasharray="4 6" />
      </G>
    ),
  },
  {
    id: 'zone-util', x: 515, y: 350, w: 180, h: 250, short: 'Utilities',
    decor: (s) => (
      <G>
        <Rect x={540} y={480} width={90} height={90} rx={6} stroke={s} strokeWidth={2} fill="none" />
        <Rect x={645} y={430} width={22} height={140} stroke={s} strokeWidth={2} fill="none" />
      </G>
    ),
  },
  {
    id: 'zone-etp', x: 720, y: 350, w: 240, h: 150, short: 'Effluent Treatment',
    decor: (s) => (
      <G>
        <Circle cx={790} cy={455} r={30} stroke={s} strokeWidth={2} fill="none" />
        <Circle cx={880} cy={455} r={30} stroke={s} strokeWidth={2} fill="none" />
      </G>
    ),
  },
  {
    id: 'zone-wksp', x: 720, y: 520, w: 240, h: 80, short: 'Workshop',
    decor: (s) => <Path d="M745 585 H935" stroke={s} strokeWidth={2} strokeDasharray="10 6" />,
  },
];

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
          <G fontFamily={SVG_FONT}>
          {/* site boundary, road, pipe rack */}
          <Rect x={10} y={20} width={980} height={605} rx={18} fill={p.sunken} stroke={p.plantLine} strokeWidth={2} />
          <Rect x={10} y={290} width={980} height={42} fill={p.bg} opacity={0.6} />
          <Line x1={20} y1={311} x2={980} y2={311} stroke={p.plantLine} strokeWidth={2} strokeDasharray="18 14" />
          <SvgText x={500} y={306} fill={p.textFaint} fontSize={13} fontWeight="600" textAnchor="middle" letterSpacing={3}>
            MAIN ROAD
          </SvgText>
          <Path d="M335 160 H355 M615 160 H635" stroke={p.plantLine} strokeWidth={6} strokeLinecap="round" />
          {/* gate */}
          <Rect x={0} y={296} width={22} height={30} fill={p.accent} rx={3} />
          <SvgText x={30} y={350} fill={p.textFaint} fontSize={12} fontWeight="600">
            GATE
          </SvgText>
          {/* north arrow */}
          <G>
            <Path d="M968 300 L976 322 L968 317 L960 322 Z" fill={p.textDim} />
            <SvgText x={946} y={318} fill={p.textDim} fontSize={13} fontWeight="700" textAnchor="middle">
              N
            </SvgText>
          </G>

          {ZONES.map((z) => {
            const r = byZone.get(z.id);
            const outOfScope = r ? notMine?.has(r.area.id) : false;
            const level = r?.level ?? 'none';
            const c = severityColors(p, level);
            const fill = outOfScope ? p.raised : level === 'none' ? p.zoneNone : c.fill;
            const ink = outOfScope ? p.textFaint : level === 'none' ? p.text : c.on;
            const selected = r && selectedAreaId === r.area.id;
            const label = r?.area.name ?? z.short;
            return (
              <G key={z.id}>
                <Rect
                  x={z.x}
                  y={z.y}
                  width={z.w}
                  height={z.h}
                  rx={12}
                  fill={fill}
                  stroke={selected ? p.accent : level === 'none' && !outOfScope ? p.clear : p.bg}
                  strokeWidth={selected ? 6 : 3}
                  strokeDasharray={outOfScope ? '8 8' : undefined}
                />
                {z.decor(outOfScope ? p.border : level === 'none' ? p.plantLine : ink)}
                <SvgText x={z.x + 16} y={z.y + 32} fill={ink} fontSize={z.w < 200 ? 18 : 20} fontWeight="700">
                  {label.length * (z.w < 200 ? 10 : 11) > z.w - 28 ? z.short : label}
                </SvgText>
                {outOfScope ? (
                  <SvgText x={z.x + 16} y={z.y + 56} fill={ink} fontSize={14}>
                    Other supervisor
                  </SvgText>
                ) : r && r.openCount > 0 ? (
                  <G>
                    <Rect x={z.x + 14} y={z.y + 44} width={z.w < 200 ? 120 : 148} height={30} rx={15} fill={p.bg} opacity={0.88} />
                    <SvgText x={z.x + 28} y={z.y + 65} fill={p.text} fontSize={16} fontWeight="700">
                      {level !== 'none' ? `${SEVERITY_GLYPH[level]} ` : ''}
                      {r.openCount} open
                    </SvgText>
                  </G>
                ) : (
                  <SvgText x={z.x + 16} y={z.y + 58} fill={ink} fontSize={15} fontWeight="600">
                    ✓ Clear
                  </SvgText>
                )}
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
                  position: 'absolute', left: z.x * k, top: z.y * k, width: z.w * k, height: z.h * k, borderRadius: 12 * k,
                  backgroundColor: hovered ? 'rgba(255,255,255,0.08)' : 'transparent',
                })}
              />
            );
          })
        : null}
    </View>
  );
}
