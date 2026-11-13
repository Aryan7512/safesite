// Thin wrappers over the audited RPCs and the two Edge Functions.
import type { Category, Severity } from '@/domain/types';
import { errorMessage, supabase } from './supabase';

async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(errorMessage(error));
  return data as T;
}

export interface CreateReportInput {
  clientId: string;
  areaId: number;
  transcript: string;
  inputMode: 'voice' | 'text';
  captureSeconds: number | null;
  photoPaths: string[];
  audioPath: string | null;
  lat: number | null;
  lng: number | null;
  language: string | null;
}

export interface CreatedReport {
  id: number;
  report_no: number;
  label: string;
  created: boolean;
  created_at: string;
}

export const api = {
  createReport: (i: CreateReportInput) =>
    rpc<CreatedReport>('create_report', {
      p_client_id: i.clientId,
      p_area_id: i.areaId,
      p_transcript: i.transcript,
      p_input_mode: i.inputMode,
      p_capture_seconds: i.captureSeconds,
      p_photo_paths: i.photoPaths,
      p_audio_path: i.audioPath,
      p_lat: i.lat,
      p_lng: i.lng,
      p_language: i.language,
    }),
  accept: (id: number) => rpc('accept_report', { p_report: id }),
  reclassify: (id: number, category: Category, severity: Severity, reason?: string) =>
    rpc('reclassify_report', { p_report: id, p_category: category, p_severity: severity, p_reason: reason ?? null }),
  assign: (id: number, ownerId: string, dueAt?: string | null) =>
    rpc('assign_action', { p_report: id, p_owner: ownerId, p_due_at: dueAt ?? null }),
  start: (id: number) => rpc('start_action', { p_report: id }),
  close: (id: number, note: string, fixPhotoPath?: string | null) =>
    rpc('close_action', { p_report: id, p_note: note, p_fix_photo_path: fixPhotoPath ?? null }),
  merge: (id: number) => rpc('merge_duplicate', { p_report: id }),
  dismiss: (id: number) => rpc('dismiss_duplicate', { p_report: id }),
  markRead: (ids?: number[]) => rpc('mark_notifications_read', { p_ids: ids ?? null }),
  completeInduction: (score: number) => rpc('complete_induction', { p_score: score }),
  setLanguage: (lang: 'en' | 'hi') => rpc('set_my_language', { p_language: lang }),
  fastForward: (minutes = 180) =>
    rpc<{ escalated: number; breached: number; demo_offset_minutes: number }>('demo_fast_forward', { p_minutes: minutes }),
  checkSla: () => rpc<{ escalated: number; breached: number }>('check_sla'),
  resetDemo: () => rpc<{ reports: number }>('reset_demo'),
};

export interface TranscribeResult {
  ok: boolean;
  text?: string;
  language?: 'en' | 'hi' | 'mixed' | null;
  error?: string;
}

async function invoke<T>(name: string, body: Record<string, unknown>, timeoutMs: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs));
  const call = supabase.functions.invoke(name, { body }).then(({ data, error }) => {
    if (error) throw error;
    return data as T;
  });
  return Promise.race([call, timeout]);
}

export async function transcribe(path: string): Promise<TranscribeResult> {
  try {
    return await invoke<TranscribeResult>('transcribe', { path }, 30_000);
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Fire-and-forget from the phone; the report already exists either way. */
export async function classify(reportId: number) {
  try {
    return await invoke<{ ok: boolean }>('classify', { report_id: reportId }, 25_000);
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
