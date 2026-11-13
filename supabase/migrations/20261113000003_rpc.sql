-- SafeSite · 0003 · RPCs
-- Every mutation lives here: role check → transition check → write → audit row,
-- all in one transaction. Deterministic rules (duplicate, repeat, SLA) are SQL,
-- never AI (PRD §8).

alter table public.actions add column due_overridden boolean not null default false;

-- ─── Internal helpers ───────────────────────────────────────────────────────
create or replace function public._audit(
  p_report bigint, p_actor uuid, p_type text, p_old jsonb, p_new jsonb
) returns void
language sql security definer
set search_path = public
as $$
  insert into public.audit_logs (ts, actor_id, report_id, action_type, old_value, new_value)
  values (public.app_now(), p_actor, p_report, p_type, p_old, p_new);
$$;

create or replace function public._notify(
  p_user uuid, p_report bigint, p_type text, p_body jsonb default '{}'::jsonb
) returns void
language sql security definer
set search_path = public
as $$
  insert into public.notifications (user_id, report_id, type, body, created_at)
  select p_user, p_report, p_type, p_body, public.app_now()
  where p_user is not null;
$$;

-- SLA hours for a severity; Unclassified runs on the Medium clock until triaged.
create or replace function public._sla(p_sev public.severity, p_key text)
returns numeric
language sql stable
set search_path = public
as $$
  select (sla -> coalesce(p_sev::text, 'Medium') ->> p_key)::numeric from public.settings where id;
$$;

create or replace function public._report_body(p_report bigint)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'report_no', public.report_label(r.report_no),
    'area', a.name,
    'area_hi', a.name_hi,
    'category', r.category,
    'severity', r.severity,
    'summary', r.summary
  )
  from public.reports r join public.areas a on a.id = r.area_id
  where r.id = p_report;
$$;

create or replace function public._require_staff_for(p_report bigint)
returns public.reports
language plpgsql stable security definer
set search_path = public
as $$
declare r public.reports;
begin
  select * into r from public.reports where id = p_report;
  if not found then raise exception 'Report % not found', p_report using errcode = 'P0002'; end if;
  if not (public.is_ehs() or public.supervises(r.area_id)) then
    raise exception 'Only the area supervisor or EHS lead can change this report' using errcode = '42501';
  end if;
  return r;
end;
$$;

