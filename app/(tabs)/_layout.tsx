import { Tabs, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/features/auth/AuthProvider';
import { useUnreadCount } from '@/features/chat/api';
import { AppText } from '@/components/AppText';
import { Icon, IconName } from '@/components/Icon';
import { useTheme } from '@/theme/ThemeProvider';
import { TAP } from '@/theme/tokens';

const TAB_META: Record<string, { label: string; icon: IconName }> = {
  index: { label: 'Home', icon: 'home' },
  activity: { label: 'Activity', icon: 'clipboard' },
  chat: { label: 'Chat', icon: 'message-circle' },
  profile: { label: 'Profile', icon: 'user' },
};

type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

function TabBar({ state, emitter, navigateToTab }: TabBarProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const unread = useUnreadCount(session?.user.id ?? null);

  const items = state.routes.map((route, index) => ({ route, index }));
  const left = items.slice(0, 2);
  const right = items.slice(2);

  const renderTab = ({ route, index }: { route: (typeof state.routes)[number]; index: number }) => {
    const meta = TAB_META[route.name];
    if (!meta) return null;
    const focused = state.index === index;
    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityLabel={meta.label}
        accessibilityState={{ selected: focused }}
        onPress={() => {
          const ev = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !ev.defaultPrevented) navigateToTab(route.key);
        }}
        style={styles.tab}
      >
        <View>
          <Icon name={meta.icon} size={22} color={focused ? 'primaryText' : 'muted'} />
          {route.name === 'chat' && unread > 0 ? (
            <View style={[styles.badge, { backgroundColor: colors.danger }]}>
              <AppText variant="caption" color="onPrimary" style={{ fontSize: 10, lineHeight: 12 }}>
                {unread > 9 ? '9+' : unread}
              </AppText>
            </View>
          ) : null}
        </View>
        <AppText variant="caption" color={focused ? 'primaryText' : 'muted'} style={{ marginTop: 2 }}>
          {meta.label}
        </AppText>
      </Pressable>
    );
  };

  return (
    <View style={[styles.bar, { backgroundColor: colors.bg, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 8) }]}>
      {left.map(renderTab)}
      <View style={styles.centerWrap}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sell or rent out an item"
          onPress={() => router.push('/sell')}
          style={[styles.plus, { backgroundColor: colors.primary }]}
        >
          <Icon name="plus" size={24} color="onPrimary" />
        </Pressable>
      </View>
      {right.map(renderTab)}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="activity" />
      <Tabs.Screen name="chat" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  badge: { position: 'absolute', top: -4, right: -10, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center' },
  bar: { flexDirection: 'row', alignItems: 'center', paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, minHeight: TAP + 8, alignItems: 'center', justifyContent: 'center' },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  plus: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
});
