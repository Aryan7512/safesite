-- SafeSite · 0004 · SLA check, escalation, demo clock (PRD §7)

-- Evaluates every open action against app_now():
--   past escalate_at → escalated_level 1, audit, notify EHS (Low = reminder only)
--   past due_at      → breached_at, audit, notify owner + EHS
-- Ownership never changes automatically. Idempotent: safe to run every minute.
create or replace function public.check_sla()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_now timestamptz := public.app_now();
  v_escalated integer := 0;
  v_breached integer := 0;
  x record;
  e record;
begin
  -- Called by pg_cron (no user) or by staff via the Fast-forward button.
  if auth.uid() is not null and not public.is_staff() then
    raise exception 'Only staff can run the SLA check' using errcode = '42501';
  end if;

  for x in
    select a.report_id, a.owner_id, a.escalate_at, a.due_at, r.severity
    from public.actions a join public.reports r on r.id = a.report_id
    where a.status <> 'Closed' and a.merged_into is null
      and a.escalated_level = 0 and a.escalate_at <= v_now
    for update of a
  loop
    update public.actions set escalated_level = 1, escalated_at = v_now, updated_at = now()
    where report_id = x.report_id;
    perform public._audit(x.report_id, null, 'escalated',
      jsonb_build_object('escalated_level', 0),
      jsonb_build_object('escalated_level', 1, 'to', 'EHS Lead',
                         'reason', 'Open past ' || public._sla(x.severity, 'escalate_h') || ' h',
                         'severity', coalesce(x.severity::text, 'Unclassified')));
    for e in select id from public.users where role = 'ehs' loop
      perform public._notify(e.id, x.report_id,
        case when x.severity = 'Low' then 'reminder' else 'escalation' end,
        public._report_body(x.report_id) || jsonb_build_object('escalate_h', public._sla(x.severity, 'escalate_h')));
    end loop;
    v_escalated := v_escalated + 1;
  end loop;

  for x in
    select a.report_id, a.owner_id, a.due_at
    from public.actions a
    where a.status <> 'Closed' and a.merged_into is null
      and a.breached_at is null and a.due_at <= v_now
    for update of a
  loop
    update public.actions set breached_at = v_now, updated_at = now() where report_id = x.report_id;
    perform public._audit(x.report_id, null, 'sla_breached', null,
      jsonb_build_object('due_at', x.due_at));
    perform public._notify(x.owner_id, x.report_id, 'sla_breach', public._report_body(x.report_id));
    for e in select id from public.users where role = 'ehs' and id is distinct from x.owner_id loop
      perform public._notify(e.id, x.report_id, 'sla_breach', public._report_body(x.report_id));
    end loop;
    v_breached := v_breached + 1;
  end loop;

  return jsonb_build_object('escalated', v_escalated, 'breached', v_breached, 'checked_at', v_now);
end;
$$;

-- Admin demo tool: move the plant clock forward and evaluate SLAs immediately.
create or replace function public.demo_fast_forward(p_minutes integer default 180)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_old integer;
  v_result jsonb;
begin
  if not public.is_ehs() then raise exception 'EHS Lead only' using errcode = '42501'; end if;
  if p_minutes not between 1 and 10080 then raise exception 'Between 1 minute and 7 days' using errcode = '22023'; end if;

  select demo_offset_minutes into v_old from public.settings where id for update;
  update public.settings set demo_offset_minutes = v_old + p_minutes, updated_at = now() where id;

  perform public._audit(null, auth.uid(), 'demo_clock',
    jsonb_build_object('demo_offset_minutes', v_old),
    jsonb_build_object('demo_offset_minutes', v_old + p_minutes));

  v_result := public.check_sla();
  return v_result || jsonb_build_object('demo_offset_minutes', v_old + p_minutes);
end;
$$;

revoke execute on function public.check_sla(), public.demo_fast_forward(integer) from public, anon;
grant execute on function public.check_sla(), public.demo_fast_forward(integer) to authenticated;

-- ─── Schedule: every minute ─────────────────────────────────────────────────
create extension if not exists pg_cron;
grant usage on schema cron to postgres;

select cron.schedule('safesite-check-sla', '* * * * *', $$select public.check_sla();$$);
