import { Session } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/types/models';

interface AuthValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  recovering: boolean; // true while the user arrived through a password-reset link
  refreshProfile: () => Promise<void>;
  updateProfile: (patch: Partial<Pick<Profile, 'display_name' | 'department' | 'default_zone_id' | 'avatar_path'>>) => Promise<void>;
  signOut: () => Promise<void>;
  beginRecovery: () => void;
  clearRecovery: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return (data as Profile | null) ?? null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    let alive = true;

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!alive) return;
        setSession(data.session);
        if (data.session) {
          try {
            const p = await loadProfile(data.session.user.id);
            if (alive) setProfile(p);
          } catch {
            // profile will be retried on the next auth event / refresh
          }
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      // Never await Supabase calls inside this callback (it can deadlock the client); defer instead.
      setSession(next);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (!next) {
        setProfile(null);
        return;
      }
      setTimeout(() => {
        loadProfile(next.user.id)
          .then((p) => alive && setProfile(p))
          .catch(() => undefined);
      }, 0);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!session) return;
    setProfile(await loadProfile(session.user.id));
  }, [session]);

  const updateProfile = useCallback<AuthValue['updateProfile']>(
    async (patch) => {
      if (!session) return;
      const { error } = await supabase.from('profiles').update(patch).eq('id', session.user.id);
      if (error) throw error;
      setProfile(await loadProfile(session.user.id));
    },
    [session],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const beginRecovery = useCallback(() => setRecovering(true), []);
  const clearRecovery = useCallback(() => setRecovering(false), []);

  const value = useMemo(
    () => ({ session, profile, loading, recovering, refreshProfile, updateProfile, signOut, beginRecovery, clearRecovery }),
    [session, profile, loading, recovering, refreshProfile, updateProfile, signOut, beginRecovery, clearRecovery],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
