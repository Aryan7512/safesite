import Svg, { Path, Rect } from 'react-native-svg';
import { View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Row } from './Layout';
import { T } from './Text';

/** Mark: a shield with a check — a safe site. Drawn, not imported. */
export function BrandMark({ size = 32 }: { size?: number }) {
  const { p } = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" accessibilityLabel="SafeSite">
      <Rect x="0" y="0" width="32" height="32" rx="8" fill={p.accent} />
      <Path d="M16 6 L24 9 V15.5 C24 20.5 20.6 24.3 16 26 C11.4 24.3 8 20.5 8 15.5 V9 Z" fill={p.accentText} opacity={0.18} />
      <Path d="M16 6 L24 9 V15.5 C24 20.5 20.6 24.3 16 26 C11.4 24.3 8 20.5 8 15.5 V9 Z" fill="none" stroke={p.accentText} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M12 16 L15 19 L20.5 13" fill="none" stroke={p.accentText} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function Brand({ sub }: { sub?: string }) {
  return (
    <Row gap={10}>
      <BrandMark />
      <View>
        <T v="h3" weight="bold">
          SafeSite
        </T>
        {sub ? (
          <T v="micro" color="dim">
            {sub}
          </T>
        ) : null}
      </View>
    </Row>
  );
}
