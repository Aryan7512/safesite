// The in-progress report on the phone. Lives in memory between the capture,
// camera, scan and review screens.
import { randomUUID } from 'expo-crypto';
import { create } from 'zustand';

export interface Photo {
  uri: string;
  width?: number;
}

export interface Draft {
  clientId: string;
  /** First tap on the capture screen — the "time to report" clock starts here. */
  startedAt: number | null;
  areaId: number | null;
  areaSource: 'qr' | 'list' | null;
  photos: Photo[];
  audio: { uri: string; durationMs: number } | null;
  audioPath: string | null;     // uploaded storage path (set during review)
  transcript: string;
  transcriptLanguage: 'en' | 'hi' | 'mixed' | null;
  transcribeState: 'idle' | 'running' | 'done' | 'failed';
  inputMode: 'voice' | 'text';
  lat: number | null;
  lng: number | null;
}

interface CaptureStore extends Draft {
  touch: () => void;
  setArea: (id: number, source: 'qr' | 'list') => void;
  addPhoto: (p: Photo) => void;
  removePhoto: (i: number) => void;
  setAudio: (a: Draft['audio']) => void;
  set: (patch: Partial<Draft>) => void;
  reset: () => void;
}

const fresh = (): Draft => ({
  clientId: randomUUID(),
  startedAt: null,
  areaId: null,
  areaSource: null,
  photos: [],
  audio: null,
  audioPath: null,
  transcript: '',
  transcriptLanguage: null,
  transcribeState: 'idle',
  inputMode: 'voice',
  lat: null,
  lng: null,
});

export const MAX_PHOTOS = 3;

export const useCapture = create<CaptureStore>((set) => ({
  ...fresh(),
  touch: () => set((s) => (s.startedAt ? s : { startedAt: Date.now() })),
  setArea: (id, source) => set((s) => ({ areaId: id, areaSource: source, startedAt: s.startedAt ?? Date.now() })),
  addPhoto: (p) => set((s) => ({ photos: [...s.photos, p].slice(0, MAX_PHOTOS), startedAt: s.startedAt ?? Date.now() })),
  removePhoto: (i) => set((s) => ({ photos: s.photos.filter((_, j) => j !== i) })),
  setAudio: (a) =>
    set((s) => ({
      audio: a,
      audioPath: null,
      transcribeState: 'idle',
      inputMode: a ? 'voice' : s.inputMode,
      startedAt: s.startedAt ?? Date.now(),
    })),
  set: (patch) => set(patch),
  reset: () => set(fresh()),
}));

export const captureSeconds = (d: Pick<Draft, 'startedAt'>) =>
  d.startedAt ? Math.round((Date.now() - d.startedAt) / 1000) : null;
