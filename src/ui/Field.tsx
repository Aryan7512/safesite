import { useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { useLang } from '@/lib/i18n';
import { fontFor } from '@/theme/fonts';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { T } from './Text';

export function Field({ label, hint, error, large, style, ...rest }: TextInputProps & { label?: string; hint?: string; error?: string | null; large?: boolean }) {
  const { p } = useTheme();
  const lang = useLang();
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: space.xs }}>
      {label ? (
        <T v="label" color="dim">
          {label}
        </T>
      ) : null}
      <TextInput
        placeholderTextColor={p.textFaint}
        onFocus={(e) => {
          setFocus(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocus(false);
          rest.onBlur?.(e);
        }}
        style={[
          {
            fontFamily: fontFor('regular', lang === 'hi'),
            fontSize: large ? 18 : 15,
            lineHeight: large ? 28 : 22,
            color: p.text,
            backgroundColor: p.sunken,
            borderColor: error ? p.danger : focus ? p.accent : p.borderStrong,
            borderWidth: focus ? 2 : p.borderWidth,
            borderRadius: radius.md,
            paddingHorizontal: space.md,
            paddingVertical: space.md,
            minHeight: 48,
            textAlignVertical: rest.multiline ? 'top' : 'center',
            outlineStyle: 'none',
          } as object,
          style,
        ]}
        {...rest}
      />
      {error ? (
        <T v="small" color="danger">
          {error}
        </T>
      ) : hint ? (
        <T v="small" color="faint">
          {hint}
        </T>
      ) : null}
    </View>
  );
}
