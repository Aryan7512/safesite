// Generates supabase/seed/templates.json — the seeded story (PRD §14):
//   ~70 reports over 30 days, 8 areas, 3 shifts, Hindi / English / mixed transcripts.
//   Planted: 2 repeat hazards, 2 duplicate pairs, 3 open SLA breaches, 1 open High,
//   closed reports with resolution notes, one AI-vs-human override.
// Deterministic (seeded PRNG). It also checks that no *unplanned* duplicate or
// repeat appears, so the dashboard shows exactly the story we planned.
//
//   npx tsx scripts/gen-seed.ts

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyGuard, keywordGuard } from '../supabase/functions/_shared/guard';
import { AREA_CODES } from './seed-data';

type Cat = 'Spill / Leak' | 'Fire / Ignition' | 'Slip-Trip-Fall' | 'PPE' | 'Equipment Fault' | 'Chemical Exposure' | 'Electrical' | 'Other';
type Sev = 'High' | 'Medium' | 'Low';
type Lang = 'en' | 'hi' | 'mixed';
type Status = 'New' | 'Assigned' | 'In Progress' | 'Closed';

interface Phrase {
  text: string;
  lang: Lang;
  sev: Sev;
  summary: string;
  note: string;
}

// ─── Transcript pool (Hindi to be reviewed by a native speaker, PRD §11) ────
const POOL: Record<Cat, Phrase[]> = {
  'Spill / Leak': [
    { text: 'Pipe flange se oil tapak raha hai, neeche tray bhar gayi hai.', lang: 'mixed', sev: 'Medium', summary: 'Oil dripping from pipe flange; drip tray full', note: 'Flange gasket replaced, drip tray emptied and area cleaned.' },
    { text: 'पंप के पास फर्श पर केमिकल फैला हुआ है, किसी ने साफ़ नहीं किया।', lang: 'hi', sev: 'Medium', summary: 'Chemical spill on floor near pump, not cleaned', note: 'Spill absorbed with spill kit, waste drummed and labelled.' },
    { text: 'Small leak at the valve gland on the transfer line, drops every few seconds.', lang: 'en', sev: 'Medium', summary: 'Valve gland leak on transfer line', note: 'Gland packing tightened; leak stopped. Checked after 1 hour.' },
    { text: 'ड्रम का ढक्कन टूटा है और सॉल्वेंट बाहर रिस रहा है।', lang: 'hi', sev: 'Medium', summary: 'Broken drum lid, solvent seeping out', note: 'Drum transferred to a new container; damaged drum quarantined.' },
    { text: 'Hose connection loose at the unloading point, product sprayed on the ground.', lang: 'en', sev: 'High', summary: 'Loose hose at unloading point sprayed product', note: 'Unloading stopped, coupling replaced, ground cleaned and checked.' },
  ],
  'Fire / Ignition': [
    { text: 'Welding chal rahi hai bina hot work permit ke, paas mein solvent drums rakhe hain.', lang: 'mixed', sev: 'High', summary: 'Hot work without permit next to solvent drums', note: 'Work stopped, permit issued after drums were moved 15 m away.' },
    { text: 'Motor bahut garam hai aur jalne ki smell aa rahi hai.', lang: 'mixed', sev: 'High', summary: 'Motor overheating with burning smell', note: 'Motor isolated, bearing replaced, temperature normal after restart.' },
    { text: 'Fire extinguisher near the stairs is empty, pressure gauge in red.', lang: 'en', sev: 'Medium', summary: 'Empty fire extinguisher near stairs', note: 'Extinguisher replaced; monthly check sheet updated.' },
    { text: 'कोई सिगरेट पी रहा था नो स्मोकिंग ज़ोन में, बट ज़मीन पर पड़ा है।', lang: 'hi', sev: 'Medium', summary: 'Cigarette butt found in no-smoking zone', note: 'Toolbox talk held with contractors; signage added at the gate.' },
    { text: 'Oily rags piled next to the hot exhaust pipe of the generator.', lang: 'en', sev: 'Medium', summary: 'Oily rags piled next to hot exhaust', note: 'Rags removed to a closed metal bin; housekeeping round added.' },
  ],
  'Slip-Trip-Fall': [
    { text: 'सीढ़ी की रेलिंग ढीली है, पकड़ने पर हिलती है।', lang: 'hi', sev: 'Medium', summary: 'Loose handrail on staircase', note: 'Railing bolts replaced and welded; checked by maintenance.' },
    { text: 'Floor par paani aur grease hai, do log fisalte fisalte bache.', lang: 'mixed', sev: 'Medium', summary: 'Water and grease on floor, two near slips', note: 'Floor degreased; leaking cooler line fixed; anti-slip mat placed.' },
    { text: 'Cable lying across the walkway, easy to trip in the dark.', lang: 'en', sev: 'Low', summary: 'Cable across walkway is a trip hazard', note: 'Cable routed overhead on a hook; walkway cleared.' },
    { text: 'गड्ढे का ढक्कन हटा हुआ है और चारों ओर कोई बैरिकेड नहीं है।', lang: 'hi', sev: 'High', summary: 'Open pit cover with no barricade', note: 'Pit cover replaced; barricade tape kept nearby for future work.' },
    { text: 'Pallets stacked in the aisle, forklift and people both using the same path.', lang: 'en', sev: 'Low', summary: 'Pallets blocking shared aisle', note: 'Pallets moved to marked bay; aisle lines repainted.' },
  ],
  PPE: [
    { text: 'Contractor log bina helmet ke upar platform par kaam kar rahe hain.', lang: 'mixed', sev: 'Medium', summary: 'Contractors on platform without helmets', note: 'Work paused, helmets issued; contractor supervisor briefed.' },
    { text: 'केमिकल लोडिंग के समय किसी ने गॉगल्स नहीं पहने थे।', lang: 'hi', sev: 'Medium', summary: 'No goggles worn during chemical loading', note: 'Goggles station added at loading point; crew reminded.' },
    { text: 'Gloves box is empty at the sampling point.', lang: 'en', sev: 'Low', summary: 'Gloves box empty at sampling point', note: 'Gloves restocked; added to weekly stores checklist.' },
    { text: 'ऊँचाई पर काम करते हुए सेफ्टी बेल्ट हुक नहीं किया था।', lang: 'hi', sev: 'High', summary: 'Harness not hooked while working at height', note: 'Work stopped; anchor point installed; refresher given.' },
    { text: 'Respirator cartridges are expired in the PPE cabinet.', lang: 'en', sev: 'Low', summary: 'Expired respirator cartridges in cabinet', note: 'Expired cartridges discarded; fresh stock with dates labelled.' },
  ],
  'Equipment Fault': [
    { text: 'पंप से बहुत तेज़ आवाज़ आ रही है और वाइब्रेशन ज़्यादा है।', lang: 'hi', sev: 'Medium', summary: 'Pump making loud noise with high vibration', note: 'Pump aligned and coupling replaced; vibration back to normal.' },
    { text: 'Pressure gauge on the reactor jacket is stuck at zero.', lang: 'en', sev: 'Medium', summary: 'Reactor jacket pressure gauge stuck at zero', note: 'Gauge replaced and calibrated; logged in instrument register.' },
    { text: 'Conveyor ka guard toota hua hai, rollers khule hain.', lang: 'mixed', sev: 'Medium', summary: 'Broken conveyor guard exposing rollers', note: 'Guard refitted with new brackets; LOTO used during repair.' },
    { text: 'Forklift horn and reverse alarm not working.', lang: 'en', sev: 'Medium', summary: 'Forklift horn and reverse alarm not working', note: 'Forklift tagged out; alarm wiring fixed; pre-use check reinforced.' },
    { text: 'वाल्व का हैंडल टूटा है, बंद करने में दिक्कत हो रही है।', lang: 'hi', sev: 'Low', summary: 'Broken valve handle, hard to close', note: 'Valve handwheel replaced.' },
  ],
  'Chemical Exposure': [
    { text: 'Sampling ke baad aankhon mein jalan ho rahi hai, smell bahut tez hai.', lang: 'mixed', sev: 'High', summary: 'Eye irritation and strong smell after sampling', note: 'Worker checked at OHC; sampling point fitted with closed sampler.' },
    { text: 'Eyewash station water is brown and the flow is very weak.', lang: 'en', sev: 'Medium', summary: 'Eyewash water dirty with weak flow', note: 'Eyewash flushed, filter replaced; weekly flush added to checklist.' },
    { text: 'ड्रम पर लेबल नहीं है, पता नहीं अंदर कौन सा केमिकल है।', lang: 'hi', sev: 'Low', summary: 'Unlabelled chemical drum', note: 'Contents identified from batch records; drum labelled with GHS label.' },
    { text: 'Strong ammonia-like smell near the sump, people coughing.', lang: 'en', sev: 'High', summary: 'Strong ammonia-like smell near sump, coughing', note: 'Area ventilated; sump cover sealed; gas test clear before re-entry.' },
  ],
  Electrical: [
    { text: 'पैनल का दरवाज़ा खुला है और तार बाहर लटक रहे हैं।', lang: 'hi', sev: 'Medium', summary: 'Open panel door with hanging wires', note: 'Wires terminated and dressed; panel door lock replaced.' },
    { text: 'Extension board paani ke paas rakha hai, cable kati hui hai.', lang: 'mixed', sev: 'Medium', summary: 'Damaged extension board near water', note: 'Extension board removed; permanent socket installed at height.' },
    { text: 'Lights in the stairwell are out, completely dark at night.', lang: 'en', sev: 'Low', summary: 'Stairwell lights not working', note: 'Fittings replaced with LED; tested at night shift.' },
    { text: 'Earthing strip is broken on the motor body.', lang: 'en', sev: 'Medium', summary: 'Broken earthing strip on motor body', note: 'Earthing strip replaced; earth resistance measured and logged.' },
  ],
  Other: [
    { text: 'Rasta band hai, emergency exit ke saamne saman rakha hai.', lang: 'mixed', sev: 'Medium', summary: 'Material blocking emergency exit', note: 'Material removed; exit marked with floor paint.' },
    { text: 'Safety notice board is outdated, still shows last year emergency numbers.', lang: 'en', sev: 'Low', summary: 'Notice board shows outdated emergency numbers', note: 'Notice board updated with current numbers.' },
    { text: 'ज़मीन पर बहुत सारा कचरा पड़ा है, बिल्ली और चूहे आ रहे हैं।', lang: 'hi', sev: 'Low', summary: 'Garbage on ground attracting animals', note: 'Area cleared; covered bins placed.' },
  ],
};

