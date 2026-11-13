-- SafeSite · 0002 · Row Level Security (PRD §9, §12)
-- Clients may only SELECT. Every write goes through an audited RPC (0003).

alter table public.settings      enable row level security;
alter table public.users         enable row level security;
alter table public.areas         enable row level security;
alter table public.reports       enable row level security;
alter table public.actions       enable row level security;
alter table public.audit_logs    enable row level security;
alter table public.notifications enable row level security;

-- Explicit grants: read-only for signed-in users, nothing for anon.
revoke all on public.settings, public.users, public.areas, public.reports,
              public.actions, public.audit_logs, public.notifications from anon, authenticated;
grant select on public.settings, public.users, public.areas, public.reports,
                public.actions, public.audit_logs, public.notifications to authenticated;

-- settings / areas: everyone signed in can read
create policy settings_read on public.settings for select to authenticated using (true);
create policy areas_read    on public.areas    for select to authenticated using (true);

-- users: self; staff see everyone; workers also see staff (owner name on their report)
create policy users_read on public.users for select to authenticated using (
  id = auth.uid()
  or public.is_staff()
  or role in ('supervisor', 'ehs')
);

-- reports: reporter, area supervisor, EHS
create policy reports_read on public.reports for select to authenticated using (
  user_id = auth.uid()
  or public.is_ehs()
  or public.supervises(area_id)
);

-- actions / audit: follow the report
create policy actions_read on public.actions for select to authenticated using (
  public.can_see_report(report_id)
);

create policy audit_read on public.audit_logs for select to authenticated using (
  report_id is null and public.is_ehs()
  or report_id is not null and public.can_see_report(report_id)
);

-- notifications: own only
create policy notifications_read on public.notifications for select to authenticated using (
  user_id = auth.uid()
);

-- No INSERT / UPDATE / DELETE policies exist on any table, so with RLS enabled
-- every client write is rejected. audit_logs additionally has a trigger.
