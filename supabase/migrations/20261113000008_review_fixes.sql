-- SafeSite · 0008 · review fixes
--  a) Low severity: reminder to EHS only, not an escalation (PRD §7 SLA table).
--  b) Reports whose AI result never arrived (phone lost signal after submit)
--     stop showing "Processing…": after 2 minutes they become Unclassified
--     for manual triage, with a Retry on the dashboard (PRD §8 Failure handling).

alter table public.actions add column reminded_at timestamptz;

create or replace function public.sweep_pending_ai()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  x record;
  n integer := 0;
begin
  for x in
    select id from public.reports
    where ai_status = 'pending' and created_at < public.app_now() - interval '2 minutes'
    for update
  loop
    update public.reports set ai_status = 'failed',
      ai_error = 'No classification result arrived (connection lost after submit)'
    where id = x.id;
    perform public._audit(x.id, null, 'ai_failed', null,
      jsonb_build_object('error', 'no result within 2 minutes', 'needs_review', true));
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function public.sweep_pending_ai() from public, anon, authenticated;

create or replace function public.check_sla()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_now timestamptz := public.app_now();
  v_escalated integer := 0;
  v_reminded integer := 0;
  v_breached integer := 0;
  v_swept integer := 0;
  x record;
  e record;
begin
  if auth.uid() is not null and not public.is_staff() then
    raise exception 'Only staff can run the SLA check' using errcode = '42501';
  end if;

  v_swept := public.sweep_pending_ai();

  for x in
    select a.report_id, a.owner_id, a.escalate_at, a.due_at, r.severity
    from public.actions a join public.reports r on r.id = a.report_id
    where a.status <> 'Closed' and a.merged_into is null
      and a.escalated_level = 0 and a.reminded_at is null and a.escalate_at <= v_now
    for update of a
  loop
    if x.severity = 'Low' then
      -- Reminder only: no escalation flag.
      update public.actions set reminded_at = v_now, updated_at = now() where report_id = x.report_id;
      perform public._audit(x.report_id, null, 'reminder_sent', null,
        jsonb_build_object('to', 'EHS Lead', 'reason', 'Open past ' || public._sla(x.severity, 'escalate_h') || ' h'));
      for e in select id from public.users where role = 'ehs' loop
        perform public._notify(e.id, x.report_id, 'reminder',
          public._report_body(x.report_id) || jsonb_build_object('escalate_h', public._sla(x.severity, 'escalate_h')));
      end loop;
      v_reminded := v_reminded + 1;
    else
      update public.actions set escalated_level = 1, escalated_at = v_now, updated_at = now()
      where report_id = x.report_id;
      perform public._audit(x.report_id, null, 'escalated',
        jsonb_build_object('escalated_level', 0),
        jsonb_build_object('escalated_level', 1, 'to', 'EHS Lead',
                           'reason', 'Open past ' || public._sla(x.severity, 'escalate_h') || ' h',
                           'severity', coalesce(x.severity::text, 'Unclassified')));
      for e in select id from public.users where role = 'ehs' loop
        perform public._notify(e.id, x.report_id, 'escalation',
          public._report_body(x.report_id) || jsonb_build_object('escalate_h', public._sla(x.severity, 'escalate_h')));
      end loop;
      v_escalated := v_escalated + 1;
    end if;
  end loop;

  for x in
    select a.report_id, a.owner_id, a.due_at
    from public.actions a
    where a.status <> 'Closed' and a.merged_into is null
      and a.breached_at is null and a.due_at <= v_now
    for update of a
  loop
    update public.actions set breached_at = v_now, updated_at = now() where report_id = x.report_id;
    perform public._audit(x.report_id, null, 'sla_breached', null, jsonb_build_object('due_at', x.due_at));
    perform public._notify(x.owner_id, x.report_id, 'sla_breach', public._report_body(x.report_id));
    for e in select id from public.users where role = 'ehs' and id is distinct from x.owner_id loop
      perform public._notify(e.id, x.report_id, 'sla_breach', public._report_body(x.report_id));
    end loop;
    v_breached := v_breached + 1;
  end loop;

  return jsonb_build_object('escalated', v_escalated, 'reminded', v_reminded, 'breached', v_breached,
                            'ai_swept', v_swept, 'checked_at', v_now);
end;
$$;
revoke execute on function public.check_sla() from public, anon;
grant execute on function public.check_sla() to authenticated;

-- Seed: a Low report past its reminder time is "reminded", not escalated.
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
  perform setval('public.report_no_seq', 1, false);
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
      nextval('public.report_no_seq'), gen_random_uuid(), v_reporter, v_area.id, public.shift_for(v_created),
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

  perform set_config('safesite.audit_ts', '', true);
  perform public._audit(null, auth.uid(), 'demo_reset', null, jsonb_build_object('reports', v_count));

  return jsonb_build_object('reports', v_count, 'reset_at', v_now);
end;
$$;

revoke execute on function public.reset_demo() from public, anon;
grant execute on function public.reset_demo() to authenticated, service_role;
