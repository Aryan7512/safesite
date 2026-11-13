-- SafeSite · 0009 · offline reporting: a voice-only report is valid.
-- A report saved offline may reach the server with its voice clip but no text
-- (transcription failed or was impossible); it is stored and triaged manually.

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

  if coalesce(length(trim(p_transcript)), 0) = 0 and coalesce(array_length(p_photo_paths, 1), 0) = 0
     and p_audio_path is null then
    raise exception 'A report needs a description, a photo or a voice clip' using errcode = '22023';
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
