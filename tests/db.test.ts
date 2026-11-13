// Database behaviour: RLS, RPCs, status machine, rules, SLA, demo clock, seed.
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, seededId, type TestDb } from './db/harness';

const W = 'worker@safesite.test';
const SUP = 'supervisor@safesite.test';
const SUP2 = 'supervisor2@safesite.test';
const EHS = 'ehs@safesite.test';
const MEENA = 'meena@safesite.test';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb({ seed: true });
});

const one = async <T>(p: Promise<{ rows: T[] }>) => (await p).rows[0];

async function createLiveReport(email = W, area = 'TANK', transcript = 'टैंक के पास पाइप से गैस लीक हो रही है, बहुत तेज़ smell है।') {
  const clientId = randomUUID();
  const uid = t.ids[email];
  const areaId = (await one(t.db.query<{ id: number }>(`select id from public.areas where code = $1`, [area]))).id;
  const res = await t.as(email, (tx) =>
    tx.query<{ r: { id: number; label: string; created: boolean } }>(
      `select public.create_report($1, $2, $3, 'voice', 38, $4, $5, 19.07, 72.89, 'mixed') as r`,
      [clientId, areaId, transcript, [`${uid}/${clientId}/photo-1.jpg`], `${uid}/${clientId}/voice.m4a`],
    ),
  );
  return { clientId, areaId, ...res.rows[0].r };
}

async function classify(id: number, ai: Record<string, unknown>) {
  return t.asService((tx) => tx.query(`select public.apply_classification($1, $2::jsonb) as r`, [id, JSON.stringify(ai)]));
}

describe('seed (PRD §14)', () => {
  it('builds 70 reports with an audit trail', async () => {
    const r = await one(t.db.query<{ n: number }>(`select count(*)::int as n from public.reports`));
    expect(r.n).toBe(70);
    const a = await one(t.db.query<{ n: number }>(`select count(*)::int as n from public.audit_logs`));
    expect(a.n).toBeGreaterThan(200);
  });

  it('plants exactly 3 open SLA breaches and 1 open High', async () => {
    const b = await one(
      t.db.query<{ n: number }>(`select count(*)::int as n from public.actions where status <> 'Closed' and breached_at is not null`),
    );
    expect(b.n).toBe(3);
    const h = await one(
      t.db.query<{ n: number }>(
        `select count(*)::int as n from public.reports r join public.actions a on a.report_id = r.id
         where a.status <> 'Closed' and r.severity = 'High'`,
      ),
    );
    expect(h.n).toBe(1);
  });

  it('plants the repeat groups and both duplicate pairs', async () => {
    const child = await seededId(t.db, 'dup2-child');
    const parent = await seededId(t.db, 'dup2-parent');
    const c = await one(t.db.query<any>(`select * from public.reports where id = $1`, [child]));
    expect(c.duplicate_status).toBe('suggested');
    expect(Number(c.is_duplicate_of)).toBe(parent);
    expect(c.is_repeat).toBe(true);
    expect(c.repeat_count).toBe(4);

    const merged = await one(t.db.query<any>(`select * from public.reports where id = $1`, [await seededId(t.db, 'dup1-child')]));
    expect(merged.duplicate_status).toBe('merged');
    expect(merged.is_repeat).toBe(false);

    const tank = await one(t.db.query<any>(`select * from public.reports where id = $1`, [await seededId(t.db, 'rep-a2')]));
    expect(tank.repeat_count).toBe(2);

    // No other repeat flags exist
    const others = await t.db.query<{ code: string; category: string }>(
      `select distinct a.code, r.category from public.reports r join public.areas a on a.id = r.area_id where r.is_repeat`,
    );
    expect(others.rows.map((x) => `${x.code}|${x.category}`).sort()).toEqual(['LOAD|Slip-Trip-Fall', 'TANK|Spill / Leak']);
  });

  it('keeps shifts consistent with created_at', async () => {
    const bad = await one(
      t.db.query<{ n: number }>(`select count(*)::int as n from public.reports where shift <> public.shift_for(created_at)`),
    );
    expect(bad.n).toBe(0);
  });
});

