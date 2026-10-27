import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/features/auth/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Landing screen for uniswap://auth-callback links (email verification and password reset).
 * useAuthLinks reads the tokens from the link; this screen only shows progress and then moves on.
 */
export default function AuthCallback() {
  const { colors } = useTheme();
  const router = useRouter();
  const { session, recovering, loading } = useAuth();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (session && !recovering) router.replace('/(tabs)');
  }, [session, recovering, router]);

  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, []);

  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        {slow && !session && !loading ? (
          <>
            <AppText variant="title" center>
              This link didn't work
            </AppText>
            <AppText color="muted" center>
              It may have expired or already been used. Log in, or request a new link.
            </AppText>
            <Button label="Go to login" onPress={() => router.replace('/(auth)/login')} />
          </>
        ) : (
          <>
            <ActivityIndicator color={colors.primary} size="large" />
            <AppText color="muted">Signing you in…</AppText>
          </>
        )}
      </View>
    </Screen>
  );
}
