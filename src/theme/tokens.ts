// Design language: "Control room" (industrial HMI practice).
// Calm neutral surfaces; colour only ever means risk. The interactive accent
// is a cool blue that cannot be mistaken for a severity.
// Daylight = the PRD's high-contrast toggle (glare, projectors, outdoors).

import type { Severity } from '@/domain/types';

export type ThemeName = 'plant' | 'control' | 'daylight';

export interface Palette {
  name: ThemeName;
  bg: string;
  surface: string;
  raised: string;
  sunken: string;
  border: string;
  borderStrong: string;
  borderWidth: number;
  text: string;
  textDim: string;
  textFaint: string;
  accent: string;
  accentText: string;     // text on accent fill
  accentSoft: string;     // tinted background for selected states
  high: string;
  medium: string;
  low: string;
  clear: string;
  onHigh: string;
  onMedium: string;
  onLow: string;
  onClear: string;
  highSoft: string;
  mediumSoft: string;
  lowSoft: string;
  clearSoft: string;
  escalated: string;
  escalatedSoft: string;
  danger: string;
  success: string;
  overlay: string;
  zoneNone: string;       // heatmap zone with nothing open
  plantLine: string;      // schematic line work
  shadow: string;
  statusBar: 'light' | 'dark';
  /** Categorical series for charts (category volume), validated for both themes. */
  series: string[];
}

export const control: Palette = {
  name: 'control',
  bg: '#0B0F14',
  surface: '#121821',
  raised: '#1A222D',
  sunken: '#080B0F',
  border: '#263241',
  borderStrong: '#3A4A5E',
  borderWidth: 1,
  text: '#E8EDF2',
  textDim: '#9AA7B5',
  textFaint: '#6B7887',
  accent: '#4DA3FF',
  accentText: '#04121F',
  accentSoft: '#12304F',
  high: '#FF4D4F',
  medium: '#FF9F1A',
  low: '#FFD60A',
  clear: '#2FBF71',
  onHigh: '#1A0405',
  onMedium: '#1A0E00',
  onLow: '#1A1600',
  onClear: '#04170C',
  highSoft: '#3A1416',
  mediumSoft: '#3A2608',
  lowSoft: '#352F07',
  clearSoft: '#0D2E1D',
  escalated: '#C77DFF',
  escalatedSoft: '#2C1840',
  danger: '#FF6B6B',
  success: '#2FBF71',
  overlay: 'rgba(3, 6, 10, 0.72)',
  zoneNone: '#16241D',
  plantLine: '#2B3949',
  shadow: 'rgba(0,0,0,0.5)',
  statusBar: 'light',
  series: ['#4DA3FF', '#FF9F1A', '#2FBF71', '#C77DFF', '#FF6FB1', '#41D1C6', '#FFD60A', '#8A97A6'],
};

export const daylight: Palette = {
  name: 'daylight',
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  raised: '#F2F4F7',
  sunken: '#E9EDF2',
  border: '#111111',
  borderStrong: '#000000',
  borderWidth: 2,
  text: '#000000',
  textDim: '#333333',
  textFaint: '#555555',
  accent: '#0B4FB3',
  accentText: '#FFFFFF',
  accentSoft: '#DCE8FA',
  high: '#C81E1E',
  medium: '#B45309',
  low: '#FFD60A',
  clear: '#15803D',
  onHigh: '#FFFFFF',
  onMedium: '#FFFFFF',
  onLow: '#000000',
  onClear: '#FFFFFF',
  highSoft: '#FDE2E2',
  mediumSoft: '#FDEBD3',
  lowSoft: '#FFF6C2',
  clearSoft: '#DCF3E4',
  escalated: '#6B21A8',
  escalatedSoft: '#EEDDFB',
  danger: '#B91C1C',
  success: '#15803D',
  overlay: 'rgba(0, 0, 0, 0.55)',
  zoneNone: '#DCF3E4',
  plantLine: '#9AA4B0',
  shadow: 'rgba(0,0,0,0.18)',
  statusBar: 'dark',
  series: ['#0B4FB3', '#B45309', '#15803D', '#6B21A8', '#BE185D', '#0F766E', '#A16207', '#475569'],
};

/**
 * "Plant control screen" (default): modelled on process-plant operator displays
 * (ISA-101): calm grey canvas, graphite ink, colour only where something needs
 * attention. Light, so it survives projectors and daylight.
 */
export const plant: Palette = {
  name: 'plant',
  bg: '#E4E7EA',
  surface: '#FBFBFC',
  raised: '#F1F3F5',
  sunken: '#EDEFF1',
  border: '#C5CBD1',
  borderStrong: '#9AA4AD',
  borderWidth: 1,
  text: '#1C2228',
  textDim: '#59646E',
  textFaint: '#6F7A84',
  accent: '#2D5B88',
  accentText: '#FFFFFF',
  accentSoft: '#E3ECF5',
  high: '#D0202B',
  medium: '#D9780A',
  low: '#EFC01A',
  clear: '#237A4B',
  onHigh: '#FFFFFF',
  onMedium: '#1C1000',
  onLow: '#1C2228',
  onClear: '#FFFFFF',
  highSoft: '#FBE3E4',
  mediumSoft: '#FCEFD9',
  lowSoft: '#FBF4D2',
  clearSoft: '#E1F1E7',
  escalated: '#6B3FA0',
  escalatedSoft: '#EFE7F8',
  danger: '#B4161F',
  success: '#237A4B',
  overlay: 'rgba(20, 28, 36, 0.55)',
  zoneNone: '#FBFBFC',
  plantLine: '#8E979F',
  shadow: 'rgba(20, 30, 40, 0.14)',
  statusBar: 'dark',
  series: ['#2D5B88', '#D9780A', '#237A4B', '#6B3FA0', '#C0457A', '#1F8A8A', '#9A7400', '#59646E'],
};

export const PALETTES: Record<ThemeName, Palette> = { plant, control, daylight };

export function severityColors(p: Palette, s: Severity | 'none' | null) {
  switch (s) {
    case 'High':
      return { fill: p.high, on: p.onHigh, soft: p.highSoft };
    case 'Medium':
      return { fill: p.medium, on: p.onMedium, soft: p.mediumSoft };
    case 'Low':
      return { fill: p.low, on: p.onLow, soft: p.lowSoft };
    default:
      return { fill: p.clear, on: p.onClear, soft: p.clearSoft };
  }
}

/** Never colour alone: every severity also has a shape and a word. */
export const SEVERITY_GLYPH: Record<Severity, string> = { High: '▲', Medium: '◆', Low: '●' };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 6, md: 10, lg: 14, xl: 20, pill: 999 } as const;
/** PRD §11: primary ≥ 56 (we use 64), secondary ≥ 48. */
export const touch = { primary: 64, secondary: 48, compact: 40 } as const;
