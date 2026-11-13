import { describe, expect, it } from 'vitest';
import { applyGuard, keywordGuard } from '../supabase/functions/_shared/guard';
import { validateClassification } from '../supabase/functions/_shared/schema';
import {
  applyFilters, areaRisk, attention, buckets, categoryMix, impact, kpis, median, oldestOpen, ownerLoad, plantStatus, repeatGroups, shiftMix,
  speedBySeverity, speedTrend, timeToAssignMinutes, volumeBySeverity, volumeTrend,
} from '../src/domain/metrics';
import { shiftFor } from '../src/domain/shift';
import { countdownText, formatDuration, slaState } from '../src/domain/sla';
import type { ActionRow, AreaRow, Item, ReportRow } from '../src/domain/types';
import { DEFAULT_SETTINGS } from '../src/domain/types';

describe('keyword guard (PRD §8)', () => {
  it.each([
    ['Gas leak near tank 3', 'gas, leak'],
    ['टैंक के पास गैस लीक हो रही है', 'gas, leak'],
    ['motor se dhuan nikal raha hai', 'smoke'],
    ['आग लगी है', 'fire'],
    ['worker is unconscious near the pump', 'unconscious'],
    ['वह बेहोश हो गया', 'unconscious'],
    ['There was an EXPLOSION', 'explosion'],
    ['gas cylinder is leaking', 'leak'],
    ['Haath par chot lagi', 'injury'],
  ])('matches %s', (text, reason) => {
    expect(keywordGuard(text).reason).toBe(reason);
  });

  it.each([
    'Pallets in the aisle',
    'आगे का रास्ता बंद है',        // "aage" (ahead) is not "aag" (fire)
    'Aage ka rasta band hai',
    'fire extinguisher is empty',   // safety equipment, not a fire
    'gas detector needs calibration',
    'Gas cylinders stored without chain',
    'leaky? no. leaker? no. Leakproof seal ok', // only whole words
  ])('does not match %s', (text) => {
    expect(keywordGuard(text).hit).toBe(false);
  });

  it('raises severity to at least High', () => {
    const g = keywordGuard('small gas smell');
    expect(applyGuard('Low', g)).toBe('High');
    expect(applyGuard('High', g)).toBe('High');
    expect(applyGuard(null, g)).toBe('High');
    expect(applyGuard('Low', keywordGuard('cable on floor'))).toBe('Low');
  });
});

describe('output contract validation', () => {
  it('passes valid output', () => {
    const v = validateClassification({ category: 'PPE', severity: 'Low', confidence: 0.8, summary: 'No gloves', language: 'en' });
    expect(v).toMatchObject({ category: 'PPE', severity: 'Low', confidence: 0.8, invalid: false });
  });
  it('coerces anything outside the enum to Other + invalid', () => {
    const v = validateClassification({ category: 'Explosion', severity: 'Critical', confidence: '85', summary: '' });
    expect(v.category).toBe('Other');
    expect(v.severity).toBe('Medium');
    expect(v.confidence).toBe(0.85);
    expect(v.invalid).toBe(true);
    expect(v.problems.length).toBe(3);
  });
  it('survives garbage', () => {
    expect(validateClassification(null).invalid).toBe(true);
    expect(validateClassification('DROP TABLE reports').category).toBe('Other');
  });
});

describe('shifts', () => {
  // IST = UTC + 5:30
  it.each([
    ['2026-11-13T00:30:00Z', 'A'], // 06:00 IST
    ['2026-11-13T08:29:00Z', 'A'], // 13:59
    ['2026-11-13T08:30:00Z', 'B'], // 14:00
    ['2026-11-13T16:29:00Z', 'B'], // 21:59
    ['2026-11-13T16:30:00Z', 'C'], // 22:00
    ['2026-11-12T20:00:00Z', 'C'], // 01:30
    ['2026-11-13T00:29:00Z', 'C'], // 05:59
  ])('%s → %s', (iso, shift) => {
    expect(shiftFor(new Date(iso))).toBe(shift);
  });
});

describe('sla helpers', () => {
  it('formats durations', () => {
    expect(formatDuration(45 * 60_000)).toBe('45 m');
    expect(formatDuration(200 * 60_000)).toBe('3 h 20 m');
    expect(formatDuration(52 * 3_600_000)).toBe('2 d 4 h');
  });
});

