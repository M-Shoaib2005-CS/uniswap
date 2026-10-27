import { Inter_400Regular, Inter_600SemiBold, useFonts } from '@expo-google-fonts/inter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { useAuthLinks } from '@/features/auth/useAuthLinks';
import { usePush } from '@/features/push/usePush';
import { useRealtimeSync } from '@/features/realtime/useRealtimeSync';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function Gate() {
  const { colors, scheme } = useTheme();
  const { session, profile, loading, recovering } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  useAuthLinks();
  useRealtimeSync(session?.user.id ?? null);
  usePush(session?.user.id ?? null);

  useEffect(() => {
    if (loading) return;
    const group = segments[0];
    const inAuth = group === '(auth)';
    const onReset = inAuth && (segments as string[])[1] === 'reset-password';

    if (!session) {
      if (!inAuth) router.replace('/(auth)/login');
      return;
    }
    if (recovering) {
      if (!onReset) router.replace('/(auth)/reset-password');
      return;
    }
    if (profile?.is_suspended) {
      if (group !== 'suspended') router.replace('/suspended');
      return;
    }
    if (inAuth) router.replace('/(tabs)');
  }, [loading, session, profile?.is_suspended, recovering, segments, router]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }}>
        <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="request/[id]" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="search" options={{ animation: 'fade' }} />
        <Stack.Screen name="auth-callback" options={{ animation: 'fade' }} />
        <Stack.Screen name="sell" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="txn/[id]" />
        <Stack.Screen name="post/new" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="post/[id]" />
        <Stack.Screen name="user/[id]" />
        <Stack.Screen name="my-listings" />
        <Stack.Screen name="saved" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="blocked" />
        <Stack.Screen name="admin/index" />
        <Stack.Screen name="admin/reports" />
        <Stack.Screen name="admin/users" />
        <Stack.Screen name="chat/[id]" />
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_600SemiBold });
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false } } }),
  );

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => undefined);
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <ThemeProvider>
          <AuthProvider>
            <Gate />
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
