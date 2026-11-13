import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { T } from './Text';

export function Screen({
  children, scroll, edges = ['top', 'left', 'right'], padded = true, footer,
}: { children: ReactNode; scroll?: boolean; edges?: Edge[]; padded?: boolean; footer?: ReactNode }) {
  const { p } = useTheme();
  const inner = padded ? { padding: space.lg, gap: space.lg } : undefined;
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: p.bg }}>
      {scroll ? (
        <ScrollView contentContainerStyle={[inner, { flexGrow: 1 }]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
      {footer}
    </SafeAreaView>
  );
}

export function Card({
  children, style, onPress, accent, padded = true,
}: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accent?: string; padded?: boolean }) {
  const { p } = useTheme();
  const base: ViewStyle = {
    backgroundColor: p.surface,
    borderColor: p.border,
    borderWidth: p.borderWidth,
    borderRadius: radius.lg,
    padding: padded ? space.lg : 0,
    gap: space.md,
    ...(accent ? { borderLeftWidth: 4, borderLeftColor: accent } : null),
  };
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
          base,
          { backgroundColor: pressed ? p.raised : hovered ? p.raised : p.surface },
          style,
        ]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}

export function Row({
  children, gap = space.sm, style, wrap, between, align = 'center',
}: {
  children: ReactNode; gap?: number; style?: StyleProp<ViewStyle>; wrap?: boolean; between?: boolean;
  align?: ViewStyle['alignItems'];
}) {
  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: align, gap, flexWrap: wrap ? 'wrap' : 'nowrap' },
        between && { justifyContent: 'space-between' },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionTitle({ children, right }: { children: string; right?: ReactNode }) {
  return (
    <Row between>
      <T v="label" color="dim">
        {children}
      </T>
      {right}
    </Row>
  );
}

export function Divider() {
  const { p } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: p.border }} />;
}

export function Empty({ title, body }: { title: string; body?: string }) {
  const { p } = useTheme();
  return (
    <View style={{ padding: space.xl, alignItems: 'center', gap: space.sm, borderRadius: radius.lg, borderWidth: 1, borderColor: p.border, borderStyle: 'dashed' }}>
      <T v="h3" center>
        {title}
      </T>
      {body ? (
        <T v="small" color="dim" center>
          {body}
        </T>
      ) : null}
    </View>
  );
}
