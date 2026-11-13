// One Realtime channel per signed-in user. postgres_changes respects RLS, so
// each subscriber only hears about rows it may read. Any change simply
// invalidates the matching queries; the screens recompute from fresh rows.

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import type { NotificationRow } from '@/domain/types';
import { useAuth } from './auth';
import { qk } from './queries';
import { supabase } from './supabase';

type Listener = (n: NotificationRow) => void;
const listeners = new Set<Listener>();
/** Subscribe to this user's new notifications (toasts, bell pulse). */
export function onNotification(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

type Status = 'connecting' | 'live' | 'offline';
const statusListeners = new Set<(s: Status) => void>();
let currentStatus: Status = 'connecting';
export function onRealtimeStatus(fn: (s: Status) => void) {
  statusListeners.add(fn);
  fn(currentStatus);
  return () => {
    statusListeners.delete(fn);
  };
}
function setStatus(s: Status) {
  currentStatus = s;
  statusListeners.forEach((f) => f(s));
}

export function RealtimeBridge() {
  const qc = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user.id;
  const pending = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!uid) return;

    // Coalesce bursts (one report = several row changes) into one refetch.
    const invalidate = (...keys: (readonly unknown[])[]) => {
      keys.forEach((k) => pending.current.add(JSON.stringify(k)));
      if (timer.current) return;
      timer.current = setTimeout(() => {
        const ks = [...pending.current];
        pending.current.clear();
        timer.current = null;
        ks.forEach((k) => qc.invalidateQueries({ queryKey: JSON.parse(k) }));
      }, 150);
    };

    // Realtime needs the user's JWT to evaluate RLS.
    if (session?.access_token) supabase.realtime.setAuth(session.access_token);

    const channel = supabase
      .channel(`safesite:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, () => invalidate(qk.reports))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'actions' }, () => invalidate(qk.actions))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_logs' }, (payload) => {
        const rid = (payload.new as { report_id?: number }).report_id;
        invalidate(qk.feed, ...(rid ? [qk.audit(Number(rid))] : []));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, () => invalidate(qk.settings))
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` },
        (payload) => {
          invalidate(qk.notifications);
          listeners.forEach((fn) => fn(payload.new as NotificationRow));
        },
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, () =>
        invalidate(qk.notifications),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setStatus('live');
          // Catch up on anything missed while disconnected.
          invalidate(qk.reports, qk.actions, qk.feed, qk.notifications, qk.settings);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setStatus('offline');
        }
      });

    return () => {
      supabase.removeChannel(channel);
      setStatus('connecting');
    };
  }, [uid, session?.access_token, qc]);

  return null;
}
