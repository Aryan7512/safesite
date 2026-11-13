import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { UserRow } from '@/domain/types';
import { isConfigured, supabase } from './supabase';

interface AuthCtx {
  session: Session | null;
  me: UserRow | null;
  loading: boolean;
  refreshMe: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  session: null,
  me: null,
  loading: true,
  refreshMe: async () => {},
  signIn: async () => null,
  signOut: async () => {},
});

async function loadProfile(uid: string): Promise<UserRow | null> {
  const { data } = await supabase.from('users').select('*').eq('id', uid).maybeSingle();
  return (data as UserRow) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<UserRow | null>(null);
  const [loading, setLoading] = useState(isConfigured);

  useEffect(() => {
    if (!isConfigured) return;
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      if (data.session) setMe(await loadProfile(data.session.user.id));
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) {
        setMe(null);
        qc.clear();
      } else {
        // Do not await inside the callback (supabase-js guidance); load after.
        setTimeout(() => loadProfile(s.user.id).then((p) => alive && setMe(p)), 0);
      }
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [qc]);

  const value: AuthCtx = {
    session,
    me,
    loading,
    refreshMe: async () => {
      if (session) setMe(await loadProfile(session.user.id));
    },
    signIn: async (email, password) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) return error.message;
      setSession(data.session);
      setMe(await loadProfile(data.user.id));
      return null;
    },
    signOut: async () => {
      await supabase.auth.signOut();
      setMe(null);
      qc.clear();
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
export const isStaff = (u: UserRow | null) => u?.role === 'supervisor' || u?.role === 'ehs';
