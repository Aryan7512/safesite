import { View } from 'react-native';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Card } from '@/ui/Layout';
import { T } from '@/ui/Text';

/** Shown when the app was started without Supabase env vars. */
export function SetupNeeded() {
  const { p } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: p.bg, alignItems: 'center', justifyContent: 'center', padding: space.xl }}>
      <Card style={{ maxWidth: 520, width: '100%' }}>
        <T v="h2">SafeSite is not connected yet</T>
        <T color="dim">
          Copy .env.example to .env and set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, then restart
          the dev server (npx expo start -c).
        </T>
      </Card>
    </View>
  );
}
