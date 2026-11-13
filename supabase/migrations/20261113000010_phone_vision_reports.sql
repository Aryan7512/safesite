-- SafeSite · 0010 · phone sign-in, photo analysis, richer reports, report numbers

-- a) Phone sign-in: workers sign in with their mobile number and a 6-digit PIN.
alter table public.users add column phone text unique;

-- Resolves a mobile number to the account's sign-in id. Callable before sign-in.
-- The PIN is still checked by Supabase Auth (with its rate limits).
create or replace function public.login_id_for_phone(p_phone text)
returns text
language sql stable security definer
set search_path = public
as $$
  select email from public.users
  where phone = right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10)
    and length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) >= 10;
$$;
revoke execute on function public.login_id_for_phone(text) from public;
grant execute on function public.login_id_for_phone(text) to anon, authenticated;

-- b) Richer report + photo analysis (vision model) stored beside the text result.
alter table public.reports
  add column title text,
  add column recommended_action text,
  add column transcript_en text,
  add column vision_summary text,
  add column vision_severity public.severity,
  add column vision_model text;

create or replace function public.apply_classification(p_report bigint, p_ai jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  r public.reports;
  a public.actions;
  s public.settings;
  v_failed boolean := coalesce(p_ai ->> 'status', 'failed') <> 'done';
  v_cat public.hazard_category;
  v_raw_sev public.severity;
  v_sev public.severity;
  v_conf numeric;
  v_needs boolean;
begin
  select * into r from public.reports where id = p_report for update;
  if not found then raise exception 'Report % not found', p_report; end if;
  select * into a from public.actions where report_id = p_report;
  select * into s from public.settings where id;

  -- Values were validated against the enums in the Edge Function; casting
  -- again here means anything outside the enum fails loudly instead of landing.
  v_cat     := case when v_failed then null else (p_ai ->> 'category')::public.hazard_category end;
  v_raw_sev := case when v_failed then null else (p_ai ->> 'raw_severity')::public.severity end;
  v_sev     := (p_ai ->> 'severity')::public.severity;  -- may be set by the keyword guard even on failure
  v_conf    := case when v_failed then null else least(greatest((p_ai ->> 'confidence')::numeric, 0), 1) end;

  v_needs := v_failed
          or v_cat is null
          or coalesce((p_ai ->> 'invalid')::boolean, false)
          or coalesce(v_conf, 0) < s.confidence_threshold;

  update public.reports set
    ai_status     = case when v_failed then 'failed' else 'done' end,
    ai_category   = v_cat,
    ai_severity   = v_raw_sev,
    ai_confidence = v_conf,
    ai_model      = p_ai ->> 'model',
    ai_error      = left(p_ai ->> 'error', 300),
    summary       = coalesce(nullif(left(p_ai ->> 'summary', 200), ''), summary),
    language      = coalesce(nullif(p_ai ->> 'language', ''), language),
    guard_reason  = nullif(p_ai ->> 'guard_reason', ''),
    title              = coalesce(nullif(left(p_ai ->> 'title', 90), ''), title),
    recommended_action = coalesce(nullif(left(p_ai ->> 'recommended_action', 300), ''), recommended_action),
    transcript_en      = coalesce(nullif(left(p_ai ->> 'transcript_en', 1200), ''), transcript_en),
    vision_summary     = coalesce(nullif(left(p_ai ->> 'vision_summary', 400), ''), vision_summary),
    vision_severity    = coalesce((p_ai ->> 'vision_severity')::public.severity, vision_severity),
    vision_model       = coalesce(nullif(p_ai ->> 'vision_model', ''), vision_model)
  where id = r.id;

  -- A human decision always wins over a late AI result.
  if r.triaged_at is null then
    update public.reports set category = v_cat, severity = v_sev, needs_review = v_needs where id = r.id;

    if a.status <> 'Closed' and not a.due_overridden then
      update public.actions set
        due_at      = r.created_at + make_interval(secs => public._sla(v_sev, 'due_h') * 3600),
        escalate_at = case when escalated_level = 0
                           then r.created_at + make_interval(secs => public._sla(v_sev, 'escalate_h') * 3600)
                           else escalate_at end,
        updated_at  = now()
      where report_id = r.id;
    end if;

    perform public.evaluate_patterns(r.id);
  end if;

  perform public._audit(r.id, null, case when v_failed then 'ai_failed' else 'ai_classified' end, null,
    jsonb_build_object(
      'ai_category', v_cat, 'ai_severity', v_raw_sev, 'ai_confidence', v_conf,
      'severity', v_sev, 'guard_reason', p_ai ->> 'guard_reason', 'needs_review', v_needs,
      'vision_severity', p_ai ->> 'vision_severity',
      'model', p_ai ->> 'model', 'error', left(p_ai ->> 'error', 120)));

  if v_sev = 'High' and r.triaged_at is null then
    perform public._notify((select supervisor_id from public.areas where id = r.area_id), r.id,
                           'high_severity', public._report_body(r.id));
  end if;

  return jsonb_build_object('ok', true, 'category', v_cat, 'severity', v_sev, 'needs_review', v_needs);
end;
$$;

revoke execute on function public.apply_classification(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.apply_classification(bigint, jsonb) to service_role;

-- c) Report numbers never repeat across demo resets.
create or replace function public.reset_demo()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  t public.seed_templates;
  v_now timestamptz;
  v_tz text;
  v_created timestamptz;
  v_reporter uuid;
  v_area public.areas;
  v_owner uuid;
  v_id bigint;
  v_assigned timestamptz;
  v_started timestamptz;
  v_closed timestamptz;
  v_due timestamptz;
  v_esc timestamptz;
  v_end timestamptz;
  v_conf_thr numeric;
  v_parent bigint;
  v_count integer := 0;
  v_keys jsonb := '{}'::jsonb;
begin
  -- EHS from the Admin screen, or the service role from scripts/seed.ts.
  if auth.uid() is not null and not public.is_ehs() then
    raise exception 'EHS Lead only' using errcode = '42501';
  end if;

  perform set_config('safesite.allow_reset', 'on', true);
  delete from public.notifications where true;
  delete from public.audit_logs where true;
  delete from public.actions where true;
  delete from public.reports where true;
  update public.settings set demo_offset_minutes = 0, updated_at = now() where id;
  perform set_config('safesite.allow_reset', 'off', true);

  v_now := now();
  select plant_tz, confidence_threshold into v_tz, v_conf_thr from public.settings where id;

  for t in select * from public.seed_templates order by sort loop
    if t.age_minutes is not null then
      v_created := v_now - make_interval(mins => t.age_minutes);
    else
      v_created := ((date_trunc('day', v_now at time zone v_tz) - make_interval(days => t.days_ago)) + t.local_time)
                   at time zone v_tz;
    end if;
    v_created := least(v_created, v_now - interval '5 minutes');

    select id into v_reporter from public.users where email = t.reporter_email;
    select * into v_area from public.areas where code = t.area_code;
    if v_reporter is null or v_area.id is null then
      raise exception 'Seed template % references unknown user % or area %', t.key, t.reporter_email, t.area_code;
    end if;
    v_owner := coalesce((select id from public.users where email = t.owner_email), v_area.supervisor_id);

    -- Transition times, clamped so nothing lands in the future and order holds.
    v_assigned := case when t.assigned_after_min is not null
                       then least(v_created + make_interval(mins => t.assigned_after_min), v_now - interval '3 minutes') end;
    v_started  := case when t.started_after_min is not null
                       then greatest(least(v_created + make_interval(mins => t.started_after_min), v_now - interval '2 minutes'), v_assigned) end;
    v_closed   := case when t.closed_after_min is not null
                       then greatest(least(v_created + make_interval(mins => t.closed_after_min), v_now - interval '1 minute'), v_started) end;

    v_due := v_created + make_interval(secs => public._sla(t.severity, 'due_h') * 3600);
    v_esc := v_created + make_interval(secs => public._sla(t.severity, 'escalate_h') * 3600);

    insert into public.reports (
      report_no, client_id, user_id, area_id, shift, created_at, input_mode, capture_seconds,
      transcript, language, lat, lng, ai_status, ai_category, ai_severity, ai_confidence, ai_model,
      summary, guard_reason, category, severity, needs_review, triaged_at
    ) values (
      t.sort, gen_random_uuid(), v_reporter, v_area.id, public.shift_for(v_created),
      v_created, t.input_mode, t.capture_seconds, t.transcript, t.language,
      v_area.lat + (random() - 0.5) * 0.0004, v_area.lng + (random() - 0.5) * 0.0004,
      t.ai_status, t.ai_category, t.ai_severity, t.ai_confidence,
      case when t.ai_status = 'done' then 'openai/gpt-oss-120b' end,
      t.summary, t.guard_reason, t.category, t.severity,
      not t.triaged and (t.category is null or coalesce(t.ai_confidence, 0) < v_conf_thr),
      case when t.triaged then coalesce(v_assigned, v_created + interval '10 minutes') end
    ) returning id into v_id;

    v_keys := v_keys || jsonb_build_object(t.key, v_id);

    insert into public.actions (
      report_id, owner_id, status, due_at, escalate_at, assigned_at, started_at, closed_at, resolution_note
    ) values (
      v_id, v_owner, t.status, v_due, v_esc, v_assigned, v_started, v_closed, t.resolution_note
    );

    -- Audit trail with historical timestamps.
    perform set_config('safesite.audit_ts', v_created::text, true);
    perform public._audit(v_id, v_reporter, 'created', null,
      jsonb_build_object('area_id', v_area.id, 'shift', public.shift_for(v_created), 'input_mode', t.input_mode));
    perform set_config('safesite.audit_ts', (v_created + interval '20 seconds')::text, true);
    perform public._audit(v_id, null, case when t.ai_status = 'done' then 'ai_classified' else 'ai_failed' end, null,
      jsonb_build_object('ai_category', t.ai_category, 'ai_severity', t.ai_severity,
                         'ai_confidence', t.ai_confidence, 'severity', coalesce(t.severity, t.ai_severity),
                         'guard_reason', t.guard_reason, 'model', 'openai/gpt-oss-120b'));
    if t.triaged and (t.category is distinct from t.ai_category or t.severity is distinct from t.ai_severity) then
      perform set_config('safesite.audit_ts', (coalesce(v_assigned, v_created + interval '10 minutes') - interval '1 minute')::text, true);
      perform public._audit(v_id, v_area.supervisor_id, 'reclassified',
        jsonb_build_object('category', t.ai_category, 'severity', t.ai_severity,
                           'ai_category', t.ai_category, 'ai_severity', t.ai_severity),
        jsonb_build_object('category', t.category, 'severity', t.severity));
    end if;
    if v_assigned is not null then
      perform set_config('safesite.audit_ts', v_assigned::text, true);
      perform public._audit(v_id, v_area.supervisor_id, 'assigned',
        jsonb_build_object('status', 'New'), jsonb_build_object('status', 'Assigned', 'owner_id', v_owner, 'due_at', v_due));
    end if;
    if v_started is not null then
      perform set_config('safesite.audit_ts', v_started::text, true);
      perform public._audit(v_id, v_owner, 'status_changed',
        jsonb_build_object('status', 'Assigned'), jsonb_build_object('status', 'In Progress'));
    end if;

    -- Escalation and breach as the SLA check would have recorded them.
    v_end := coalesce(v_closed, v_now);
    if v_end > v_esc then
      perform set_config('safesite.audit_ts', v_esc::text, true);
      if t.severity = 'Low' then
        update public.actions set reminded_at = v_esc where report_id = v_id;
        perform public._audit(v_id, null, 'reminder_sent', null,
          jsonb_build_object('to', 'EHS Lead', 'reason', 'Open past ' || public._sla(t.severity, 'escalate_h') || ' h'));
      else
        update public.actions set escalated_level = 1, escalated_at = v_esc where report_id = v_id;
      perform public._audit(v_id, null, 'escalated', jsonb_build_object('escalated_level', 0),
        jsonb_build_object('escalated_level', 1, 'to', 'EHS Lead',
                           'reason', 'Open past ' || public._sla(t.severity, 'escalate_h') || ' h',
                           'severity', coalesce(t.severity::text, 'Unclassified')));
      end if;
    end if;
    if v_end > v_due then
      update public.actions set breached_at = v_due where report_id = v_id;
      perform set_config('safesite.audit_ts', v_due::text, true);
      perform public._audit(v_id, null, 'sla_breached', null, jsonb_build_object('due_at', v_due));
    end if;

    if v_closed is not null then
      perform set_config('safesite.audit_ts', v_closed::text, true);
      perform public._audit(v_id, v_owner, 'closed', jsonb_build_object('status', 'In Progress'),
        jsonb_build_object('status', 'Closed', 'resolution_note', t.resolution_note, 'fix_photo', false));
    end if;

    -- Planted duplicate (merged pairs are stated explicitly; suggestions come from the rule).
    if t.dup_of_key is not null and t.dup_status = 'merged' then
      v_parent := (v_keys ->> t.dup_of_key)::bigint;
      update public.reports set is_duplicate_of = v_parent, duplicate_status = 'merged' where id = v_id;
      update public.actions set merged_into = v_parent where report_id = v_id;
      perform set_config('safesite.audit_ts', (v_created + interval '30 minutes')::text, true);
      perform public._audit(v_id, v_area.supervisor_id, 'merged', null, jsonb_build_object('merged_into', v_parent));
    end if;

    perform set_config('safesite.audit_ts', (v_created + interval '20 seconds')::text, true);
    perform public.evaluate_patterns(v_id);

    v_count := v_count + 1;
  end loop;

  -- Seeded reports keep numbers 1..N; live report numbers are never reused,
  -- so each new report gets a new number even across demo resets.
  perform setval('public.report_no_seq', greatest((select last_value from public.report_no_seq), v_count), true);

  perform set_config('safesite.audit_ts', '', true);
  perform public._audit(null, auth.uid(), 'demo_reset', null, jsonb_build_object('reports', v_count));

  return jsonb_build_object('reports', v_count, 'reset_at', v_now);
end;
$$;

revoke execute on function public.reset_demo() from public, anon;
grant execute on function public.reset_demo() to authenticated, service_role;