describe('row level security (PRD §9)', () => {
  it('workers see only their own reports', async () => {
    const rows = await t.as(W, (tx) => tx.query<{ user_id: string }>(`select user_id from public.reports`));
    expect(rows.rows.length).toBeGreaterThan(0);
    expect(new Set(rows.rows.map((r) => r.user_id))).toEqual(new Set([t.ids[W]]));
  });

  it('supervisors see only their areas; EHS sees all', async () => {
    const sup = await t.as(SUP, (tx) =>
      tx.query<{ code: string }>(`select distinct a.code from public.reports r join public.areas a on a.id = r.area_id`),
    );
    expect(sup.rows.map((r) => r.code).sort()).toEqual(['DIST', 'LOAD', 'REACT', 'TANK', 'WARE']);
    const sup2 = await t.as(SUP2, (tx) =>
      tx.query<{ code: string }>(`select distinct a.code from public.reports r join public.areas a on a.id = r.area_id`),
    );
    expect(sup2.rows.map((r) => r.code).sort()).toEqual(['ETP', 'UTIL', 'WKSP']);
    const ehs = await t.as(EHS, (tx) => tx.query<{ n: number }>(`select count(*)::int as n from public.reports`));
    expect(ehs.rows[0].n).toBe(70);
  });

  it('actions and audit rows follow report visibility', async () => {
    const a = await t.as(MEENA, (tx) =>
      tx.query<{ n: number }>(
        `select count(*)::int as n from public.actions a join public.reports r on r.id = a.report_id where r.user_id <> auth.uid()`,
      ),
    );
    expect(a.rows[0].n).toBe(0);
    const audit = await t.as(MEENA, (tx) =>
      tx.query<{ n: number }>(
        `select count(*)::int as n from public.audit_logs l join public.reports r on r.id = l.report_id where r.user_id <> auth.uid()`,
      ),
    );
    expect(audit.rows[0].n).toBe(0);
  });

  it('rejects direct client writes on every table', async () => {
    const areaId = 1;
    await expect(
      t.as(W, (tx) =>
        tx.query(
          `insert into public.reports (report_no, client_id, user_id, area_id, shift, created_at) values (999, gen_random_uuid(), auth.uid(), $1, 'A', now())`,
          [areaId],
        ),
      ),
    ).rejects.toThrow();
    await expect(t.as(SUP, (tx) => tx.query(`update public.actions set status = 'Closed'`))).rejects.toThrow();
    await expect(t.as(EHS, (tx) => tx.query(`delete from public.audit_logs`))).rejects.toThrow();
    await expect(t.as(W, (tx) => tx.query(`update public.users set role = 'ehs' where id = auth.uid()`))).rejects.toThrow();
  });

  it('audit_logs is insert-only even for the table owner', async () => {
    await expect(t.db.query(`update public.audit_logs set action_type = 'x' where id = (select min(id) from public.audit_logs)`)).rejects.toThrow(
      /insert-only/,
    );
    await expect(t.db.query(`delete from public.audit_logs where id = (select min(id) from public.audit_logs)`)).rejects.toThrow(/insert-only/);
  });

  it('workers cannot use demo tools or write AI output', async () => {
    await expect(t.as(W, (tx) => tx.query(`select public.demo_fast_forward(180)`))).rejects.toThrow(/EHS/);
    await expect(t.as(W, (tx) => tx.query(`select public.reset_demo()`))).rejects.toThrow(/EHS/);
    await expect(t.as(SUP, (tx) => tx.query(`select public.reset_demo()`))).rejects.toThrow(/EHS/);
    await expect(t.as(W, (tx) => tx.query(`select public.apply_classification(1, '{}'::jsonb)`))).rejects.toThrow(/permission denied/);
    await expect(t.as(W, (tx) => tx.query(`select public.check_sla()`))).rejects.toThrow(/staff/);
  });

  it('anon cannot call RPCs', async () => {
    await expect(
      t.db.transaction(async (tx) => {
        await tx.exec(`set local role anon`);
        await tx.query(`select public.create_report(gen_random_uuid(), 1, 'x')`);
      }),
    ).rejects.toThrow(/permission denied/);
  });

  it('a worker reading another user’s report through a security-definer helper gets nothing', async () => {
    const other = await seededId(t.db, 'breach-1');
    const r = await t.as(W, (tx) => tx.query<{ v: boolean }>(`select public.can_see_report($1) as v`, [other]));
    expect(r.rows[0].v).toBe(false);
  });
});

