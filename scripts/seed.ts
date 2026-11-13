// One-command seed for the hosted project (PRD §14):
//   1. create / update the demo auth users (Admin API, idempotent)
//   2. set induction status and area supervisors
//   3. load supabase/seed/templates.json into seed_templates
//   4. call reset_demo() → 70 reports + audit trail relative to now
//
//   npm run seed          (needs SUPABASE_SECRET_KEY in .env.local)
//   npm run seed -- --reset-only   (just step 4: before each demo)

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { admin } from './env';
import { AREA_SUPERVISOR, DEMO_PASSWORD, USERS } from './seed-data';

async function main() {
  const sb = admin();
  const resetOnly = process.argv.includes('--reset-only');

  if (!resetOnly) {
    // 1 · users
    const existing = new Map<string, string>();
    for (let page = 1; page < 10; page++) {
      const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      data.users.forEach((u) => u.email && existing.set(u.email, u.id));
      if (data.users.length < 200) break;
    }

    const ids: Record<string, string> = {};
    for (const u of USERS) {
      const meta = { name: u.name, role: u.role, is_contractor: u.is_contractor, language: u.language };
      if (existing.has(u.email)) {
        const id = existing.get(u.email)!;
        const { error } = await sb.auth.admin.updateUserById(id, { password: DEMO_PASSWORD, user_metadata: meta, email_confirm: true });
        if (error) throw error;
        ids[u.email] = id;
        console.log(`  user ✓ ${u.email} (updated)`);
      } else {
        const { data, error } = await sb.auth.admin.createUser({ email: u.email, password: DEMO_PASSWORD, email_confirm: true, user_metadata: meta });
        if (error) throw error;
        ids[u.email] = data.user.id;
        console.log(`  user + ${u.email}`);
      }
      // Profile row (trigger creates it on insert; keep it in sync on re-runs)
      const { error: pe } = await sb.from('users').upsert({
        id: ids[u.email], email: u.email, name: u.name, role: u.role, is_contractor: u.is_contractor, language: u.language,
        induction_completed_at: u.induction_done ? new Date().toISOString() : null,
      });
      if (pe) throw pe;
    }

    // 2 · area ownership
    for (const [code, email] of Object.entries(AREA_SUPERVISOR)) {
      const { error } = await sb.from('areas').update({ supervisor_id: ids[email] }).eq('code', code);
      if (error) throw error;
    }
    for (const email of new Set(Object.values(AREA_SUPERVISOR))) {
      const code = Object.entries(AREA_SUPERVISOR).find(([, e]) => e === email)![0];
      const { data: area } = await sb.from('areas').select('id').eq('code', code).single();
      await sb.from('users').update({ area_id: area?.id ?? null }).eq('id', ids[email]);
    }
    console.log('  areas ✓ supervisors assigned');

    // 3 · templates
    const templates = JSON.parse(readFileSync(join(__dirname, '..', 'supabase', 'seed', 'templates.json'), 'utf8'));
    const { error: de } = await sb.from('seed_templates').delete().neq('key', '');
    if (de) throw de;
    const { error: te } = await sb.from('seed_templates').insert(templates);
    if (te) throw te;
    console.log(`  templates ✓ ${templates.length}`);
  }

  // 4 · rebuild the story relative to now
  const { data, error } = await sb.rpc('reset_demo');
  if (error) throw error;
  console.log(`  reset_demo ✓ ${JSON.stringify(data)}`);
  if (!resetOnly) console.log(`\nDemo password for all accounts: ${DEMO_PASSWORD}`);
}

main().catch((e) => {
  console.error('Seed failed:', e.message ?? e);
  process.exit(1);
});
