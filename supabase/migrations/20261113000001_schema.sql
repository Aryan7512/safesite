-- SafeSite · 0001 · schema
-- Tables, enums, demo clock and helper functions. PRD §7, §9.

-- ─── Enums ──────────────────────────────────────────────────────────────────
create type public.user_role as enum ('worker', 'supervisor', 'ehs');

create type public.hazard_category as enum (
  'Spill / Leak',
  'Fire / Ignition',
  'Slip-Trip-Fall',
  'PPE',
  'Equipment Fault',
  'Chemical Exposure',
  'Electrical',
  'Other'
);

create type public.severity as enum ('Low', 'Medium', 'High');

create type public.action_status as enum ('New', 'Assigned', 'In Progress', 'Closed');

create type public.duplicate_status as enum ('suggested', 'merged', 'dismissed');

-- ─── Settings (single row) ──────────────────────────────────────────────────
create table public.settings (
  id                   boolean primary key default true check (id),
  demo_offset_minutes  integer not null default 0,
  confidence_threshold numeric(3,2) not null default 0.60,
  -- hours; "configurable assumptions" (PRD §7)
  sla jsonb not null default '{
    "High":   {"due_h": 4,  "escalate_h": 2},
    "Medium": {"due_h": 24, "escalate_h": 12},
    "Low":    {"due_h": 72, "escalate_h": 48}
  }'::jsonb,
  risk_weights jsonb not null default '{
    "High": 5, "Medium": 3, "Low": 1, "repeat": 2, "breach": 2
  }'::jsonb,
  duplicate_window_h   integer not null default 2,
  repeat_window_d      integer not null default 7,
  retention_days       integer not null default 90,
  plant_tz             text not null default 'Asia/Kolkata',
  paper_minutes        integer not null default 8,
  updated_at           timestamptz not null default now()
);
insert into public.settings (id) values (true);

-- ─── Demo clock ─────────────────────────────────────────────────────────────
-- Every timestamp the system writes uses app_now() so that a fast-forward
-- moves the whole plant forward, not only the SLA check (PRD §7 Demo clock).
create or replace function public.app_now()
returns timestamptz
language sql stable
set search_path = public
as $$
  select now() + make_interval(mins => coalesce((select demo_offset_minutes from public.settings where id), 0));
$$;

-- Shift A 06–14, B 14–22, C 22–06, plant local time.
create or replace function public.shift_for(ts timestamptz)
returns text
language sql stable
set search_path = public
as $$
  select case
    when h >= 6 and h < 14 then 'A'
    when h >= 14 and h < 22 then 'B'
    else 'C'
  end
  from (select extract(hour from ts at time zone (select plant_tz from public.settings where id))::int as h) s;
$$;

-- ─── Users (profile of auth.users) ──────────────────────────────────────────
create table public.users (
  id                      uuid primary key references auth.users (id) on delete cascade,
  email                   text not null unique,
  name                    text not null,
  role                    public.user_role not null default 'worker',
  is_contractor           boolean not null default false,
  language                text not null default 'en' check (language in ('en', 'hi')),
  area_id                 integer,                     -- home area for supervisors (informational)
  induction_completed_at  timestamptz,
  created_at              timestamptz not null default now()
);

-- Profile row is created from auth metadata when an auth user is created.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, name, role, is_contractor, language)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'worker'),
    coalesce((new.raw_user_meta_data ->> 'is_contractor')::boolean, false),
    coalesce(new.raw_user_meta_data ->> 'language', 'en')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ─── Areas ──────────────────────────────────────────────────────────────────
create table public.areas (
  id             serial primary key,
  code           text not null unique,
  name           text not null,
  name_hi        text not null,
  qr_code        text not null unique,
  svg_region_id  text not null unique,
  supervisor_id  uuid references public.users (id) on delete set null,
  lat            double precision,
  lng            double precision
);

alter table public.users
  add constraint users_area_fk foreign key (area_id) references public.areas (id) on delete set null;

insert into public.areas (code, name, name_hi, qr_code, svg_region_id, lat, lng) values
  ('TANK',  'Tank Farm',               'टैंक फ़ार्म',           'SAFESITE:AREA:TANK',  'zone-tank',  19.0731, 72.8992),
  ('REACT', 'Reactor Block',           'रिएक्टर ब्लॉक',        'SAFESITE:AREA:REACT', 'zone-react', 19.0736, 72.9001),
  ('DIST',  'Distillation Unit',       'डिस्टिलेशन यूनिट',      'SAFESITE:AREA:DIST',  'zone-dist',  19.0741, 72.9009),
  ('LOAD',  'Loading Bay',             'लोडिंग बे',             'SAFESITE:AREA:LOAD',  'zone-load',  19.0724, 72.8985),
  ('WARE',  'Raw Material Warehouse',  'कच्चा माल गोदाम',        'SAFESITE:AREA:WARE',  'zone-ware',  19.0720, 72.8996),
  ('UTIL',  'Utilities (Boiler House)','यूटिलिटी (बॉयलर हाउस)', 'SAFESITE:AREA:UTIL',  'zone-util',  19.0727, 72.9006),
  ('ETP',   'Effluent Treatment Plant','अपशिष्ट उपचार संयंत्र',  'SAFESITE:AREA:ETP',   'zone-etp',   19.0718, 72.9013),
  ('WKSP',  'Maintenance Workshop',    'मेंटेनेंस वर्कशॉप',      'SAFESITE:AREA:WKSP',  'zone-wksp',  19.0745, 72.8990);