// ─── PRNG ───────────────────────────────────────────────────────────────────
let seed = 20261113;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
const between = (a: number, b: number) => Math.round(a + rnd() * (b - a));

const HINDI_PREF = ['meena@safesite.test', 'arjun@safesite.test', 'deepak@safesite.test', 'suresh@safesite.test', 'worker@safesite.test'];
const EN_PREF = ['farhan@safesite.test', 'lakshmi@safesite.test'];

interface Template {
  key: string;
  sort: number;
  reporter_email: string;
  area_code: string;
  days_ago: number | null;
  local_time: string | null;
  age_minutes: number | null;
  input_mode: 'voice' | 'text';
  capture_seconds: number | null;
  transcript: string;
  language: Lang;
  ai_status: 'done' | 'failed';
  ai_category: Cat | null;
  ai_severity: Sev | null;
  ai_confidence: number | null;
  summary: string | null;
  guard_reason: string | null;
  category: Cat | null;
  severity: Sev | null;
  triaged: boolean;
  status: Status;
  owner_email: string | null;
  assigned_after_min: number | null;
  started_after_min: number | null;
  closed_after_min: number | null;
  resolution_note: string | null;
  dup_of_key: string | null;
  dup_status: 'merged' | 'suggested' | null;
  // generator-only
  _ageMin: number;
}