-- ─── Duplicate + repeat rules (PRD §7) ──────────────────────────────────────
-- Both are evaluated relative to the report's own created_at, so they give the
-- same answer for live reports and for seeded history.
create or replace function public.evaluate_patterns(p_report bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  r public.reports;
  s public.settings;
  v_dup bigint;
  v_count integer;
begin
  select * into r from public.reports where id = p_report;
  select * into s from public.settings where id;

  -- Unclassified reports and merged duplicates take no part in pattern rules.
  if r.category is null or r.duplicate_status = 'merged' then
    update public.reports set is_repeat = false, repeat_count = 0 where id = r.id;
    return;
  end if;

  -- Possible duplicate: same area + category, created within N hours of an
  -- earlier report that was still open at that moment.
  if r.duplicate_status is null then
    select o.id into v_dup
    from public.reports o
    join public.actions oa on oa.report_id = o.id
    where o.id <> r.id
      and o.area_id = r.area_id
      and o.category = r.category
      and o.created_at <= r.created_at
      and o.created_at >= r.created_at - make_interval(hours => s.duplicate_window_h)
      and (o.duplicate_status is null or o.duplicate_status = 'dismissed')
      and (oa.closed_at is null or oa.closed_at > r.created_at)
    order by o.created_at asc
    limit 1;

    if v_dup is not null then
      update public.reports set is_duplicate_of = v_dup, duplicate_status = 'suggested' where id = r.id;
      perform public._audit(r.id, null, 'duplicate_suggested', null,
        jsonb_build_object('is_duplicate_of', v_dup,
                           'of_report_no', (select public.report_label(report_no) from public.reports where id = v_dup)));
    end if;
  end if;

  -- Repeat hazard: same area + category, 2+ reports in the last N days, open or closed.
  select count(*) into v_count
  from public.reports x
  where x.area_id = r.area_id
    and x.category = r.category
    and x.created_at <= r.created_at
    and x.created_at > r.created_at - make_interval(days => s.repeat_window_d)
    and x.duplicate_status is distinct from 'merged';

  if v_count >= 2 then
    if not r.is_repeat or r.repeat_count <> v_count then
      update public.reports set is_repeat = true, repeat_count = v_count where id = r.id;
      perform public._audit(r.id, null, 'repeat_flagged', null, jsonb_build_object('repeat_count', v_count));
    end if;
  else
    update public.reports set is_repeat = false, repeat_count = v_count where id = r.id;
  end if;
end;
$$;

-- Keep merged duplicates in step with the report they were merged into.
create or replace function public._sync_children(p_parent bigint, p_actor uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  pa public.actions;
  c record;
begin
  select * into pa from public.actions where report_id = p_parent;
  for c in
    select a.report_id, a.status, r.user_id
    from public.actions a join public.reports r on r.id = a.report_id
    where a.merged_into = p_parent and a.status is distinct from pa.status
  loop
    update public.actions set
      status = pa.status, owner_id = pa.owner_id, due_at = pa.due_at,
      assigned_at = pa.assigned_at, started_at = pa.started_at, closed_at = pa.closed_at,
      resolution_note = pa.resolution_note, fix_photo_url = pa.fix_photo_url,
      updated_at = now()
    where report_id = c.report_id;
    perform public._audit(c.report_id, p_actor, 'synced_from_parent',
      jsonb_build_object('status', c.status),
      jsonb_build_object('status', pa.status, 'parent_report_id', p_parent));
    if pa.status = 'Closed' then
      perform public._notify(c.user_id, c.report_id, 'closed', public._report_body(c.report_id));
    end if;
  end loop;
end;
$$;

-- ─── Worker: create a report ────────────────────────────────────────────────
create or replace function public.create_report(
  p_client_id       uuid,
  p_area_id         integer,
  p_transcript      text,
  p_input_mode      text default 'voice',
  p_capture_seconds integer default null,
  p_photo_paths     text[] default '{}',
  p_audio_path      text default null,
  p_lat             double precision default null,
  p_lng             double precision default null,
  p_language        text default null
) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := public.app_now();
  v_existing public.reports;
  v_id bigint;
  v_no integer;
  v_prefix text;
  v_path text;
  v_area public.areas;
begin
  if v_uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;

  -- Idempotent retry (PRD §10 basic retry): same client_id returns the same report.
  select * into v_existing from public.reports where client_id = p_client_id;
  if found then
    if v_existing.user_id <> v_uid then raise exception 'client_id already used' using errcode = '42501'; end if;
    return jsonb_build_object('id', v_existing.id, 'report_no', v_existing.report_no,
                              'label', public.report_label(v_existing.report_no), 'created', false,
                              'created_at', v_existing.created_at);
  end if;

  select * into v_area from public.areas where id = p_area_id;
  if not found then raise exception 'Unknown area' using errcode = '22023'; end if;

  if coalesce(length(trim(p_transcript)), 0) = 0 and coalesce(array_length(p_photo_paths, 1), 0) = 0 then
    raise exception 'A report needs a description or a photo' using errcode = '22023';
  end if;
  if length(p_transcript) > 4000 then raise exception 'Description too long' using errcode = '22023'; end if;

  -- Media must live in the caller's own folder for this report.
  v_prefix := v_uid::text || '/' || p_client_id::text || '/';
  foreach v_path in array coalesce(p_photo_paths, '{}') || coalesce(array[p_audio_path], '{}') loop
    if v_path is not null and left(v_path, length(v_prefix)) <> v_prefix then
      raise exception 'Media path outside the report folder' using errcode = '42501';
    end if;
  end loop;

  v_no := nextval('public.report_no_seq');

  insert into public.reports (
    report_no, client_id, user_id, area_id, shift, created_at, input_mode, capture_seconds,
    transcript, language, photo_urls, audio_url, lat, lng
  ) values (
    v_no, p_client_id, v_uid, p_area_id, public.shift_for(v_now), v_now,
    case when p_input_mode = 'text' then 'text' else 'voice' end,
    case when p_capture_seconds between 0 and 3600 then p_capture_seconds end,
    coalesce(trim(p_transcript), ''), p_language, coalesce(p_photo_paths, '{}'), p_audio_path, p_lat, p_lng
  ) returning id into v_id;

  insert into public.actions (report_id, owner_id, status, due_at, escalate_at)
  values (
    v_id, v_area.supervisor_id, 'New',
    v_now + make_interval(secs => public._sla(null, 'due_h') * 3600),
    v_now + make_interval(secs => public._sla(null, 'escalate_h') * 3600)
  );

  perform public._audit(v_id, v_uid, 'created', null, jsonb_build_object(
    'area_id', p_area_id, 'shift', public.shift_for(v_now), 'input_mode', p_input_mode,
    'photos', coalesce(array_length(p_photo_paths, 1), 0), 'has_audio', p_audio_path is not null));

  perform public._notify(v_area.supervisor_id, v_id, 'new_report', public._report_body(v_id));

  return jsonb_build_object('id', v_id, 'report_no', v_no, 'label', public.report_label(v_no),
                            'created', true, 'created_at', v_now);
end;
$$;

-- ─── Service role: store AI output (called by the classify Edge Function) ───
-- p_ai: { status: 'done'|'failed', category, severity (final, after guard),
--         raw_severity (model), confidence, summary, language, model, error,
--         guard_reason, invalid (bool) }
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
    guard_reason  = nullif(p_ai ->> 'guard_reason', '')
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
      'model', p_ai ->> 'model', 'error', left(p_ai ->> 'error', 120)));

  if v_sev = 'High' and r.triaged_at is null then
    perform public._notify((select supervisor_id from public.areas where id = r.area_id), r.id,
                           'high_severity', public._report_body(r.id));
  end if;

  return jsonb_build_object('ok', true, 'category', v_cat, 'severity', v_sev, 'needs_review', v_needs);
