-- SafeSite · 0005 · private media storage + realtime (PRD §10, §12)

-- Private bucket. Paths:
--   {user_id}/{client_id}/photo-1.jpg | voice.m4a   (worker capture)
--   fix/{report_id}/fix-….jpg                        (supervisor closure photo)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-media', 'report-media', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'audio/m4a', 'audio/mp4', 'audio/x-m4a',
              'audio/mpeg', 'audio/webm', 'audio/wav', 'audio/aac'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public._fix_report_id(p_name text)
returns bigint
language sql immutable
as $$
  select case when (storage.foldername(p_name))[1] = 'fix'
               and (storage.foldername(p_name))[2] ~ '^\d+$'
              then ((storage.foldername(p_name))[2])::bigint end;
$$;
revoke execute on function public._fix_report_id(text) from public, anon;
grant execute on function public._fix_report_id(text) to authenticated;

-- Upload: only into your own folder, or a fix photo for a report you manage.
create policy media_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'report-media' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or (public.is_staff() and public._fix_report_id(name) is not null
        and public.can_see_report(public._fix_report_id(name)))
  )
);

-- Read: your own uploads, media of any report you are allowed to see.
-- Storage access therefore inherits report RLS.
create policy media_read on storage.objects for select to authenticated using (
  bucket_id = 'report-media' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1 from public.reports r
      where r.client_id::text = (storage.foldername(name))[2]
        and public.can_see_report(r.id)
    )
    or (public._fix_report_id(name) is not null and public.can_see_report(public._fix_report_id(name)))
  )
);

-- Realtime: the dashboard and the reporter's phone move without a refresh.
-- postgres_changes respects the RLS policies above for each subscriber.
alter publication supabase_realtime add table
  public.reports, public.actions, public.notifications, public.audit_logs, public.settings;
