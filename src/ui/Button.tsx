import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { radius, space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Icon, type IconName } from './Icon';
import { T } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet';
type Size = 'xl' | 'lg' | 'md' | 'sm';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  iconRight?: IconName;
  disabled?: boolean;
  loading?: boolean;
  full?: boolean;
  haptic?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  children?: ReactNode;
}

const HEIGHT: Record<Size, number> = { xl: touch.primary, lg: 56, md: touch.secondary, sm: touch.compact };

export function Button({
  label, onPress, variant = 'primary', size = 'md', icon, iconRight, disabled, loading, full, haptic, style, accessibilityHint,
}: ButtonProps) {
  const { p } = useTheme();
  const bg: Record<Variant, string> = {
    primary: p.accent,
    secondary: p.raised,
    ghost: 'transparent',
    danger: p.high,
    quiet: 'transparent',
  };
  const fg: Record<Variant, string> = {
    primary: p.accentText,
    secondary: p.text,
    ghost: p.accent,
    danger: p.onHigh,
    quiet: p.textDim,
  };
  const border = variant === 'secondary' || variant === 'ghost' ? p.borderStrong : 'transparent';
  const textV = size === 'xl' ? 'h2' : size === 'lg' ? 'h3' : size === 'md' ? 'h3' : 'small';
  const off = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={() => {
        if (haptic && Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        onPress?.();
      }}
      style={({ pressed, hovered, focused }: { pressed: boolean; hovered?: boolean; focused?: boolean }) => [
        styles.base,
        {
          minHeight: HEIGHT[size],
          paddingHorizontal: size === 'sm' ? space.md : space.lg,
          backgroundColor: bg[variant],
          borderColor: focused ? p.accent : border,
          borderWidth: variant === 'secondary' || variant === 'ghost' ? p.borderWidth : focused ? 2 : 0,
          opacity: off ? 0.45 : pressed ? 0.82 : hovered ? 0.92 : 1,
          alignSelf: full ? 'stretch' : 'flex-start',
          borderRadius: size === 'sm' ? radius.sm : radius.md,
        },
        style,
      ]}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator color={fg[variant]} />
        ) : icon ? (
          <Icon name={icon} size={size === 'sm' ? 18 : size === 'xl' ? 26 : 22} color={fg[variant]} />
        ) : null}
        <T v={textV} weight="semibold" color={fg[variant]} numberOfLines={2}>
          {label}
        </T>
        {iconRight ? <Icon name={iconRight} size={size === 'sm' ? 18 : 22} color={fg[variant]} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { justifyContent: 'center', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
