import { Pressable, StyleSheet, View } from 'react-native';
import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { T } from './Text';

export function Segmented<V extends string>({
  options, value, onChange, label, size = 'md',
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
  label?: string;
  size?: 'md' | 'lg';
}) {
  const { p } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.wrap, { borderColor: p.border, backgroundColor: p.sunken, borderWidth: p.borderWidth }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${label ?? ''} ${o.label}`.trim()}
            onPress={() => onChange(o.value)}
            style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
              styles.opt,
              { minHeight: size === 'lg' ? 48 : 34, paddingHorizontal: size === 'lg' ? 14 : 12 },
              on ? { backgroundColor: p.accent } : hovered ? { backgroundColor: p.raised } : null,
            ]}
          >
            <T v={size === 'lg' ? 'h3' : 'small'} weight="semibold" color={on ? p.accentText : p.textDim}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', borderRadius: radius.md, padding: 3, gap: 2, alignSelf: 'flex-start' },
  opt: { borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
});