describe('storage policies', () => {
  it('uploads only into your own folder; reads follow report RLS', async () => {
    const live = await createLiveReport(MEENA, 'TANK', 'Floor par oil pada hai, fisalne ka darr hai.');
    const meenaPath = `${t.ids[MEENA]}/${live.clientId}/photo-1.jpg`;
    await t.as(MEENA, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('report-media', $1)`, [meenaPath]));
    await expect(
      t.as(MEENA, (tx) =>
        tx.query(`insert into storage.objects (bucket_id, name) values ('report-media', $1)`, [`${t.ids[W]}/${live.clientId}/x.jpg`]),
      ),
    ).rejects.toThrow();

    const sees = (email: string) =>
      t.as(email, (tx) => tx.query<{ n: number }>(`select count(*)::int as n from storage.objects where name = $1`, [meenaPath]));
    expect((await sees(MEENA)).rows[0].n).toBe(1);
    expect((await sees(SUP)).rows[0].n).toBe(1); // Tank Farm is Priya's
    expect((await sees(SUP2)).rows[0].n).toBe(0); // not Sanjay's
    expect((await sees(EHS)).rows[0].n).toBe(1);
    expect((await sees(W)).rows[0].n).toBe(0); // a peer
  });
});

describe('report lifecycle (PRD §7, §8, §15)', () => {
  let live: Awaited<ReturnType<typeof createLiveReport>>;

  it('creates a report idempotently with shift, action and audit row', async () => {
    live = await createLiveReport();
    expect(live.created).toBe(true);
    expect(live.label).toMatch(/^SS-\d{4}$/);

    const again = await t.as(W, (tx) =>
      tx.query<{ r: { id: number; created: boolean } }>(`select public.create_report($1, $2, 'retry') as r`, [live.clientId, live.areaId]),
    );
    expect(again.rows[0].r.id).toBe(live.id);
    expect(again.rows[0].r.created).toBe(false);

    const a = await one(t.db.query<any>(`select * from public.actions where report_id = $1`, [live.id]));
    expect(a.status).toBe('New');
    const audit = await t.db.query<any>(`select action_type from public.audit_logs where report_id = $1`, [live.id]);
    expect(audit.rows.map((r) => r.action_type)).toEqual(['created']);
    const notif = await t.db.query<any>(`select user_id, type from public.notifications where report_id = $1`, [live.id]);
    expect(notif.rows).toEqual([{ user_id: t.ids[SUP], type: 'new_report' }]);
  });

  it('rejects media paths outside the caller’s folder', async () => {
    const cid = randomUUID();
    await expect(
      t.as(W, (tx) => tx.query(`select public.create_report($1, 1, 'x', 'voice', 10, $2)`, [cid, [`someone-else/${cid}/a.jpg`]])),
    ).rejects.toThrow(/outside/);
  });

  it('stores AI output beside final values, applies the guard, flags the repeat', async () => {
    await classify(live.id, {
      status: 'done', model: 'openai/gpt-oss-120b', category: 'Spill / Leak', raw_severity: 'Medium', severity: 'High',
      confidence: 0.91, summary: 'Gas leak from pipe near tank', language: 'mixed', guard_reason: 'gas, leak', invalid: false,
    });
    const r = await one(t.db.query<any>(`select * from public.reports where id = $1`, [live.id]));
    expect(r.ai_severity).toBe('Medium');
    expect(r.severity).toBe('High');
    expect(r.category).toBe('Spill / Leak');
    expect(r.guard_reason).toBe('gas, leak');
    expect(r.needs_review).toBe(false);
    expect(r.is_repeat).toBe(true);
    expect(r.repeat_count).toBe(3); // "3rd in 7 days" — the demo moment
    expect(r.duplicate_status).toBeNull();

    const a = await one(t.db.query<any>(`select due_at, escalate_at from public.actions where report_id = $1`, [live.id]));
    const created = new Date(r.created_at).getTime();
    expect((new Date(a.due_at).getTime() - created) / 3_600_000).toBeCloseTo(4);
    expect((new Date(a.escalate_at).getTime() - created) / 3_600_000).toBeCloseTo(2);
  });

  it('a low-confidence or failed classification needs review; failure is Unclassified', async () => {
    const low = await createLiveReport(W, 'WARE', 'something odd with the door');
    await classify(low.id, { status: 'done', category: 'Other', raw_severity: 'Low', severity: 'Low', confidence: 0.4, summary: 'Door', invalid: false });
    expect((await one(t.db.query<any>(`select needs_review from public.reports where id = $1`, [low.id]))).needs_review).toBe(true);

    const failed = await createLiveReport(W, 'WARE', 'aag lagi hai');
    await classify(failed.id, { status: 'failed', severity: 'High', guard_reason: 'fire', error: 'timeout' });
    const f = await one(t.db.query<any>(`select * from public.reports where id = $1`, [failed.id]));
    expect(f.ai_status).toBe('failed');
    expect(f.category).toBeNull();
    expect(f.severity).toBe('High'); // guard still applies without the model
    expect(f.needs_review).toBe(true);

    // Unclassified cannot be assigned until a human sets category and severity
    await expect(t.as(SUP, (tx) => tx.query(`select public.assign_action($1, $2)`, [failed.id, t.ids[SUP]]))).rejects.toThrow(/Unclassified/);
  });

  it('rejects AI output outside the enum', async () => {
    const x = await createLiveReport(W, 'WARE', 'test');
    await expect(classify(x.id, { status: 'done', category: 'Explosion!!', raw_severity: 'High', severity: 'High', confidence: 0.9 })).rejects.toThrow();
  });

  it('human override keeps the AI value and logs both', async () => {
    await t.as(SUP, (tx) =>
      tx.query(`select public.reclassify_report($1, 'Spill / Leak', 'Medium', 'Gas detector reading normal')`, [live.id]),
    );
    const log = await one(
      t.db.query<any>(`select * from public.audit_logs where report_id = $1 and action_type = 'reclassified'`, [live.id]),
    );
    expect(log.old_value).toMatchObject({ severity: 'High', ai_severity: 'Medium' });
    expect(log.new_value).toMatchObject({ severity: 'Medium', reason: 'Gas detector reading normal' });
    expect(log.actor_id).toBe(t.ids[SUP]);
    const r = await one(t.db.query<any>(`select ai_severity, severity from public.reports where id = $1`, [live.id]));
    expect(r).toEqual({ ai_severity: 'Medium', severity: 'Medium' });
    // Back to High for the escalation demo
    await t.as(SUP, (tx) => tx.query(`select public.reclassify_report($1, 'Spill / Leak', 'High')`, [live.id]));
  });

  it('a supervisor of another area cannot touch the report', async () => {
    await expect(t.as(SUP2, (tx) => tx.query(`select public.accept_report($1)`, [live.id]))).rejects.toThrow(/supervisor or EHS/);
  });

  it('enforces the status machine', async () => {
    await expect(t.as(SUP, (tx) => tx.query(`select public.start_action($1)`, [live.id]))).rejects.toThrow(/Assigned/);
    await expect(t.as(SUP, (tx) => tx.query(`select public.close_action($1, 'done')`, [live.id]))).rejects.toThrow(/In Progress/);
    await expect(t.as(SUP, (tx) => tx.query(`select public.assign_action($1, $2)`, [live.id, t.ids[MEENA]]))).rejects.toThrow(/Owner/);

    await t.as(SUP, (tx) => tx.query(`select public.assign_action($1, $2)`, [live.id, t.ids[SUP]]));
    const a = await one(t.db.query<any>(`select status, owner_id from public.actions where report_id = $1`, [live.id]));
    expect(a).toEqual({ status: 'Assigned', owner_id: t.ids[SUP] });
  });

  it('fast-forward 3 h escalates the High report to EHS without changing the owner', async () => {
    const res = await t.as(EHS, (tx) => tx.query<{ r: any }>(`select public.demo_fast_forward(180) as r`));
    expect(res.rows[0].r.escalated).toBeGreaterThanOrEqual(1);

    const a = await one(t.db.query<any>(`select escalated_level, breached_at, owner_id from public.actions where report_id = $1`, [live.id]));
    expect(a.escalated_level).toBe(1);
    expect(a.breached_at).toBeNull(); // 3 h < 4 h due
    expect(a.owner_id).toBe(t.ids[SUP]);

    const n = await t.db.query<any>(`select type from public.notifications where report_id = $1 and user_id = $2`, [live.id, t.ids[EHS]]);
    expect(n.rows.map((r) => r.type)).toContain('escalation');
    const log = await t.db.query<any>(`select action_type from public.audit_logs where report_id = $1 and action_type = 'escalated'`, [live.id]);
    expect(log.rows.length).toBe(1);

    // the seeded open High (40 min old) escalated too
    const seededHigh = await seededId(t.db, 'open-high');
    expect((await one(t.db.query<any>(`select escalated_level from public.actions where report_id = $1`, [seededHigh]))).escalated_level).toBe(1);

    // idempotent
    const again = await t.as(EHS, (tx) => tx.query<{ r: any }>(`select public.check_sla() as r`));
    expect(again.rows[0].r.escalated).toBe(0);
  });

  it('new reports after a fast-forward are stamped on the demo clock', async () => {
    const x = await createLiveReport(W, 'WARE', 'fresh after fast-forward');
    const r = await one(t.db.query<any>(`select created_at, public.app_now() as now from public.reports where id = $1`, [x.id]));
    expect(Math.abs(new Date(r.now).getTime() - new Date(r.created_at).getTime())).toBeLessThan(60_000);
  });

  it('closing needs a note and tells the reporter', async () => {
    await t.as(SUP, (tx) => tx.query(`select public.start_action($1)`, [live.id]));
    await expect(t.as(SUP, (tx) => tx.query(`select public.close_action($1, '  ')`, [live.id]))).rejects.toThrow(/resolution note/);
    await expect(
      t.as(SUP, (tx) => tx.query(`select public.close_action($1, 'Fixed', 'fix/999999/a.jpg')`, [live.id])),
    ).rejects.toThrow(/outside/);
    await t.as(SUP, (tx) =>
      tx.query(`select public.close_action($1, 'Flange gasket replaced; gas test clear.', $2)`, [live.id, `fix/${live.id}/fix-1.jpg`]),
    );
    const a = await one(t.db.query<any>(`select status, resolution_note, closed_at from public.actions where report_id = $1`, [live.id]));
    expect(a.status).toBe('Closed');
    expect(a.closed_at).not.toBeNull();

    // The reporter sees it (RLS) and was notified
    const mine = await t.as(W, (tx) => tx.query<any>(`select status, resolution_note from public.actions where report_id = $1`, [live.id]));
    expect(mine.rows[0]).toEqual({ status: 'Closed', resolution_note: 'Flange gasket replaced; gas test clear.' });
    const n = await t.as(W, (tx) => tx.query<any>(`select type from public.notifications where report_id = $1`, [live.id]));
    expect(n.rows.map((r) => r.type)).toEqual(['closed']);

    const trail = await t.db.query<any>(`select action_type from public.audit_logs where report_id = $1 order by id`, [live.id]);
    expect(trail.rows.map((r) => r.action_type)).toEqual([
      'created', 'repeat_flagged', 'ai_classified', 'reclassified', 'reclassified', 'assigned', 'escalated', 'status_changed', 'closed',
    ]);
  });
});

describe('duplicates', () => {
  it('merging a suggested duplicate makes it follow the parent to closure', async () => {
    const child = await seededId(t.db, 'dup2-child');
    const parent = await seededId(t.db, 'dup2-parent');
    await t.as(SUP, (tx) => tx.query(`select public.merge_duplicate($1)`, [child]));
    let c = await one(t.db.query<any>(`select a.status, a.merged_into, r.is_repeat from public.actions a join public.reports r on r.id = a.report_id where a.report_id = $1`, [child]));
    expect(Number(c.merged_into)).toBe(parent);
    expect(c.status).toBe('Assigned');
    expect(c.is_repeat).toBe(false);

    await t.as(SUP, (tx) => tx.query(`select public.start_action($1)`, [parent]));
    await t.as(SUP, (tx) => tx.query(`select public.close_action($1, 'Grease cleaned, drip from forklift fixed.')`, [parent]));
    c = await one(t.db.query<any>(`select status, resolution_note from public.actions where report_id = $1`, [child]));
    expect(c).toEqual({ status: 'Closed', resolution_note: 'Grease cleaned, drip from forklift fixed.' });

    const childReporter = (await one(t.db.query<any>(`select user_id from public.reports where id = $1`, [child]))).user_id;
    const n = await t.db.query<any>(`select type from public.notifications where report_id = $1 and user_id = $2`, [child, childReporter]);
    expect(n.rows.map((r) => r.type)).toContain('closed');
  });

  it('a new report within 2 h of an open one in the same area + category is a possible duplicate', async () => {
    const a = await createLiveReport(MEENA, 'DIST', 'Pump vibration very high on the reflux pump');
    await classify(a.id, { status: 'done', category: 'Equipment Fault', raw_severity: 'Medium', severity: 'Medium', confidence: 0.9, summary: 'Pump vibration' });
    const b = await createLiveReport(W, 'DIST', 'Pump bahut awaaz kar raha hai');
    await classify(b.id, { status: 'done', category: 'Equipment Fault', raw_severity: 'Medium', severity: 'Medium', confidence: 0.85, summary: 'Pump noise' });
    const rb = await one(t.db.query<any>(`select is_duplicate_of, duplicate_status from public.reports where id = $1`, [b.id]));
    expect(Number(rb.is_duplicate_of)).toBe(a.id);
    expect(rb.duplicate_status).toBe('suggested');

    await t.as(SUP, (tx) => tx.query(`select public.dismiss_duplicate($1)`, [b.id]));
    expect((await one(t.db.query<any>(`select duplicate_status from public.reports where id = $1`, [b.id]))).duplicate_status).toBe('dismissed');
  });
});

describe('review fixes', () => {
  it('Low severity past its reminder time is reminded, never escalated', async () => {
    const low = await seededId(t.db, 'breach-3');
    const a = await one(t.db.query<any>(`select escalated_level, reminded_at from public.actions where report_id = $1`, [low]));
    expect(a.escalated_level).toBe(0);
    expect(a.reminded_at).not.toBeNull();

    const x = await createLiveReport(W, 'WARE', 'gloves box is empty at the sampling point');
    await classify(x.id, { status: 'done', category: 'PPE', raw_severity: 'Low', severity: 'Low', confidence: 0.9, summary: 'No gloves' });
    await t.as(EHS, (tx) => tx.query(`select public.demo_fast_forward(3000)`)); // 50 h > 48 h
    const b = await one(t.db.query<any>(`select escalated_level, reminded_at from public.actions where report_id = $1`, [x.id]));
    expect(b.escalated_level).toBe(0);
    expect(b.reminded_at).not.toBeNull();
    const n = await t.db.query<any>(`select type from public.notifications where report_id = $1 and user_id = $2`, [x.id, t.ids[EHS]]);
    expect(n.rows.map((r) => r.type)).toContain('reminder');
    expect(n.rows.map((r) => r.type)).not.toContain('escalation');
    // not reminded twice
    const again = await t.as(EHS, (tx) => tx.query<{ r: any }>(`select public.check_sla() as r`));
    expect(again.rows[0].r.reminded).toBe(0);
  });

  it('a report whose AI result never arrives becomes Unclassified after 2 minutes', async () => {
    const x = await createLiveReport(W, 'WARE', 'signal lost right after submit');
    await t.as(EHS, (tx) => tx.query(`select public.demo_fast_forward(5)`));
    const r = await one(t.db.query<any>(`select ai_status, needs_review, category from public.reports where id = $1`, [x.id]));
    expect(r).toEqual({ ai_status: 'failed', needs_review: true, category: null });
    // a late result still lands
    await classify(x.id, { status: 'done', category: 'Other', raw_severity: 'Low', severity: 'Low', confidence: 0.9, summary: 'late' });
    expect((await one(t.db.query<any>(`select ai_status from public.reports where id = $1`, [x.id]))).ai_status).toBe('done');
  });
});

describe('demo reset', () => {
  it('EHS can reset; the clock returns to zero and the story is rebuilt', async () => {
    await t.as(EHS, (tx) => tx.query(`select public.reset_demo()`));
    const s = await one(t.db.query<any>(`select demo_offset_minutes from public.settings`));
    expect(s.demo_offset_minutes).toBe(0);
    const r = await one(t.db.query<{ n: number }>(`select count(*)::int as n from public.reports`));
    expect(r.n).toBe(70);
    const no = await one(t.db.query<{ n: number }>(`select min(report_no)::int as n from public.reports`));
    expect(no.n).toBe(1);
  });
});