const out: Template[] = [];

function phraseFor(cat: Cat, prefer?: Lang): Phrase {
  const options = POOL[cat].filter((p) => !prefer || p.lang === prefer);
  return pick(options.length ? options : POOL[cat]);
}

function reporterFor(lang: Lang) {
  if (lang === 'en') return pick(EN_PREF.concat(['meena@safesite.test']));
  return pick(HINDI_PREF);
}

/** Final severity the classify pipeline would produce (model + keyword guard). */
function pipelineSeverity(p: Phrase): { sev: Sev; guard: string | null } {
  const g = keywordGuard(p.text);
  return { sev: applyGuard(p.sev, g) as Sev, guard: g.reason };
}

function closeMinutesFor(sev: Sev, late = false): number {
  if (late) return sev === 'High' ? between(260, 330) : sev === 'Medium' ? between(1500, 1900) : between(4400, 5000);
  return sev === 'High' ? between(50, 200) : sev === 'Medium' ? between(240, 1200) : between(600, 3600);
}

function add(t: Partial<Template> & Pick<Template, 'key' | 'area_code' | 'transcript' | 'language' | 'status' | '_ageMin'>) {
  const base: Template = {
    sort: 0,
    reporter_email: reporterFor(t.language),
    days_ago: null,
    local_time: null,
    age_minutes: null,
    input_mode: rnd() < 0.85 ? 'voice' : 'text',
    capture_seconds: between(28, 78),
    ai_status: 'done',
    ai_category: null,
    ai_severity: null,
    ai_confidence: Number((0.7 + rnd() * 0.27).toFixed(2)),
    summary: null,
    guard_reason: null,
    category: null,
    severity: null,
    triaged: true,
    owner_email: null,
    assigned_after_min: null,
    started_after_min: null,
    closed_after_min: null,
    resolution_note: null,
    dup_of_key: null,
    dup_status: null,
    ...t,
  } as Template;
  out.push(base);
  return base;
}