// ─── Metrics on a small hand-checked dataset ────────────────────────────────
const NOW = new Date('2026-11-13T10:00:00Z');
const H = 3_600_000;
const iso = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * H).toISOString();
const areas: AreaRow[] = [
  { id: 1, code: 'TANK', name: 'Tank Farm', name_hi: '', qr_code: '', svg_region_id: 'zone-tank', supervisor_id: null, lat: null, lng: null },
  { id: 2, code: 'LOAD', name: 'Loading Bay', name_hi: '', qr_code: '', svg_region_id: 'zone-load', supervisor_id: null, lat: null, lng: null },
  { id: 3, code: 'ETP', name: 'ETP', name_hi: '', qr_code: '', svg_region_id: 'zone-etp', supervisor_id: null, lat: null, lng: null },
];

let nextId = 1;
function item(p: Partial<ReportRow> & { hoursAgo: number }, a: Partial<ActionRow> = {}): Item {
  const id = nextId++;
  const created = iso(p.hoursAgo);
  const report = {
    id, report_no: id, client_id: '', user_id: 'u', area_id: 1, shift: shiftFor(new Date(created)), created_at: created,
    input_mode: 'voice', capture_seconds: null, transcript: '', language: 'en', photo_urls: [], audio_url: null, lat: null, lng: null,
    ai_status: 'done', ai_category: null, ai_severity: null, ai_confidence: 0.9, ai_model: null, ai_error: null, summary: null,
    guard_reason: null, category: 'Spill / Leak', severity: 'Medium', needs_review: false, triaged_at: null, is_duplicate_of: null,
    duplicate_status: null, is_repeat: false, repeat_count: 0, ...p,
  } as ReportRow;
  const action: ActionRow = {
    id, report_id: id, owner_id: null, status: 'New', due_at: iso(p.hoursAgo - 24), escalate_at: iso(p.hoursAgo - 12),
    escalated_level: 0, escalated_at: null, breached_at: null, assigned_at: null, started_at: null, closed_at: null,
    resolution_note: null, fix_photo_url: null, merged_into: null, due_overridden: false, ...a,
  };
  return { report, action };
}

const items: Item[] = [
  item({ hoursAgo: 1, severity: 'High', area_id: 1, is_repeat: true, repeat_count: 3, capture_seconds: 40 }, { due_at: iso(-3) }),
  item({ hoursAgo: 30, severity: 'Medium', area_id: 1 }, { breached_at: iso(6) }), // open breach
  item({ hoursAgo: 50, severity: 'Low', area_id: 2, capture_seconds: 60 }, { status: 'Closed', closed_at: iso(40) }), // closed in 10 h
  item({ hoursAgo: 60, severity: 'Medium', area_id: 1, is_repeat: true, repeat_count: 2 }, { status: 'Closed', closed_at: iso(56) }), // 4 h
  item({ hoursAgo: 100, severity: 'Medium', area_id: 1, category: 'Spill / Leak' }, { status: 'Closed', closed_at: iso(98) }),
  item({ hoursAgo: 2, severity: 'Low', area_id: 2, duplicate_status: 'merged' }, { merged_into: 1 }), // ignored everywhere
  item({ hoursAgo: 24 * 20, severity: 'High', area_id: 3 }, { status: 'Closed', closed_at: iso(24 * 20 - 2) }), // old
];

