// Runs the real migrations in PGlite (Postgres compiled to WASM) with small
// stand-ins for the Supabase-provided schemas (auth, storage, cron) and roles.
// Lets us test RLS, RPCs, the status machine, SLA escalation and the seed
// without Docker or a hosted project.

import { PGlite, type Transaction } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AREA_SUPERVISOR, USERS } from '../../scripts/seed-data';

const ROOT = join(__dirname, '..', '..');

const SUPABASE_STUBS = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;

-- Supabase's hosted defaults: API roles get table + function privileges in public.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (
  id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid default auth.uid()
);
alter table storage.objects enable row level security;
grant select, insert on storage.objects to authenticated, service_role;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1 : array_length(string_to_array(name, '/'), 1) - 1]
$$;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;

create schema cron;
create table cron.job (jobname text primary key, schedule text, command text);
create function cron.schedule(name text, sched text, cmd text) returns bigint language sql as $$
  insert into cron.job values (name, sched, cmd) on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command;
  select 1::bigint;
$$;

create publication supabase_realtime;
`;

function migrationSql(): string[] {
  const dir = join(ROOT, 'supabase', 'migrations');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) =>
      readFileSync(join(dir, f), 'utf8')
        // pg_cron is provided by the stub schema above
        .replace(/create extension if not exists pg_cron;/gi, ''),
    );
}

export const SEED_TEMPLATES: Record<string, unknown>[] = JSON.parse(
  readFileSync(join(ROOT, 'supabase', 'seed', 'templates.json'), 'utf8'),
);

export interface TestDb {
  db: PGlite;
  ids: Record<string, string>; // email → uuid
  /** Run fn as a signed-in user (RLS applies). Rolls back nothing; each call is its own transaction. */
  as<T>(email: string | null, fn: (tx: Transaction) => Promise<T>): Promise<T>;
  /** Run fn as the service role (bypasses RLS, like the Edge Functions' admin client). */
  asService<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;
}

export async function createTestDb(opts: { seed?: boolean } = {}): Promise<TestDb> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  for (const sql of migrationSql()) await db.exec(sql);

  // Auth users → public.users via the trigger, as seed-users.ts does via the Admin API.
  const ids: Record<string, string> = {};
  for (const u of USERS) {
    const res = await db.query<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
      [u.email, { name: u.name, role: u.role, is_contractor: u.is_contractor, language: u.language }],
    );
    ids[u.email] = res.rows[0].id;
    await db.query(`update public.users set phone = $1 where id = $2`, [u.phone, ids[u.email]]);
    if (u.induction_done) {
      await db.query(`update public.users set induction_completed_at = now() where id = $1`, [ids[u.email]]);
    }
  }
  for (const [code, email] of Object.entries(AREA_SUPERVISOR)) {
    await db.query(`update public.areas set supervisor_id = $1 where code = $2`, [ids[email], code]);
  }

  const as: TestDb['as'] = (email, fn) =>
    db.transaction(async (tx) => {
      await tx.exec(`set local role authenticated`);
      if (email) await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [ids[email]]);
      return fn(tx);
    });

  const asService: TestDb['asService'] = (fn) =>
    db.transaction(async (tx) => {
      await tx.exec(`set local role service_role`);
      return fn(tx);
    });

  if (opts.seed) {
    await loadTemplates(db);
    await db.query(`select public.reset_demo()`);
  }

  return { db, ids, as, asService };
}

export async function loadTemplates(db: PGlite) {
  await db.exec(`delete from public.seed_templates`);
  await db.query(
    `insert into public.seed_templates select * from jsonb_populate_recordset(null::public.seed_templates, $1::jsonb)`,
    [JSON.stringify(SEED_TEMPLATES)],
  );
}

/** Key of a seeded report → its id (by matching transcript + created order). */
export async function seededId(db: PGlite, key: string): Promise<number> {
  const t = SEED_TEMPLATES.find((x) => x.key === key);
  if (!t) throw new Error(`no template ${key}`);
  const res = await db.query<{ id: number }>(
    `select r.id from public.reports r join public.seed_templates s on s.sort = r.report_no where s.key = $1`,
    [key],
  );
  return res.rows[0].id;
}
