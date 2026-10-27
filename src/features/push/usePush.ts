import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

// Remote push does not work inside Expo Go (SDK 53+); it works in the installed APK / dev build.
// Loading expo-notifications lazily keeps Expo Go free of its warning.
const IN_EXPO_GO = Constants.executionEnvironment === 'storeClient';

type Notifications = typeof import('expo-notifications');

function load(): Notifications | null {
  if (IN_EXPO_GO) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-notifications') as Notifications;
  } catch {
    return null;
  }
}

async function registerToken(N: Notifications): Promise<void> {
  const existing = await N.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') status = (await N.requestPermissionsAsync()).status;
  if (status !== 'granted') return;

  const { Platform } = await import('react-native');
  if (Platform.OS === 'android') {
    await N.setNotificationChannelAsync('default', { name: 'UniSwap', importance: N.AndroidImportance.DEFAULT });
  }
  const projectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return; // push needs an EAS project; see README
  const token = (await N.getExpoPushTokenAsync({ projectId })).data;
  await supabase.rpc('register_device_token', { p_token: token, p_platform: Platform.OS });
}

/** Registers this phone for push and opens the right screen when a notification is tapped. */
export function usePush(userId: string | null) {
  const router = useRouter();

  useEffect(() => {
    const N = load();
    if (!N || !userId) return;
    N.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
    });
    registerToken(N).catch(() => undefined); // push is best-effort; the in-app list still works
    const sub = N.addNotificationResponseReceivedListener((resp) => {
      const data = resp.notification.request.content.data as { txn_id?: string; conversation_id?: string } | undefined;
      if (data?.txn_id) router.push({ pathname: '/txn/[id]', params: { id: data.txn_id } });
      else if (data?.conversation_id) router.push({ pathname: '/chat/[id]', params: { id: data.conversation_id } });
      else router.push('/notifications');
    });
    return () => sub.remove();
  }, [userId, router]);
}
