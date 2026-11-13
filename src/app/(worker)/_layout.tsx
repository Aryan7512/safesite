import { Redirect, Stack } from 'expo-router';
import { isStaff, useAuth } from '@/lib/auth';
import { useTheme } from '@/theme/ThemeProvider';

/** Worker surface (phone). Staff are sent to the dashboard. */
export default function WorkerLayout() {
  const { session, me, loading } = useAuth();
  const { p } = useTheme();
  if (loading) return null;
  if (!session) return <Redirect href="/login" />;
  if (me && isStaff(me)) return <Redirect href="/overview" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.bg }, animation: 'slide_from_right' }} />;
}
