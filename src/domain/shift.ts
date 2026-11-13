import type { Shift } from './types';

// Plant X is in India: IST is UTC+05:30 all year (no DST), so a fixed offset is
// exact and avoids depending on Intl time-zone data on the phone.
export const PLANT_UTC_OFFSET_MIN = 330;

/** Hour 0–23 in plant local time. */
export function plantHour(d: Date): number {
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes() + PLANT_UTC_OFFSET_MIN;
  return Math.floor((((mins % 1440) + 1440) % 1440) / 60);
}

/** A = 06:00–14:00, B = 14:00–22:00, C = 22:00–06:00 (PRD §7). */
export function shiftFor(d: Date): Shift {
  const h = plantHour(d);
  if (h >= 6 && h < 14) return 'A';
  if (h >= 14 && h < 22) return 'B';
  return 'C';
}

export const SHIFT_HOURS: Record<Shift, string> = {
  A: '06–14',
  B: '14–22',
  C: '22–06',
};

/** Format a time in plant local time, e.g. "14:05". */
export function plantClock(d: Date): string {
  const local = new Date(d.getTime() + PLANT_UTC_OFFSET_MIN * 60_000);
  return `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`;
}

/** "13 Nov" in plant local time. */
export function plantDate(d: Date): string {
  const local = new Date(d.getTime() + PLANT_UTC_OFFSET_MIN * 60_000);
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][local.getUTCMonth()];
  return `${local.getUTCDate()} ${m}`;
}
