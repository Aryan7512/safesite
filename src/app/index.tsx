import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { isStaff, useAuth } from '@/lib/auth';
import { isConfigured } from '@/lib/supabase';
import { useTheme } from '@/theme/ThemeProvider';
import { SetupNeeded } from '@/features/auth/SetupNeeded';

/** Role gate: one login, a different home per role (PRD §3, §4.1). */
export default function Index() {
  const { session, me, loading } = useAuth();
  const { p } = useTheme();

  if (!isConfigured) return <SetupNeeded />;
  if (loading || (session && !me)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: p.bg }}>
        <ActivityIndicator color={p.accent} size="large" />
      </View>
    );
  }
  if (!session || !me) return <Redirect href="/login" />;
  if (isStaff(me)) return <Redirect href="/overview" />;
  if (me.is_contractor && !me.induction_completed_at) return <Redirect href="/induction" />;
  return <Redirect href="/capture" />;
}