function closedTimeline(sev: Sev, late = false) {
  const close = closeMinutesFor(sev, late);
  const assign = Math.min(between(5, sev === 'High' ? 20 : 90), Math.floor(close * 0.3));
  const start = Math.min(assign + between(5, 60), Math.floor(close * 0.6));
  return { assigned_after_min: assign, started_after_min: start, closed_after_min: close };
}

function historical(key: string, cat: Cat, area: string, daysAgo: number, opts: { late?: boolean; reporter?: string; phrase?: Phrase; hour?: number } = {}) {
  const p = opts.phrase ?? phraseFor(cat);
  const { sev, guard } = pipelineSeverity(p);
  const hour = opts.hour ?? pick([7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 23, 1, 3, 4]);
  const minute = between(0, 59);
  return add({
    key,
    area_code: area,
    transcript: p.text,
    language: p.lang,
    reporter_email: opts.reporter ?? reporterFor(p.lang),
    days_ago: daysAgo,
    local_time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    status: 'Closed',
    ai_category: cat,
    ai_severity: p.sev,
    summary: p.summary,
    guard_reason: guard,
    category: cat,
    severity: sev,
    resolution_note: p.note,
    ...closedTimeline(sev, opts.late),
    _ageMin: daysAgo * 1440 - (hour - 12) * 60,
  });
}

function recent(key: string, cat: Cat, area: string, ageMin: number, status: Status, opts: Partial<Template> & { phrase?: Phrase } = {}) {
  const p0 = opts.phrase ?? phraseFor(cat);
  // The guard runs on the text actually stored, which may override the phrase.
  const p = { ...p0, text: opts.transcript ?? p0.text };
  const { sev, guard } = pipelineSeverity(p);
  const tl: Partial<Template> = {};
  if (status !== 'New') tl.assigned_after_min = Math.min(between(5, 40), Math.floor(ageMin * 0.4));
  if (status === 'In Progress' || status === 'Closed') tl.started_after_min = Math.min((tl.assigned_after_min ?? 0) + between(10, 60), Math.floor(ageMin * 0.7));
  const { phrase: _p, ...rest } = opts;
  return add({
    key,
    area_code: area,
    transcript: p.text,
    language: p.lang,
    reporter_email: reporterFor(p.lang),
    age_minutes: ageMin,
    status,
    ai_category: cat,
    ai_severity: p.sev,
    summary: p.summary,
    guard_reason: guard,
    category: cat,
    severity: sev,
    triaged: status !== 'New',
    ...tl,
    ...rest,
    _ageMin: ageMin,
  });
}

const P = (cat: Cat, i: number) => POOL[cat][i];

// ─── Planted story ──────────────────────────────────────────────────────────
// Repeat A: Tank Farm · Spill / Leak (2 in 7 days, both closed). The live demo
// report (gas leak near the tank) becomes the "3rd in 7 days".
historical('rep-a1', 'Spill / Leak', 'TANK', 5, { phrase: P('Spill / Leak', 0), hour: 10 });
historical('rep-a2', 'Spill / Leak', 'TANK', 2, { phrase: P('Spill / Leak', 2), hour: 16, reporter: 'worker@safesite.test' });