-- ─── Reports ────────────────────────────────────────────────────────────────
create table public.reports (
  id                bigint generated always as identity primary key,
  report_no         integer not null unique,
  client_id         uuid not null unique,                 -- idempotent retry key; also the storage folder
  user_id           uuid not null references public.users (id),
  area_id           integer not null references public.areas (id),
  shift             text not null check (shift in ('A', 'B', 'C')),
  created_at        timestamptz not null,
  input_mode        text not null default 'voice' check (input_mode in ('voice', 'text')),
  capture_seconds   integer,                              -- time from first tap to submit
  transcript        text not null default '',
  language          text,                                 -- 'en' | 'hi' | 'mixed' (detected)
  photo_urls        text[] not null default '{}',         -- storage paths, signed at read time
  audio_url         text,                                 -- storage path
  lat               double precision,
  lng               double precision,
  -- AI suggestion (kept beside the human-final values, PRD §8 Human override)
  ai_status         text not null default 'pending' check (ai_status in ('pending', 'done', 'failed')),
  ai_category       public.hazard_category,
  ai_severity       public.severity,
  ai_confidence     numeric(3,2),
  ai_model          text,
  ai_error          text,
  summary           text,
  guard_reason      text,                                 -- keyword guard match, e.g. "gas"
  -- Final values (null = Unclassified, manual triage)
  category          public.hazard_category,
  severity          public.severity,
  needs_review      boolean not null default true,
  triaged_at        timestamptz,
  -- Deterministic pattern rules (PRD §7)
  is_duplicate_of   bigint references public.reports (id),
  duplicate_status  public.duplicate_status,
  is_repeat         boolean not null default false,
  repeat_count      integer not null default 0
);

create sequence public.report_no_seq start 1;
create index reports_area_cat_created on public.reports (area_id, category, created_at);
create index reports_user on public.reports (user_id);
create index reports_created on public.reports (created_at);

-- ─── Actions (1:1 with reports) ─────────────────────────────────────────────
create table public.actions (
  id               bigint generated always as identity primary key,
  report_id        bigint not null unique references public.reports (id) on delete cascade,
  owner_id         uuid references public.users (id),
  status           public.action_status not null default 'New',
  due_at           timestamptz not null,
  escalate_at      timestamptz not null,
  escalated_level  integer not null default 0,
  escalated_at     timestamptz,
  breached_at      timestamptz,
  assigned_at      timestamptz,
  started_at       timestamptz,
  closed_at        timestamptz,
  resolution_note  text,
  fix_photo_url    text,                                  -- storage path
  merged_into      bigint references public.reports (id), -- set when this report was merged as a duplicate
  updated_at       timestamptz not null default now()
);
create index actions_status on public.actions (status);

-- ─── Audit log (insert-only) ────────────────────────────────────────────────
create table public.audit_logs (
  id           bigint generated always as identity primary key,
  ts           timestamptz not null,
  actor_id     uuid references public.users (id),         -- null = system (rules engine / SLA check)
  report_id    bigint references public.reports (id) on delete cascade,
  action_type  text not null,
  old_value    jsonb,
  new_value    jsonb
);
create index audit_report on public.audit_logs (report_id, ts);

create or replace function public.audit_logs_reject_change()
returns trigger
language plpgsql
as $$
begin
  -- Only the EHS-only demo reset may clear the log, and it says so (PRD §14 seed reset).
  if current_setting('safesite.allow_reset', true) = 'on' then
    return coalesce(old, new);
  end if;
  raise exception 'audit_logs is insert-only';
end;
$$;

create trigger audit_logs_no_update before update on public.audit_logs
  for each row execute function public.audit_logs_reject_change();
create trigger audit_logs_no_delete before delete on public.audit_logs
  for each row execute function public.audit_logs_reject_change();
create trigger audit_logs_no_truncate before truncate on public.audit_logs
  for each statement execute function public.audit_logs_reject_change();

-- ─── Notifications ──────────────────────────────────────────────────────────
create table public.notifications (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.users (id) on delete cascade,
  report_id   bigint references public.reports (id) on delete cascade,
  type        text not null,  -- new_report | assigned | escalation | reminder | sla_breach | closed
  body        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null,
  read_at     timestamptz
);
create index notifications_user on public.notifications (user_id, created_at desc);

-- ─── Role helpers (security definer so RLS policies can call them cheaply) ──
create or replace function public.my_role()
returns public.user_role
language sql stable security definer
set search_path = public
as $$ select role from public.users where id = auth.uid(); $$;

create or replace function public.is_ehs()
returns boolean
language sql stable security definer
set search_path = public
as $$ select coalesce((select role = 'ehs' from public.users where id = auth.uid()), false); $$;

create or replace function public.is_staff()
returns boolean
language sql stable security definer
set search_path = public
as $$ select coalesce((select role in ('supervisor', 'ehs') from public.users where id = auth.uid()), false); $$;

create or replace function public.supervises(p_area integer)
returns boolean
language sql stable security definer
set search_path = public
as $$ select exists (select 1 from public.areas where id = p_area and supervisor_id = auth.uid()); $$;

create or replace function public.can_see_report(p_report bigint)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.reports r
    where r.id = p_report
      and (r.user_id = auth.uid() or public.is_ehs() or public.supervises(r.area_id))
  );
$$;

-- Display number, e.g. SS-0081
create or replace function public.report_label(p_no integer)
returns text
language sql immutable
as $$ select 'SS-' || lpad(p_no::text, 4, '0'); $$;
