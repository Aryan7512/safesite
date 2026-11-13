// Dashboard maths (PRD §6). Pure functions over RLS-scoped rows, so every
// widget has a defined, unit-tested definition and nothing is decorative.
// Merged duplicates are counted once (through the report they were merged into).

import { plantDate, PLANT_UTC_OFFSET_MIN, plantClock } from './shift';
import { HOUR } from './sla';
import type { AreaRow, Category, Item, SettingsRow, Severity, Shift } from './types';
import { CATEGORIES } from './types';

export type ShiftFilter = 'All' | Shift;
export type WindowFilter = '24h' | '7d' | '30d';

export interface Filters {
  shift: ShiftFilter;
  window: WindowFilter;
}

export const WINDOW_MS: Record<WindowFilter, number> = {
  '24h': 24 * HOUR,
  '7d': 7 * 24 * HOUR,
  '30d': 30 * 24 * HOUR,
};

const t = (iso: string | null) => (iso ? new Date(iso).getTime() : NaN);

export const isOpen = (i: Item) => i.action.status !== 'Closed';
export const isMerged = (i: Item) => i.action.merged_into != null || i.report.duplicate_status === 'merged';
export const isBreached = (i: Item, now: Date) =>
  isOpen(i) && (i.action.breached_at != null || now.getTime() >= t(i.action.due_at));
/** Unclassified reports run on the Medium clock and weight until triaged. */
export const effSeverity = (i: Item): Severity => i.report.severity ?? 'Medium';

