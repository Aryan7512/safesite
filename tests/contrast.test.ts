// PRD §11: "run a contrast checker". WCAG 2.1 contrast for every text /
// background pairing the UI uses, in both themes.
import { describe, expect, it } from 'vitest';
import { control, daylight, plant, type Palette } from '../src/theme/tokens';

function lum(hex: string) {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string) {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

const AA = 4.5; // body text
const AA_LARGE = 3; // ≥ 18 px or bold ≥ 14 px, and UI graphics

function pairs(p: Palette): [string, string, string, number][] {
  return [
    ['text on bg', p.text, p.bg, AA],
    ['text on surface', p.text, p.surface, AA],
    ['text on raised', p.text, p.raised, AA],
    ['dim text on surface', p.textDim, p.surface, AA],
    ['dim text on bg', p.textDim, p.bg, AA],
    ['faint text on surface (micro, large/secondary only)', p.textFaint, p.surface, AA_LARGE],
    ['accent on surface (links)', p.accent, p.surface, AA],
    ['text on primary button', p.accentText, p.accent, AA],
    ['text on High badge', p.onHigh, p.high, AA],
    ['text on Medium badge', p.onMedium, p.medium, AA],
    ['text on Low badge', p.onLow, p.low, AA],
    ['text on Clear', p.onClear, p.clear, AA],
    ['text on High soft', p.text, p.highSoft, AA],
    ['text on Medium soft', p.text, p.mediumSoft, AA],
    ['text on accent soft', p.text, p.accentSoft, AA],
    ['text on heatmap clear zone', p.text, p.zoneNone, AA],
    ['High mark on surface', p.high, p.surface, AA_LARGE],
    ['Medium mark on surface', p.medium, p.surface, AA_LARGE],
    ['Clear mark on surface', p.clear, p.surface, AA_LARGE],
    ['Escalated mark on surface', p.escalated, p.surface, AA_LARGE],
  ];
}

describe.each([
  ['Plant (default light)', plant],
  ['Control room (dark)', control],
  ['Daylight (high contrast)', daylight],
])('%s theme contrast', (_name, palette) => {
  it.each(pairs(palette))('%s', (_label, fg, bg, min) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(min);
  });
});

describe('Daylight is the high-contrast theme', () => {
  it('body text reaches AAA (7:1)', () => {
    expect(contrast(daylight.text, daylight.bg)).toBeGreaterThanOrEqual(7);
    expect(contrast(daylight.textDim, daylight.bg)).toBeGreaterThanOrEqual(7);
  });
});
