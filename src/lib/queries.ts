// TanStack Query hooks. All reads are plain SELECTs scoped by RLS; joins
// happen client-side (the data set is ~100 rows), which keeps the queries
// trivial and lets one Realtime channel simply invalidate them.

import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import type {
  ActionRow, AreaRow, AuditRow, Item, NotificationRow, ReportRow, SettingsRow, UserRow,
} from '@/domain/types';
import { DEFAULT_SETTINGS } from '@/domain/types';
import { useAuth } from './auth';
import { supabase } from './supabase';

export const qk = {
  areas: ['areas'] as const,
  settings: ['settings'] as const,
  users: ['users'] as const,
  reports: ['reports'] as const,
  actions: ['actions'] as const,
  audit: (id: number) => ['audit', id] as const,
  feed: ['feed'] as const,
  notifications: ['notifications'] as const,
  signed: (path: string) => ['signed', path] as const,
};

async function rows<T>(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await p;
  if (error) throw error;
  return (data ?? []) as T[];
}

export function useAreas() {
  const { session } = useAuth();
  return useQuery({
    queryKey: qk.areas,
    enabled: !!session,
    staleTime: 5 * 60_000,
    queryFn: () => rows<AreaRow>(supabase.from('areas').select('*').order('id')),
  });
}

export function useSettings() {
  const { session } = useAuth();
  const q = useQuery({
    queryKey: qk.settings,
    enabled: !!session,
    queryFn: async () => {
      const [s] = await rows<SettingsRow>(supabase.from('settings').select('*').limit(1));
      return { ...DEFAULT_SETTINGS, ...s, confidence_threshold: Number(s?.confidence_threshold ?? 0.6) } as SettingsRow;
    },
  });
  return q.data ?? DEFAULT_SETTINGS;
}

export function useUsers() {
  const { session } = useAuth();
  return useQuery({
    queryKey: qk.users,
    enabled: !!session,
    staleTime: 60_000,
    queryFn: () => rows<UserRow>(supabase.from('users').select('*').order('name')),
  });
}

/** Reports joined with their action: the unit every screen works with. */
export function useItems() {
  const { session } = useAuth();
  const reports = useQuery({
    queryKey: qk.reports,
    enabled: !!session,
    queryFn: () =>
      rows<ReportRow>(supabase.from('reports').select('*').order('created_at', { ascending: false }).limit(1000)),
  });
  const actions = useQuery({
    queryKey: qk.actions,
    enabled: !!session,
    queryFn: () => rows<ActionRow>(supabase.from('actions').select('*').limit(1000)),
  });
  const items = useMemo<Item[]>(() => {
    if (!reports.data || !actions.data) return [];
    const byReport = new Map(actions.data.map((a) => [Number(a.report_id), a]));
    return reports.data
      .map((r) => {
        const report = { ...r, id: Number(r.id), ai_confidence: r.ai_confidence == null ? null : Number(r.ai_confidence) };
        const action = byReport.get(report.id);
        return action ? { report, action: { ...action, report_id: Number(action.report_id) } } : null;
      })
      .filter((x): x is Item => x !== null);
  }, [reports.data, actions.data]);
  return {
    items,
    isLoading: reports.isLoading || actions.isLoading,
    error: reports.error ?? actions.error,
    refetch: () => Promise.all([reports.refetch(), actions.refetch()]),
  };
}

export function useAudit(reportId: number | null) {
  return useQuery({
    queryKey: qk.audit(reportId ?? 0),
    enabled: reportId != null,
    queryFn: () =>
      rows<AuditRow>(supabase.from('audit_logs').select('*').eq('report_id', reportId!).order('ts').order('id')),
  });
}

/** Latest events for the live feed. */
export function useFeed() {
  const { session } = useAuth();
  return useQuery({
    queryKey: qk.feed,
    enabled: !!session,
    queryFn: () =>
      rows<AuditRow>(
        supabase
          .from('audit_logs')
          .select('*')
          .in('action_type', ['created', 'ai_classified', 'escalated', 'sla_breached', 'assigned', 'closed', 'demo_clock', 'demo_reset'])
          .order('id', { ascending: false })
          .limit(40),
      ),
  });
}

export function useNotifications() {
  const { session } = useAuth();
  return useQuery({
    queryKey: qk.notifications,
    enabled: !!session,
    queryFn: () =>
      rows<NotificationRow>(
        supabase.from('notifications').select('*').eq('user_id', session!.user.id).order('id', { ascending: false }).limit(50),
      ),
  });
}

/** Private media → short-lived signed URL (PRD §12). */
export function useSignedUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: qk.signed(path ?? ''),
    enabled: !!path,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('report-media').createSignedUrl(path!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

/** Plant clock = real time + demo offset (PRD §7 Demo clock). Ticks every `ms`. */
export function useNow(ms = 1000): Date {
  const settings = useSettings();
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return new Date(tick + settings.demo_offset_minutes * 60_000);
}

export function useUserName() {
  const { data: users } = useUsers();
  return useMemo(() => {
    const m = new Map((users ?? []).map((u) => [u.id, u]));
    return (id: string | null | undefined) => (id ? m.get(id)?.name ?? 'Unknown' : '—');
  }, [users]);
}