export function applyFilters(items: Item[], f: Filters, now: Date): Item[] {
  const from = now.getTime() - WINDOW_MS[f.window];
  return items.filter(
    (i) =>
      !isMerged(i) &&
      (f.shift === 'All' || i.report.shift === f.shift) &&
      t(i.report.created_at) >= from,
  );
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const closeHours = (i: Item) => (t(i.action.closed_at) - t(i.report.created_at)) / HOUR;

// ─── KPI row ────────────────────────────────────────────────────────────────
export interface Kpis {
  open: number;
  highOpen: number;
  breaches: number;
  avgCloseHours: number | null;
  closedCount: number;
}

export function kpis(filtered: Item[], now: Date): Kpis {
  const open = filtered.filter(isOpen);
  const closed = filtered.filter((i) => i.action.status === 'Closed' && i.action.closed_at);
  const hours = closed.map(closeHours);
  return {
    open: open.length,
    highOpen: open.filter((i) => i.report.severity === 'High').length,
    breaches: open.filter((i) => isBreached(i, now)).length,
    avgCloseHours: hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : null,
    closedCount: closed.length,
  };
}

// ─── Heatmap + risk index ───────────────────────────────────────────────────
export type ZoneLevel = Severity | 'none';

export interface AreaRisk {
  area: AreaRow;
  level: ZoneLevel;            // highest open severity → zone colour
  openCount: number;
  openWeight: number;          // Σ High 5 / Medium 3 / Low 1
  repeatFlags: number;         // reports flagged as repeats in the window
  openBreaches: number;
  score: number;               // openWeight + repeat·w + breaches·w
  counts: Record<Severity, number>;
}

const SEV_RANK: Record<Severity, number> = { High: 3, Medium: 2, Low: 1 };

export function areaRisk(filtered: Item[], areas: AreaRow[], settings: SettingsRow, now: Date): AreaRisk[] {
  const w = settings.risk_weights;
  return areas
    .map((area) => {
      const mine = filtered.filter((i) => i.report.area_id === area.id);
      const open = mine.filter(isOpen);
      const counts: Record<Severity, number> = { High: 0, Medium: 0, Low: 0 };
      let level: ZoneLevel = 'none';
      for (const i of open) {
        const s = effSeverity(i);
        counts[s] += 1;
        if (level === 'none' || SEV_RANK[s] > SEV_RANK[level]) level = s;
      }
      const openWeight = counts.High * w.High + counts.Medium * w.Medium + counts.Low * w.Low;
      const repeatFlags = mine.filter((i) => i.report.is_repeat).length;
      const openBreaches = open.filter((i) => isBreached(i, now)).length;
      return {
        area,
        level,
        openCount: open.length,
        openWeight,
        repeatFlags,
        openBreaches,
        score: openWeight + repeatFlags * w.repeat + openBreaches * w.breach,
        counts,
      };
    })
    .sort((a, b) => b.score - a.score || a.area.name.localeCompare(b.area.name));
}

// ─── Repeat hazards (PRD §7: same area + category, 2+ in last 7 days, open or closed)
export interface RepeatGroup {
  area: AreaRow;
  category: Category;
  count: number;
  openCount: number;
  lastAt: string;
  reportIds: number[];
}

export function repeatGroups(
  items: Item[],
  areas: AreaRow[],
  settings: SettingsRow,
  now: Date,
  shift: ShiftFilter = 'All',
): RepeatGroup[] {
  const from = now.getTime() - settings.repeat_window_d * 24 * HOUR;
  const byKey = new Map<string, Item[]>();
  for (const i of items) {
    if (isMerged(i) || !i.report.category) continue;
    if (shift !== 'All' && i.report.shift !== shift) continue;
    if (t(i.report.created_at) < from) continue;
    const k = `${i.report.area_id}|${i.report.category}`;
    byKey.set(k, [...(byKey.get(k) ?? []), i]);
  }
  const out: RepeatGroup[] = [];
  for (const [k, group] of byKey) {
    if (group.length < 2) continue;
    const [areaId, category] = k.split('|');
    const area = areas.find((a) => a.id === Number(areaId));
    if (!area) continue;
    const sorted = [...group].sort((a, b) => t(b.report.created_at) - t(a.report.created_at));
    out.push({
      area,
      category: category as Category,
      count: group.length,
      openCount: group.filter(isOpen).length,
      lastAt: sorted[0].report.created_at,
      reportIds: sorted.map((i) => i.report.id),
    });
  }
  return out.sort((a, b) => b.count - a.count || t(b.lastAt) - t(a.lastAt));
}

// ─── Trends ─────────────────────────────────────────────────────────────────
export interface Bucket {
  start: number;
  end: number;
  label: string;
}

const DAY = 24 * HOUR;
/** Start of the plant-local day containing ms, as a UTC epoch. */
function plantDayStart(ms: number): number {
  const off = PLANT_UTC_OFFSET_MIN * 60_000;
  return Math.floor((ms + off) / DAY) * DAY - off;
}

/** 30 d → calendar weeks (Mon start), 7 d → days, 24 h → 4-hour blocks. */
export function buckets(window: WindowFilter, now: Date): Bucket[] {
  const end = now.getTime();
  const from = end - WINDOW_MS[window];
  const out: Bucket[] = [];
  if (window === '24h') {
    for (let s = from; s < end; s += 4 * HOUR) {
      out.push({ start: s, end: Math.min(s + 4 * HOUR, end), label: plantClock(new Date(s)) });
    }
    return out;
  }
  if (window === '7d') {
    for (let s = plantDayStart(from); s < end; s += DAY) {
      out.push({ start: Math.max(s, from), end: Math.min(s + DAY, end), label: plantDate(new Date(s)) });
    }
    return out.slice(-7);
  }
  // weeks: find Monday of the week containing `from` (plant local)
  const day0 = plantDayStart(from);
  const dow = new Date(day0 + PLANT_UTC_OFFSET_MIN * 60_000).getUTCDay(); // 0 = Sun
  let s = day0 - ((dow + 6) % 7) * DAY;
  for (; s < end; s += 7 * DAY) {
    out.push({ start: Math.max(s, from), end: Math.min(s + 7 * DAY, end), label: plantDate(new Date(s)) });
  }
  return out;
}

const inBucket = (ms: number, b: Bucket) => ms >= b.start && ms < b.end;

export interface VolumeRow {
  bucket: Bucket;
  byCategory: Record<Category, number>;
  total: number;
}

export function volumeTrend(filtered: Item[], window: WindowFilter, now: Date): VolumeRow[] {
  return buckets(window, now).map((bucket) => {
    const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
    let total = 0;
    for (const i of filtered) {
      if (!inBucket(t(i.report.created_at), bucket)) continue;
      byCategory[i.report.category ?? 'Other'] += 1;
      total += 1;
    }
    return { bucket, byCategory, total };
  });
}

export interface SpeedRow {
  bucket: Bucket;
  medianCloseHours: number | null;  // reports closed in this bucket
  breachRate: number | null;        // of reports created in bucket whose SLA has resolved (closed or past due)
  closed: number;
  resolved: number;
}

export function speedTrend(filtered: Item[], window: WindowFilter, now: Date): SpeedRow[] {
  return buckets(window, now).map((bucket) => {
    const closedHere = filtered.filter((i) => i.action.closed_at && inBucket(t(i.action.closed_at), bucket));
    const created = filtered.filter((i) => inBucket(t(i.report.created_at), bucket));
    const resolved = created.filter((i) => !isOpen(i) || now.getTime() >= t(i.action.due_at));
    const breached = resolved.filter(
      (i) => i.action.breached_at != null || (isOpen(i) && now.getTime() >= t(i.action.due_at)),
    );
    return {
      bucket,
      medianCloseHours: median(closedHere.map(closeHours)),
      breachRate: resolved.length ? breached.length / resolved.length : null,
      closed: closedHere.length,
      resolved: resolved.length,
    };
  });
}

// ─── SLA compliance + impact (PRD §13) ──────────────────────────────────────
export function slaCompliance(filtered: Item[], now: Date) {
  const resolved = filtered.filter((i) => !isOpen(i) || now.getTime() >= t(i.action.due_at));
  const breached = resolved.filter((i) => i.action.breached_at != null || isOpen(i));
  return {
    rate: resolved.length ? 1 - breached.length / resolved.length : null,
    resolved: resolved.length,
    medianCloseHours: median(filtered.filter((i) => i.action.closed_at).map(closeHours)),
  };
}

export interface Impact {
  medianReportSeconds: number | null;
  measured: number;
  paperMinutes: number;
  weeklyReports: number;
  minutesSavedPerWeek: number | null;
}

export function impact(items: Item[], settings: SettingsRow, now: Date): Impact {
  const week = items.filter((i) => !isMerged(i) && t(i.report.created_at) >= now.getTime() - 7 * DAY);
  const timed = items.map((i) => i.report.capture_seconds).filter((s): s is number => s != null && s > 0);
  const med = median(timed);
  return {
    medianReportSeconds: med,
    measured: timed.length,
    paperMinutes: settings.paper_minutes,
    weeklyReports: week.length,
    minutesSavedPerWeek: med == null ? null : Math.round(week.length * (settings.paper_minutes - med / 60)),
  };
}

// ─── Areas page ─────────────────────────────────────────────────────────────
export function closureBySeverity(items: Item[]) {
  const out: Record<Severity, number | null> = { High: null, Medium: null, Low: null };
  for (const s of ['High', 'Medium', 'Low'] as Severity[]) {
    out[s] = median(items.filter((i) => i.report.severity === s && i.action.closed_at).map(closeHours));
  }
  return out;
}
