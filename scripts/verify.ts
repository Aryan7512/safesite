// Live checks against the hosted project, through the same API the app uses
// (publishable key + real sign-ins, so RLS is exercised for real).
//
//   npm run verify            read-only checks
//   npm run verify -- --flow  also runs a full report lifecycle, then reset_demo()

import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PUBLISHABLE, SECRET, URL, need } from './env';
import { DEMO_PASSWORD } from './seed-data';

need(['EXPO_PUBLIC_SUPABASE_URL', URL], ['EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', PUBLISHABLE]);

let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
}

async function signIn(email: string): Promise<SupabaseClient> {
  const c = createClient(URL, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: DEMO_PASSWORD });
  if (error) throw new Error(`${email}: ${error.message}`);
  return c;
}

async function areaCodes(c: SupabaseClient) {
  const { data: reports } = await c.from('reports').select('area_id');
  const { data: areas } = await c.from('areas').select('id, code');
  const ids = new Set((reports ?? []).map((r) => r.area_id));
  return (areas ?? []).filter((a) => ids.has(a.id)).map((a) => a.code).sort();
}

async function main() {
  console.log(`SafeSite verify → ${URL}\n`);
  const worker = await signIn('worker@safesite.test');
  const sup = await signIn('supervisor@safesite.test');
  const ehs = await signIn('ehs@safesite.test');

  console.log('Row level security');
  const { data: wr } = await worker.from('reports').select('user_id');
  const { data: wu } = await worker.auth.getUser();
  check('worker sees only own reports', (wr ?? []).length > 0 && (wr ?? []).every((r) => r.user_id === wu.user?.id), `${wr?.length} rows`);
  const supAreas = await areaCodes(sup);
  check('supervisor sees only their 5 areas', JSON.stringify(supAreas) === JSON.stringify(['DIST', 'LOAD', 'REACT', 'TANK', 'WARE']), supAreas.join(','));
  const { count } = await ehs.from('reports').select('*', { count: 'exact', head: true });
  check('EHS sees all reports', (count ?? 0) >= 70, `${count}`);

  const ins = await worker.from('reports').insert({ report_no: 9999, client_id: randomUUID(), user_id: wu.user?.id, area_id: 1, shift: 'A', created_at: new Date().toISOString() });
  check('direct insert rejected', !!ins.error, ins.error?.message);
  const upd = await sup.from('actions').update({ status: 'Closed' }).neq('id', 0).select();
  check('direct update rejected / no rows changed', !!upd.error || (upd.data ?? []).length === 0, upd.error?.message ?? '0 rows');
  const del = await ehs.from('audit_logs').delete().neq('id', 0).select();
  check('audit delete rejected / no rows changed', !!del.error || (del.data ?? []).length === 0, del.error?.message ?? '0 rows');
  const ff = await worker.rpc('demo_fast_forward', { p_minutes: 60 });
  check('worker cannot fast-forward', !!ff.error, ff.error?.message);
  const ac = await worker.rpc('apply_classification', { p_report: 1, p_ai: {} });
  check('worker cannot write AI output', !!ac.error, ac.error?.message);

  console.log('\nSeed story');
  const { data: items } = await ehs.from('reports').select('id, is_repeat, duplicate_status, severity, area_id');
  const { data: acts } = await ehs.from('actions').select('report_id, status, breached_at');
  const openBreaches = (acts ?? []).filter((a) => a.status !== 'Closed' && a.breached_at).length;
  check('3 open SLA breaches', openBreaches === 3, `${openBreaches}`);
  check('a suggested duplicate exists', (items ?? []).some((r) => r.duplicate_status === 'suggested'));
  check('a merged duplicate exists', (items ?? []).some((r) => r.duplicate_status === 'merged'));
  check('repeat flags exist', (items ?? []).filter((r) => r.is_repeat).length >= 3);

  console.log('\nRealtime publication');
  const ch = sup.channel('verify').on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, () => {});
  const status = await new Promise<string>((resolve) => {
    const t = setTimeout(() => resolve('TIMEOUT'), 8000);
    ch.subscribe((s) => {
      if (s === 'SUBSCRIBED' || s === 'CHANNEL_ERROR') {
        clearTimeout(t);
        resolve(s);
      }
    });
  });
  check('realtime subscribe', status === 'SUBSCRIBED', status);
  await sup.removeChannel(ch);

  if (process.argv.includes('--flow')) {
    console.log('\nFull lifecycle (live AI)');
    const clientId = randomUUID();
    const { data: tank } = await worker.from('areas').select('id').eq('code', 'TANK').single();
    const created = await worker.rpc('create_report', {
      p_client_id: clientId, p_area_id: tank!.id, p_transcript: 'टैंक नंबर 2 के पास पाइप से गैस लीक हो रही है, तेज़ गंध आ रही है।',
      p_input_mode: 'text', p_capture_seconds: 41,
    });
    check('create_report', !created.error, created.error?.message ?? created.data?.label);
    const id = created.data?.id;
    const cls = await worker.functions.invoke('classify', { body: { report_id: id } });
    check('classify Edge Function', !cls.error && cls.data?.ok, cls.error?.message ?? JSON.stringify(cls.data?.result ?? {}).slice(0, 160));
    const { data: r } = await sup.from('reports').select('*').eq('id', id).single();
    check('severity High (keyword guard)', r?.severity === 'High', `${r?.ai_category} · AI ${r?.ai_severity} → ${r?.severity} · guard ${r?.guard_reason}`);
    check('repeat flagged (3rd in 7 days)', r?.is_repeat && r?.repeat_count >= 3, `${r?.repeat_count}`);
    const { data: me } = await sup.auth.getUser();
    const as = await sup.rpc('assign_action', { p_report: id, p_owner: me.user?.id });
    check('assign', !as.error, as.error?.message);
    const f = await ehs.rpc('demo_fast_forward', { p_minutes: 180 });
    check('fast-forward escalates', !f.error && f.data?.escalated >= 1, JSON.stringify(f.data ?? f.error?.message));
    await sup.rpc('start_action', { p_report: id });
    const cl = await sup.rpc('close_action', { p_report: id, p_note: 'Verify script: gasket replaced, gas test clear.' });
    check('close', !cl.error, cl.error?.message);
    const { data: wa } = await worker.from('actions').select('status, resolution_note').eq('report_id', id).single();
    check('reporter sees closure', wa?.status === 'Closed', wa?.resolution_note ?? '');
    if (SECRET) {
      const sb = createClient(URL, SECRET, { auth: { persistSession: false } });
      await sb.rpc('reset_demo');
      console.log('  ↺ reset_demo() restored the seed');
    } else {
      await ehs.rpc('reset_demo');
      console.log('  ↺ reset_demo() restored the seed');
    }
  }

  console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
