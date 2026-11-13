// Submit pipeline + basic retry (PRD §10: "if submit fails, keep the report in
// local storage and retry on reconnect" — explicitly not full offline sync).
//
// Every step is idempotent: media paths are fixed per client_id and
// create_report() returns the existing report for a repeated client_id, so a
// retry can never create a second report.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { addNetworkStateListener } from 'expo-network';
import { AppState } from 'react-native';
import { create } from 'zustand';
import { api, classify, type CreatedReport } from '@/lib/api';
import { audioMime, upload } from '@/lib/media';
import type { Draft } from './store';

export interface PendingReport {
  draft: Draft;
  uid: string;
  captureSeconds: number | null;
  attempts: number;
  lastError: string | null;
  queuedAt: number;
}

const KEY = 'safesite.outbox.v1';

export async function submitDraft(d: Draft, uid: string, captureSeconds: number | null): Promise<CreatedReport> {
  const base = `${uid}/${d.clientId}`;
  const photoPaths: string[] = [];
  for (let i = 0; i < d.photos.length; i++) {
    photoPaths.push(await upload(`${base}/photo-${i + 1}.jpg`, d.photos[i].uri, 'image/jpeg'));
  }
  let audioPath = d.audioPath;
  if (d.audio && !audioPath) {
    const { ext, type } = audioMime(d.audio.uri);
    audioPath = await upload(`${base}/voice.${ext}`, d.audio.uri, type);
  }
  const created = await api.createReport({
    clientId: d.clientId,
    areaId: d.areaId!,
    transcript: d.transcript.trim(),
    inputMode: d.inputMode,
    captureSeconds,
    photoPaths,
    audioPath,
    lat: d.lat,
    lng: d.lng,
    language: d.transcriptLanguage,
  });
  // Classification runs after the report exists; failure leaves it Unclassified.
  void classify(created.id);
  return created;
}

const isNetworkError = (e: unknown) =>
  /network|fetch|timeout|offline|failed to fetch|connection/i.test(String((e as Error)?.message ?? e));

interface OutboxState {
  pending: PendingReport[];
  sending: boolean;
  load: () => Promise<void>;
  enqueue: (p: Omit<PendingReport, 'attempts' | 'lastError' | 'queuedAt'>, error: string) => Promise<void>;
  flush: () => Promise<number>;
}

async function persist(pending: PendingReport[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(pending)).catch(() => {});
}

export const useOutbox = create<OutboxState>((set, get) => ({
  pending: [],
  sending: false,
  load: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw) set({ pending: JSON.parse(raw) });
    } catch {
      /* ignore */
    }
  },
  enqueue: async (p, error) => {
    const next = [
      ...get().pending.filter((x) => x.draft.clientId !== p.draft.clientId),
      { ...p, attempts: 1, lastError: error, queuedAt: Date.now() },
    ];
    set({ pending: next });
    await persist(next);
  },
  flush: async () => {
    if (get().sending || get().pending.length === 0) return 0;
    set({ sending: true });
    let sent = 0;
    const remaining: PendingReport[] = [];
    for (const p of get().pending) {
      try {
        await submitDraft(p.draft, p.uid, p.captureSeconds);
        sent += 1;
      } catch (e) {
        remaining.push({ ...p, attempts: p.attempts + 1, lastError: String((e as Error)?.message ?? e) });
      }
    }
    set({ pending: remaining, sending: false });
    await persist(remaining);
    return sent;
  },
}));

export { isNetworkError };

/** Retry on reconnect and when the app returns to the foreground. */
export function startOutboxWatcher(onSent: (n: number) => void) {
  const { load, flush } = useOutbox.getState();
  load().then(() => flush().then((n) => n && onSent(n)));
  const net = addNetworkStateListener((s) => {
    if (s.isConnected && s.isInternetReachable !== false) flush().then((n) => n && onSent(n));
  });
  const app = AppState.addEventListener('change', (st) => {
    if (st === 'active') flush().then((n) => n && onSent(n));
  });
  return () => {
    net.remove();
    app.remove();
  };
}
