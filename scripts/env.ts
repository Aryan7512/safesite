// Loads .env and .env.local for the Node scripts. The secret key lives only in
// .env.local (git-ignored) and is never shipped to the app.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const root = join(__dirname, '..');
for (const f of ['.env', '.env.local']) {
  const p = join(root, f);
  if (existsSync(p)) process.loadEnvFile(p);
}

export const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const PUBLISHABLE = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
export const SECRET = process.env.SUPABASE_SECRET_KEY ?? '';

export function need(...names: [string, string][]) {
  const missing = names.filter(([, v]) => !v).map(([n]) => n);
  if (missing.length) {
    console.error(`Missing ${missing.join(', ')} — set them in .env / .env.local (see .env.example).`);
    process.exit(1);
  }
}

export function admin() {
  need(['EXPO_PUBLIC_SUPABASE_URL', URL], ['SUPABASE_SECRET_KEY', SECRET]);
  return createClient(URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function anonClient() {
  need(['EXPO_PUBLIC_SUPABASE_URL', URL], ['EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', PUBLISHABLE]);
  return createClient(URL, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false } });
}