end;
$$;

-- ─── Staff: triage ──────────────────────────────────────────────────────────
create or replace function public.accept_report(p_report bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare r public.reports;
begin
  r := public._require_staff_for(p_report);
  if r.category is null or r.severity is null then
    raise exception 'Unclassified report: set category and severity first' using errcode = '22023';
  end if;
  update public.reports set needs_review = false, triaged_at = public.app_now() where id = r.id;
  perform public._audit(r.id, auth.uid(), 'accepted', null,
    jsonb_build_object('category', r.category, 'severity', r.severity,
                       'ai_category', r.ai_category, 'ai_severity', r.ai_severity));
end;
$$;

create or replace function public.reclassify_report(
  p_report bigint, p_category public.hazard_category, p_severity public.severity, p_reason text default null
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  r public.reports;
  a public.actions;
begin
  r := public._require_staff_for(p_report);
  select * into a from public.actions where report_id = r.id;

  update public.reports set
    category = p_category, severity = p_severity, needs_review = false, triaged_at = public.app_now()
  where id = r.id;

  if a.status <> 'Closed' and not a.due_overridden and r.severity is distinct from p_severity then
    update public.actions set
      due_at      = r.created_at + make_interval(secs => public._sla(p_severity, 'due_h') * 3600),
      escalate_at = case when escalated_level = 0
                         then r.created_at + make_interval(secs => public._sla(p_severity, 'escalate_h') * 3600)
                         else escalate_at end,
      updated_at  = now()
    where report_id = r.id;
  end if;

  -- AI value and human value side by side (PRD §8 Human override).
  perform public._audit(r.id, auth.uid(), 'reclassified',
    jsonb_build_object('category', r.category, 'severity', r.severity,
                       'ai_category', r.ai_category, 'ai_severity', r.ai_severity),
    jsonb_build_object('category', p_category, 'severity', p_severity, 'reason', nullif(trim(p_reason), '')));

  if r.category is distinct from p_category then
    perform public.evaluate_patterns(r.id);
  end if;
end;
$$;

-- ─── Staff: status machine  New → Assigned → In Progress → Closed ──────────
create or replace function public.assign_action(
  p_report bigint, p_owner uuid, p_due_at timestamptz default null
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  r public.reports;
  a public.actions;
  v_now timestamptz := public.app_now();
  v_new_status public.action_status;
begin
  r := public._require_staff_for(p_report);
  select * into a from public.actions where report_id = r.id for update;

  if a.merged_into is not null then raise exception 'Merged duplicate: manage the parent report' using errcode = '22023'; end if;
  if a.status = 'Closed' then raise exception 'Action is closed' using errcode = '22023'; end if;
  if r.category is null or r.severity is null then
    raise exception 'Unclassified report: set category and severity first' using errcode = '22023';
  end if;
  if not exists (select 1 from public.users where id = p_owner and role in ('supervisor', 'ehs')) then
    raise exception 'Owner must be a supervisor or EHS lead' using errcode = '22023';
  end if;
  if p_due_at is not null and p_due_at <= v_now then
    raise exception 'Due date must be in the future' using errcode = '22023';
  end if;

  v_new_status := case when a.status = 'New' then 'Assigned' else a.status end;

  update public.actions set
    owner_id       = p_owner,
    status         = v_new_status,
    due_at         = coalesce(p_due_at, due_at),
    due_overridden = due_overridden or (p_due_at is not null and p_due_at <> due_at),
    assigned_at    = coalesce(assigned_at, v_now),
    updated_at     = now()
  where report_id = r.id;

  -- Assigning is a triage decision too.
  if r.triaged_at is null then
    update public.reports set triaged_at = v_now, needs_review = false where id = r.id;
  end if;

  perform public._audit(r.id, auth.uid(), 'assigned',
    jsonb_build_object('status', a.status, 'owner_id', a.owner_id, 'due_at', a.due_at),
    jsonb_build_object('status', v_new_status, 'owner_id', p_owner, 'due_at', coalesce(p_due_at, a.due_at)));

  if p_owner is distinct from auth.uid() then
    perform public._notify(p_owner, r.id, 'assigned', public._report_body(r.id));
  end if;

  perform public._sync_children(r.id, auth.uid());
end;
$$;

create or replace function public.start_action(p_report bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  r public.reports;
  a public.actions;
begin
  r := public._require_staff_for(p_report);
  select * into a from public.actions where report_id = r.id for update;
  if a.status <> 'Assigned' then
    raise exception 'Only an Assigned action can move to In Progress (now %)', a.status using errcode = '22023';
  end if;
  update public.actions set status = 'In Progress', started_at = public.app_now(), updated_at = now()
  where report_id = r.id;
  perform public._audit(r.id, auth.uid(), 'status_changed',
    jsonb_build_object('status', a.status), jsonb_build_object('status', 'In Progress'));
  perform public._sync_children(r.id, auth.uid());
end;
$$;

create or replace function public.close_action(
  p_report bigint, p_note text, p_fix_photo_path text default null
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  r public.reports;
  a public.actions;
  v_now timestamptz := public.app_now();
begin
  r := public._require_staff_for(p_report);
  select * into a from public.actions where report_id = r.id for update;
  if a.status <> 'In Progress' then
    raise exception 'Only an In Progress action can be closed (now %)', a.status using errcode = '22023';
  end if;
  if coalesce(length(trim(p_note)), 0) < 3 then
    raise exception 'Closing requires a resolution note' using errcode = '22023';
  end if;
  if p_fix_photo_path is not null and left(p_fix_photo_path, length('fix/' || r.id || '/')) <> 'fix/' || r.id || '/' then
    raise exception 'Fix photo path outside the report folder' using errcode = '42501';
  end if;

  update public.actions set
    status = 'Closed', closed_at = v_now, resolution_note = trim(p_note),
    fix_photo_url = p_fix_photo_path, updated_at = now()
  where report_id = r.id;

  perform public._audit(r.id, auth.uid(), 'closed',
    jsonb_build_object('status', a.status),
    jsonb_build_object('status', 'Closed', 'resolution_note', trim(p_note), 'fix_photo', p_fix_photo_path is not null));

  -- Close the loop with the reporter (PRD §5.1 screen 6).
  perform public._notify(r.user_id, r.id, 'closed', public._report_body(r.id));
  perform public._sync_children(r.id, auth.uid());
end;
$$;

-- ─── Staff: duplicates ──────────────────────────────────────────────────────
create or replace function public.merge_duplicate(p_report bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  r public.reports;
  a public.actions;
begin
  r := public._require_staff_for(p_report);
  if r.duplicate_status is distinct from 'suggested' or r.is_duplicate_of is null then
    raise exception 'Not a suggested duplicate' using errcode = '22023';
  end if;
  select * into a from public.actions where report_id = r.id;
  if a.status = 'Closed' then raise exception 'Action is closed' using errcode = '22023'; end if;

  update public.reports set duplicate_status = 'merged', triaged_at = coalesce(triaged_at, public.app_now()),
                            needs_review = false
  where id = r.id;
  update public.actions set merged_into = r.is_duplicate_of, updated_at = now() where report_id = r.id;
  perform public.evaluate_patterns(r.id);  -- a merged duplicate no longer counts as a repeat

  perform public._audit(r.id, auth.uid(), 'merged', jsonb_build_object('status', a.status),
    jsonb_build_object('merged_into', r.is_duplicate_of));
  perform public._audit(r.is_duplicate_of, auth.uid(), 'duplicate_merged_in', null,
    jsonb_build_object('child_report_id', r.id, 'child_report_no', public.report_label(r.report_no)));

  -- Child now mirrors the parent's action.
  update public.actions c set
    status = p.status, owner_id = p.owner_id, due_at = p.due_at, assigned_at = p.assigned_at,
    started_at = p.started_at, updated_at = now()
  from public.actions p
  where c.report_id = r.id and p.report_id = r.is_duplicate_of;
end;
$$;

create or replace function public.dismiss_duplicate(p_report bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare r public.reports;
begin
  r := public._require_staff_for(p_report);
  if r.duplicate_status is distinct from 'suggested' then
    raise exception 'Not a suggested duplicate' using errcode = '22023';
  end if;
  update public.reports set duplicate_status = 'dismissed' where id = r.id;
  perform public._audit(r.id, auth.uid(), 'duplicate_dismissed', null,
    jsonb_build_object('was_duplicate_of', r.is_duplicate_of));
end;
$$;

-- ─── Everyone: notifications + induction ────────────────────────────────────
create or replace function public.mark_notifications_read(p_ids bigint[] default null)
returns void
language sql security definer
set search_path = public
as $$
  update public.notifications set read_at = public.app_now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
$$;

create or replace function public.complete_induction(p_score integer)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if p_score < 3 then raise exception 'All three answers must be correct' using errcode = '22023'; end if;
  update public.users set induction_completed_at = public.app_now() where id = auth.uid();
end;
$$;

create or replace function public.set_my_language(p_language text)
returns void
language sql security definer
set search_path = public
as $$
  update public.users set language = p_language where id = auth.uid() and p_language in ('en', 'hi');
$$;

-- ─── Grants ─────────────────────────────────────────────────────────────────
revoke execute on all functions in schema public from public, anon;

grant execute on function
  public.app_now(), public.shift_for(timestamptz), public.report_label(integer),
  public.create_report(uuid, integer, text, text, integer, text[], text, double precision, double precision, text),
  public.accept_report(bigint),
  public.reclassify_report(bigint, public.hazard_category, public.severity, text),
  public.assign_action(bigint, uuid, timestamptz),
  public.start_action(bigint),
  public.close_action(bigint, text, text),
  public.merge_duplicate(bigint),
  public.dismiss_duplicate(bigint),
  public.mark_notifications_read(bigint[]),
  public.complete_induction(integer),
  public.set_my_language(text),
  public.my_role(), public.is_ehs(), public.is_staff(), public.supervises(integer), public.can_see_report(bigint)
to authenticated;

-- Only the classify Edge Function (service role) may write AI output.
revoke execute on function public.apply_classification(bigint, jsonb) from authenticated;
grant execute on function public.apply_classification(bigint, jsonb) to service_role;

-- Internal helpers are not callable from the API.
revoke execute on function
  public._audit(bigint, uuid, text, jsonb, jsonb),
  public._notify(uuid, bigint, text, jsonb),
  public._sync_children(bigint, uuid),
  public._require_staff_for(bigint),
  public._sla(public.severity, text),
  public._report_body(bigint),
  public.evaluate_patterns(bigint)
from authenticated;
