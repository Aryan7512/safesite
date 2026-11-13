import type { ActionRow, Severity, SettingsRow } from './types';

export const HOUR = 3_600_000;
export const MIN = 60_000;

export function slaFor(sev: Severity | null, settings: SettingsRow) {
  return settings.sla[sev ?? 'Medium'];
}

/** Default due date for an assignment (PRD §7 table): created + due hours. */
export function defaultDueAt(createdAt: string, sev: Severity | null, settings: SettingsRow): Date {
  return new Date(new Date(createdAt).getTime() + slaFor(sev, settings).due_h * HOUR);
}

export type SlaState = 'closed' | 'ok' | 'soon' | 'escalated' | 'breached';

export function slaState(action: ActionRow, now: Date): SlaState {
  if (action.status === 'Closed') return 'closed';
  const due = new Date(action.due_at).getTime();
  if (action.breached_at || now.getTime() >= due) return 'breached';
  if (action.escalated_level > 0) return 'escalated';
  if (due - now.getTime() < HOUR) return 'soon';
  return 'ok';
}

/** "3 h 20 m", "45 m", "2 d 4 h" */
export function formatDuration(ms: number): string {
  const abs = Math.abs(ms);
  const totalMin = Math.floor(abs / MIN);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} m`;
  return `${m} m`;
}

/** "Due in 3 h 20 m" / "Overdue 1 h 5 m" */
export function countdownText(action: ActionRow, now: Date): { text: string; overdue: boolean } {
  if (action.status === 'Closed') return { text: 'Closed', overdue: false };
  const diff = new Date(action.due_at).getTime() - now.getTime();
  return diff >= 0
    ? { text: `Due in ${formatDuration(diff)}`, overdue: false }
    : { text: `Overdue ${formatDuration(diff)}`, overdue: true };
}

/** "4 m ago", "3 h ago", "2 d ago" */
export function ago(iso: string, now: Date): string {
  const diff = now.getTime() - new Date(iso).getTime();
  if (diff < MIN) return 'just now';
  return `${formatDuration(diff)} ago`;
}

export function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}
