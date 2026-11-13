import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

/** Demo login tiles (Login screen). Off unless EXPO_PUBLIC_DEMO_MODE=1. */
export const DEMO_MODE = process.env.EXPO_PUBLIC_DEMO_MODE === '1';
export const DEMO_PASSWORD = process.env.EXPO_PUBLIC_DEMO_PASSWORD ?? '';

// Web: sessionStorage, so the Supervisor tab and the EHS tab stay signed in
// side by side during the demo. Native: AsyncStorage (persists across launches).
const webSession: SupportedStorage = {
  getItem: (k) => (typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(k)),
  setItem: (k, v) => {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(k, v);
  },
  removeItem: (k) => {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(k);
  },
};

export const supabase = createClient(SUPABASE_URL || 'http://localhost:54321', SUPABASE_KEY || 'missing', {
  auth: {
    storage: Platform.OS === 'web' ? webSession : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  realtime: { params: { eventsPerSecond: 20 } },
});

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/** Postgres / PostgREST error → a sentence for a toast. */
export function errorMessage(e: unknown): string {
  if (!e) return 'Something went wrong';
  if (typeof e === 'string') return e;
  const m = (e as { message?: string }).message;
  return m ? m.replace(/^.*?ERROR:\s*/, '') : 'Something went wrong';
}