// Repeat B + duplicate pair 2: Loading Bay · Slip-Trip-Fall
historical('rep-b1', 'Slip-Trip-Fall', 'LOAD', 6, { phrase: P('Slip-Trip-Fall', 4), hour: 9 });
historical('rep-b2', 'Slip-Trip-Fall', 'LOAD', 4, { phrase: P('Slip-Trip-Fall', 1), hour: 19 });
recent('dup2-parent', 'Slip-Trip-Fall', 'LOAD', 185, 'Assigned', { phrase: P('Slip-Trip-Fall', 1), reporter_email: 'deepak@safesite.test' });
recent('dup2-child', 'Slip-Trip-Fall', 'LOAD', 95, 'New', {
  phrase: P('Slip-Trip-Fall', 1),
  transcript: 'Loading bay mein floor par grease phaila hai, forklift ke raste mein. Koi fisal sakta hai.',
  language: 'mixed', summary: 'Grease on loading bay floor in forklift path', reporter_email: 'suresh@safesite.test', triaged: false,
  ai_confidence: 0.88,
});

// Duplicate pair 1 (merged, closed, 12 days ago): Distillation · Equipment Fault
const d1 = historical('dup1-parent', 'Equipment Fault', 'DIST', 12, { phrase: P('Equipment Fault', 0), hour: 9 });
add({
  ...d1,
  key: 'dup1-child',
  reporter_email: 'farhan@safesite.test',
  transcript: 'Reflux pump is very noisy and the base is shaking, sounds like a bearing.',
  language: 'en',
  dup_of_key: 'dup1-parent',
  dup_status: 'merged',
  _ageMin: d1._ageMin - 40,
});
// keep the merged child 40 minutes after its parent
out[out.length - 1].local_time = (() => {
  const [h, m] = d1.local_time!.split(':').map(Number);
  const total = h * 60 + m + 40;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
})();

// 3 open SLA breaches (all escalated): two Medium, one Low
recent('breach-1', 'Electrical', 'UTIL', 1800, 'In Progress', { phrase: P('Electrical', 0) });
recent('breach-2', 'Chemical Exposure', 'ETP', 1620, 'Assigned', { phrase: P('Chemical Exposure', 1) });
recent('breach-3', 'PPE', 'WKSP', 4680, 'Assigned', { phrase: P('PPE', 2) });

// 1 open High: smoke from a motor in the Reactor Block, assigned 8 minutes in
recent('open-high', 'Fire / Ignition', 'REACT', 40, 'Assigned', {
  phrase: P('Fire / Ignition', 1),
  transcript: 'Agitator motor se dhuan nikal raha hai, jalne ki smell aa rahi hai.',
  summary: 'Smoke and burning smell from agitator motor',
  assigned_after_min: 8,
});

// Low-confidence report waiting for review (inbox "Needs review")
recent('needs-review', 'Other', 'WARE', 70, 'New', {
  phrase: P('Other', 1),
  transcript: 'गोदाम के पीछे वाला दरवाज़ा ठीक से बंद नहीं होता, रात में खुला रह जाता है।',
  language: 'hi',
  summary: 'Warehouse rear door does not close properly',
  ai_confidence: 0.48,
  triaged: false,
});

// Fresh report in Sanjay's area (not visible to Priya: RLS)
recent('fresh-util', 'Equipment Fault', 'UTIL', 25, 'New', { phrase: P('Equipment Fault', 1), triaged: false, ai_confidence: 0.86 });

// Ravi's own history so his My Reports already shows a closure
historical('ravi-closed', 'PPE', 'REACT', 9, { phrase: P('PPE', 0), reporter: 'worker@safesite.test', hour: 11 });
recent('ravi-open', 'Electrical', 'DIST', 300, 'In Progress', { phrase: P('Electrical', 2), reporter_email: 'worker@safesite.test' });

// One historical AI-vs-human override (AI said Medium, supervisor raised to High)
const ov = historical('override', 'Chemical Exposure', 'REACT', 15, { phrase: P('Chemical Exposure', 0), hour: 15 });
ov.ai_severity = 'Medium';
ov.ai_confidence = 0.71;
ov.severity = 'High';

// A few more open items (inside SLA, not escalated)
recent('open-low-1', 'Slip-Trip-Fall', 'WARE', 1500, 'Assigned', { phrase: P('Slip-Trip-Fall', 2) });
recent('open-low-2', 'Electrical', 'ETP', 2100, 'In Progress', { phrase: P('Electrical', 2) });
recent('open-med-1', 'Equipment Fault', 'WKSP', 420, 'Assigned', { phrase: P('Equipment Fault', 2) });
recent('open-med-2', 'PPE', 'TANK', 260, 'In Progress', { phrase: P('PPE', 1) });

