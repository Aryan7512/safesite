import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { startOutboxWatcher } from '@/features/capture/submit';
import { notificationText } from '@/features/notifications/text';
import { AuthProvider, isStaff, useAuth } from '@/lib/auth';
import { useLang } from '@/lib/i18n';
import { onNotification, RealtimeBridge } from '@/lib/realtime';
import { FONT_MAP } from '@/theme/fonts';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { ToastProvider, useToast } from '@/ui/Toast';

SplashScreen.preventAutoHideAsync().catch(() => {});

function NotificationToaster() {
  const toast = useToast();
  const { me } = useAuth();
  const lang = useLang();
  useEffect(
    () =>
      onNotification((n) => {
        const t = notificationText(n, me?.role === 'worker' ? lang : 'en');
        toast({
          ...t,
          onPress: n.report_id
            ? () => router.push(isStaff(me) ? `/report/${n.report_id}` : `/reports/${n.report_id}`)
            : undefined,
        });
      }),
    [toast, me, lang],
  );
  return null;
}

function OutboxWatcher() {
  const toast = useToast();
  const { session } = useAuth();
  useEffect(() => {
    if (!session || Platform.OS === 'web') return;
    return startOutboxWatcher((n) => toast({ tone: 'success', title: n === 1 ? 'Saved report sent' : `${n} saved reports sent` }));
  }, [session, toast]);
  return null;
}

function Shell() {
  const { p } = useTheme();
  return (
    <>
      <StatusBar style={p.statusBar} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.bg }, animation: 'fade' }} />
      <RealtimeBridge />
      <NotificationToaster />
      <OutboxWatcher />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(FONT_MAP);
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: true } },
      }),
  );

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={qc}>
        <ThemeProvider>
          <AuthProvider>
            <ToastProvider>
              <Shell />
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
