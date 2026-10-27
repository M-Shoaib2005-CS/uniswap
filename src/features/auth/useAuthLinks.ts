import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthProvider';
import { parseAuthUrl } from '@/lib/validation';

/** Handles the verification / password-reset links that open the app. */
export function useAuthLinks() {
  const router = useRouter();
  const { beginRecovery } = useAuth();

  useEffect(() => {
    let cancelled = false;

    const handle = async (url: string | null) => {
      if (!url || cancelled) return;
      const p = parseAuthUrl(url);
      if (!p.accessToken && !p.code && !p.error) return;
      if (p.error) {
        Alert.alert('Link problem', p.error);
        return;
      }
      try {
        // set this first so the app does not bounce the user to Home before the reset screen
        if (p.type === 'recovery') beginRecovery();
        if (p.accessToken && p.refreshToken) {
          const { error } = await supabase.auth.setSession({ access_token: p.accessToken, refresh_token: p.refreshToken });
          if (error) throw error;
        } else if (p.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(p.code);
          if (error) throw error;
        }
        if (p.type === 'recovery') router.replace('/(auth)/reset-password');
      } catch (e) {
        Alert.alert('Link expired', 'This link is no longer valid. Request a new one and try again.');
      }
    };

    Linking.getInitialURL().then(handle).catch(() => undefined);
    const sub = Linking.addEventListener('url', (ev) => {
      handle(ev.url);
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [router, beginRecovery]);
}
