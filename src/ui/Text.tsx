import type { ReactNode } from 'react';
import { Text as RNText, type TextProps, type TextStyle, StyleSheet } from 'react-native';
import { useLang } from '@/lib/i18n';
import { fontFor, hasDevanagari, MONO, type Weight } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';

type Variant = 'display' | 'h1' | 'h2' | 'h3' | 'body' | 'bodyLg' | 'small' | 'label' | 'micro' | 'mono' | 'monoLg' | 'kpi';

// Variants flagged `cond` use the semi-condensed cut (headings and big numbers).
const SIZES: Record<Variant, { size: number; line: number; weight: Weight; mono?: boolean; cond?: boolean; upper?: boolean; track?: number }> = {
  display: { size: 38, line: 42, weight: 'semibold', cond: true },
  h1: { size: 30, line: 34, weight: 'semibold', cond: true },
  h2: { size: 22, line: 27, weight: 'semibold', cond: true },
  h3: { size: 17, line: 22, weight: 'semibold' },
  bodyLg: { size: 18, line: 26, weight: 'regular' },
  body: { size: 15, line: 22, weight: 'regular' },
  small: { size: 13, line: 18, weight: 'regular' },
  label: { size: 14, line: 18, weight: 'semibold' },
  micro: { size: 11, line: 14, weight: 'medium' },
  mono: { size: 13, line: 18, weight: 'medium', mono: true },
  monoLg: { size: 20, line: 26, weight: 'semibold', mono: true },
  kpi: { size: 44, line: 46, weight: 'semibold', cond: true },
};

export interface TProps extends TextProps {
  v?: Variant;
  color?: 'text' | 'dim' | 'faint' | 'accent' | 'high' | 'medium' | 'clear' | 'danger' | 'escalated' | string;
  weight?: Weight;
  center?: boolean;
  children?: ReactNode;
}

export function T({ v = 'body', color = 'text', weight, center, style, children, ...rest }: TProps) {
  const { p } = useTheme();
  const lang = useLang();
  const spec = SIZES[v];
  const str = typeof children === 'string' ? children : Array.isArray(children) ? children.join('') : '';
  const hindi = lang === 'hi' || hasDevanagari(str);
  // Devanagari needs taller lines for matras above and below the headline.
  const line = hindi && !spec.mono ? Math.round(spec.line * 1.18) : spec.line;
  const colors: Record<string, string> = {
    text: p.text,
    dim: p.textDim,
    faint: p.textFaint,
    accent: p.accent,
    high: p.high,
    medium: p.medium,
    clear: p.clear,
    danger: p.danger,
    escalated: p.escalated,
  };
  const s: TextStyle = {
    fontFamily: spec.mono ? (spec.weight === 'semibold' ? MONO.semibold : MONO.medium) : fontFor(weight ?? spec.weight, hindi, spec.cond),
    fontSize: spec.size,
    lineHeight: line,
    color: colors[color] ?? color,
    textAlign: center ? 'center' : undefined,
    textTransform: spec.upper && !hindi ? 'uppercase' : undefined,
    letterSpacing: spec.track,
  };
  return (
    <RNText style={StyleSheet.flatten([s, style])} {...rest}>
      {children}
    </RNText>
  );
}
