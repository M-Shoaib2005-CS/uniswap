import { Redirect, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppBar } from '@/components/AppBar';
import { AppText } from '@/components/AppText';
import { Icon, IconName } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { ErrorState, Skeleton } from '@/components/States';
import { useAdminStats } from '@/features/admin/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { friendlyError } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

export default function AdminHome() {
  const { colors } = useTheme();
  const router = useRouter();
  const { profile } = useAuth();
  const q = useAdminStats();
  if (profile && !profile.is_admin) return <Redirect href="/(tabs)" />;

  const s = q.data;
  const tiles: { label: string; value: number | undefined; warn?: boolean }[] = [
    { label: 'Students', value: s?.users },
    { label: 'Active listings', value: s?.active_listings },
    { label: 'Completed swaps', value: s?.completed_swaps },
    { label: 'Campus posts', value: s?.posts },
    { label: 'Open reports', value: s?.open_reports, warn: (s?.open_reports ?? 0) > 0 },
    { label: 'Suspended', value: s?.suspended_users },
  ];

  return (
    <Screen scroll>
      <AppBar title="Admin" />
      {q.isError ? (
        <ErrorState message={friendlyError(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <View style={styles.grid}>
          {tiles.map((t) =>
            q.isLoading ? (
              <Skeleton key={t.label} style={styles.tile} />
            ) : (
              <View key={t.label} style={[styles.tile, { backgroundColor: t.warn ? colors.warnSoft : colors.fill }]}>
                <AppText variant="display" color={t.warn ? 'warn' : 'ink'}>
                  {t.value ?? 0}
                </AppText>
                <AppText variant="caption" color="muted">
                  {t.label}
                </AppText>
              </View>
            ),
          )}
        </View>
      )}
      <Row icon="flag" label="Reports queue" onPress={() => router.push('/admin/reports')} />
      <Row icon="users" label="Find and manage users" onPress={() => router.push('/admin/users')} />
    </Screen>
  );
}

function Row({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
      <Icon name={icon} size={20} color="muted" />
      <AppText style={{ flex: 1 }}>{label}</AppText>
      <Icon name="chevron-right" size={18} color="muted" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginVertical: 16 },
  tile: { width: '47.5%', borderRadius: radius.md, padding: 16, minHeight: 84 },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 14 },
});