// ─── Fill: closed history across 30 days, respecting the pattern rules ──────
const used = new Map<string, number[]>(); // area|cat → ages (minutes)
for (const t of out) {
  if (t.dup_status === 'merged') continue;
  const k = `${t.area_code}|${t.category}`;
  used.set(k, [...(used.get(k) ?? []), t._ageMin]);
}

const CAT_WEIGHTS: [Cat, number][] = [
  ['Spill / Leak', 16], ['Slip-Trip-Fall', 16], ['PPE', 15], ['Equipment Fault', 15],
  ['Electrical', 11], ['Fire / Ignition', 10], ['Chemical Exposure', 10], ['Other', 7],
];
const weighted = (): Cat => {
  const total = CAT_WEIGHTS.reduce((a, [, w]) => a + w, 0);
  let r = rnd() * total;
  for (const [c, w] of CAT_WEIGHTS) if ((r -= w) <= 0) return c;
  return 'Other';
};

const TARGET = 70;
let n = 0;
let guardTries = 0;
while (out.length < TARGET && guardTries++ < 5000) {
  const days = between(3, 29);
  const area = pick(AREA_CODES);
  const cat = weighted();
  const age = days * 1440;
  const k = `${area}|${cat}`;
  // Same area + category must stay ≥ 8 days apart, so no unplanned repeat/duplicate.
  if ((used.get(k) ?? []).some((a) => Math.abs(a - age) < 8 * 1440 + 720)) continue;
  used.set(k, [...(used.get(k) ?? []), age]);
  const late = rnd() < 0.12;
  historical(`h-${++n}`, cat, area, days, { late });
}

// A couple of historical items where the AI was unsure but the human accepted
for (const t of out.filter((x) => x.key.startsWith('h-')).slice(0, 4)) t.ai_confidence = Number((0.55 + rnd() * 0.05).toFixed(2));

// Sort oldest → newest so reset_demo() evaluates rules in creation order.
out.sort((a, b) => b._ageMin - a._ageMin);
out.forEach((t, i) => (t.sort = i + 1));

// ─── Self-check: planted patterns are exactly what the rules will detect ────
function check() {
  const byKey = new Map<string, Template[]>();
  for (const t of out) {
    if (t.dup_status === 'merged') continue;
    const k = `${t.area_code}|${t.category}`;
    byKey.set(k, [...(byKey.get(k) ?? []), t]);
  }
  const repeats: string[] = [];
  for (const [k, ts] of byKey) {
    const ages = ts.map((t) => t._ageMin).sort((a, b) => a - b);
    for (let i = 1; i < ages.length; i++) if (ages[i] - ages[i - 1] < 7 * 1440) repeats.push(k);
  }
  const uniq = [...new Set(repeats)].sort();
  const expected = ['LOAD|Slip-Trip-Fall', 'TANK|Spill / Leak'];
  if (JSON.stringify(uniq) !== JSON.stringify(expected)) {
    throw new Error(`Unplanned repeat groups: ${uniq.join(', ')}`);
  }
  const openBreaches = out.filter((t) => t.key.startsWith('breach-')).length;
  const openHigh = out.filter((t) => t.status !== 'Closed' && t.severity === 'High');
  if (openBreaches !== 3) throw new Error('expected 3 breaches');
  if (openHigh.length !== 1) throw new Error(`expected 1 open High, got ${openHigh.map((t) => t.key).join(', ')}`);
  return { repeats: uniq, total: out.length, open: out.filter((t) => t.status !== 'Closed').length };
}

const summary = check();
const here = dirname(fileURLToPath(import.meta.url));
const file = join(here, '..', 'supabase', 'seed', 'templates.json');
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(out.map(({ _ageMin, ...t }) => t), null, 2) + '\n');

const langs = out.reduce<Record<string, number>>((a, t) => ((a[t.language] = (a[t.language] ?? 0) + 1), a), {});
console.log(`Wrote ${summary.total} templates → ${file}`);
console.log(`  open: ${summary.open}, repeat groups: ${summary.repeats.join(' · ')}`);
console.log(`  languages: ${JSON.stringify(langs)}`);
