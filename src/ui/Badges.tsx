// Severity is never colour alone: shape + word + colour (PRD §11 contrast,
// colour-blind safe). Status chips, flags and category labels live here too.
import { useTranslation } from 'react-i18next';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { Category, Severity, Status } from '@/domain/types';
import { radius, SEVERITY_GLYPH, severityColors, space } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Icon, type IconName } from './Icon';
import { T } from './Text';

export function SeverityBadge({
  severity, size = 'md', solid = true, style,
}: { severity: Severity | null; size?: 'sm' | 'md' | 'lg'; solid?: boolean; style?: StyleProp<ViewStyle> }) {
  const { p } = useTheme();
  const { t } = useTranslation();
  if (!severity) {
    return (
      <View style={[styles.badge, { borderColor: p.borderStrong, borderWidth: 1, backgroundColor: p.raised }, style]}>
        <T v={size === 'lg' ? 'h3' : 'micro'} color="dim" weight="semibold">
          ? {t('category.unclassified')}
        </T>
      </View>
    );
  }
  const c = severityColors(p, severity);
  return (
    <View
      accessibilityLabel={`Severity ${severity}`}
      style={[
        styles.badge,
        size === 'lg' && styles.lg,
        { backgroundColor: solid ? c.fill : c.soft, borderColor: c.fill, borderWidth: solid ? 0 : 1 },
        style,
      ]}
    >
      <T v={size === 'lg' ? 'h3' : 'micro'} weight="bold" color={solid ? c.on : p.text}>
        {SEVERITY_GLYPH[severity]} {t(`severity.${severity}`)}
      </T>
    </View>
  );
}

const STATUS_ICON: Record<Status, IconName> = {
  New: 'circle-outline',
  Assigned: 'account-arrow-right-outline',
  'In Progress': 'progress-wrench',
  Closed: 'check-circle',
};

export function StatusChip({ status, merged, size = 'md' }: { status: Status; merged?: boolean; size?: 'md' | 'lg' }) {
  const { p } = useTheme();
  const { t } = useTranslation();
  const closed = status === 'Closed';
  const color = closed ? p.clear : status === 'New' ? p.textDim : p.accent;
  return (
    <View
      style={[
        styles.chip,
        size === 'lg' && { paddingVertical: 6, paddingHorizontal: 12 },
        { borderColor: color, backgroundColor: closed ? p.clearSoft : 'transparent', borderWidth: p.borderWidth },
      ]}
    >
      <Icon name={merged ? 'link-variant' : STATUS_ICON[status]} size={size === 'lg' ? 18 : 14} color={color} />
      <T v={size === 'lg' ? 'h3' : 'micro'} weight="semibold" color={closed ? p.clear : p.text}>
        {merged ? t('status.Merged') : t(`status.${status}`)}
      </T>
    </View>
  );
}

export function Flag({
  icon, label, tone = 'neutral',
}: { icon: IconName; label: string; tone?: 'neutral' | 'warn' | 'escalated' | 'danger' | 'accent' }) {
  const { p } = useTheme();
  const map = {
    neutral: { fg: p.textDim, bg: p.raised, bd: p.border },
    warn: { fg: p.medium, bg: p.mediumSoft, bd: p.medium },
    escalated: { fg: p.escalated, bg: p.escalatedSoft, bd: p.escalated },
    danger: { fg: p.high, bg: p.highSoft, bd: p.high },
    accent: { fg: p.accent, bg: p.accentSoft, bd: p.accent },
  }[tone];
  return (
    <View style={[styles.chip, { backgroundColor: map.bg, borderColor: map.bd, borderWidth: 1 }]}>
      <Icon name={icon} size={13} color={map.fg} />
      <T v="micro" weight="semibold" color={p.name === 'daylight' ? p.text : map.fg}>
        {label}
      </T>
    </View>
  );
}

export const CATEGORY_ICON: Record<Category, IconName> = {
  'Spill / Leak': 'water-alert-outline',
  'Fire / Ignition': 'fire',
  'Slip-Trip-Fall': 'walk',
  PPE: 'hard-hat',
  'Equipment Fault': 'cog-off-outline',
  'Chemical Exposure': 'flask-outline',
  Electrical: 'flash-alert-outline',
  Other: 'dots-horizontal-circle-outline',
};

export function CategoryLabel({ category, v = 'small' }: { category: Category | null; v?: 'small' | 'h3' | 'body' }) {
  const { p } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.cat}>
      <Icon name={category ? CATEGORY_ICON[category] : 'help-circle-outline'} size={v === 'h3' ? 20 : 16} color={p.textDim} />
      <T v={v} weight="medium" numberOfLines={1}>
        {category ? t(`category.${category}`) : t('category.unclassified')}
      </T>
    </View>
  );
}

export function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, alignSelf: 'flex-start' },
  lg: { paddingHorizontal: 12, paddingVertical: 6 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: radius.pill, alignSelf: 'flex-start',
  },
  cat: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 1 },
});