describe('dashboard metrics (PRD §6)', () => {
  const f7 = applyFilters(items, { shift: 'All', window: '7d' }, NOW);

  it('filters by window and drops merged duplicates', () => {
    expect(f7.length).toBe(5);
    expect(applyFilters(items, { shift: 'All', window: '30d' }, NOW).length).toBe(6);
    expect(applyFilters(items, { shift: 'All', window: '24h' }, NOW).length).toBe(1);
  });

  it('KPI row', () => {
    const k = kpis(f7, NOW);
    expect(k.open).toBe(2);
    expect(k.highOpen).toBe(1);
    expect(k.breaches).toBe(1);
    expect(k.avgCloseHours).toBeCloseTo((10 + 4 + 2) / 3);
  });

  it('risk index = open weights + 2·repeat flags + 2·open breaches', () => {
    const r = areaRisk(f7, areas, DEFAULT_SETTINGS, NOW);
    const tank = r.find((x) => x.area.code === 'TANK')!;
    expect(tank.openWeight).toBe(5 + 3);
    expect(tank.repeatFlags).toBe(2);
    expect(tank.openBreaches).toBe(1);
    expect(tank.score).toBe(8 + 4 + 2);
    expect(tank.level).toBe('High');
    expect(r[0].area.code).toBe('TANK');
    expect(r.find((x) => x.area.code === 'LOAD')!.level).toBe('none');
  });

  it('repeat hazards: same area + category, 2+ in 7 days, open or closed', () => {
    const g = repeatGroups(items, areas, DEFAULT_SETTINGS, NOW);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ category: 'Spill / Leak', count: 4, openCount: 2 });
  });

  it('trend buckets cover the window', () => {
    expect(buckets('24h', NOW)).toHaveLength(6);
    expect(buckets('7d', NOW).length).toBeGreaterThanOrEqual(7);
    const w = buckets('30d', NOW);
    expect(w.length).toBeGreaterThanOrEqual(5);
    expect(w[0].start).toBe(NOW.getTime() - 30 * 24 * H);
    const vol = volumeTrend(f7, '7d', NOW);
    expect(vol.reduce((a, b) => a + b.total, 0)).toBe(5);
    const speed = speedTrend(f7, '7d', NOW);
    expect(speed.reduce((a, b) => a + b.closed, 0)).toBe(3);
  });

  it('impact uses measured time-to-report', () => {
    const i = impact(items, DEFAULT_SETTINGS, NOW);
    expect(i.medianReportSeconds).toBe(50);
    expect(i.weeklyReports).toBe(5);
    expect(i.minutesSavedPerWeek).toBe(Math.round(5 * (8 - 50 / 60)));
  });

  it('median', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });

  it('SLA state and countdown', () => {
    expect(slaState(items[1].action, NOW)).toBe('breached');
    expect(slaState(items[0].action, NOW)).toBe('ok');
    expect(countdownText(items[0].action, NOW)).toEqual({ text: 'Due in 3 h 0 m', overdue: false });
  });
});

describe('severity-coded metrics', () => {
  const f7 = applyFilters(items, { shift: 'All', window: '7d' }, NOW);

  it('volume is split by severity and adds up', () => {
    const rows = volumeBySeverity(f7, '7d', NOW);
    const sum = rows.reduce((a, r) => ({ H: a.H + r.sev.High, M: a.M + r.sev.Medium, L: a.L + r.sev.Low }), { H: 0, M: 0, L: 0 });
    expect(sum).toEqual({ H: 1, M: 3, L: 1 });
    expect(rows.every((r) => r.total === r.sev.High + r.sev.Medium + r.sev.Low)).toBe(true);
  });

  it('median close time is per severity', () => {
    const rows = speedBySeverity(f7, '7d', NOW);
    expect(rows.reduce((a, r) => a + r.closed, 0)).toBe(3);
    const low = rows.map((r) => r.median.Low).filter((x): x is number => x != null);
    expect(low).toEqual([10]);
    const med = rows.map((r) => r.median.Medium).filter((x): x is number => x != null).sort((a, b) => a - b);
    expect(med).toEqual([2, 4]);
  });

  it('shift and category mixes cover every report once', () => {
    expect(shiftMix(f7).reduce((a, r) => a + r.total, 0)).toBe(5);
    const cats = categoryMix(f7);
    expect(cats).toHaveLength(1);
    expect(cats[0]).toMatchObject({ category: 'Spill / Leak', total: 5 });
  });

  it('attention list puts the High report first and says why', () => {
    const a = attention(items, NOW);
    expect(a).toHaveLength(2);
    expect(a[0].item.report.severity).toBe('High');
    expect(a[0].reasons).toEqual(expect.arrayContaining(['high', 'untriaged']));
    expect(a[1].reasons).toContain('overdue');
  });

  it('plant status, oldest open, owner load and time to assign', () => {
    const st = plantStatus(items, areas, NOW);
    expect(st).toMatchObject({ highCount: 1, highAreas: ['Tank Farm'], overdueCount: 1, openCount: 2 });
    expect(oldestOpen(items, NOW)?.hours).toBeCloseTo(30);
    expect(ownerLoad(items, NOW)).toEqual([]);
    expect(timeToAssignMinutes(f7)).toEqual({ median: null, count: 0 });
    const assigned = [item({ hoursAgo: 5 }, { assigned_at: iso(4.5), owner_id: 'o1' })];
    expect(timeToAssignMinutes(assigned).median).toBeCloseTo(30);
    expect(ownerLoad(assigned, NOW)[0]).toMatchObject({ ownerId: 'o1', open: 1, overdue: 0 });
  });
});
