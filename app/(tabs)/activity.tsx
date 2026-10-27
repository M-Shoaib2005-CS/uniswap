import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Badge, Segmented } from '@/components/Chip';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, Skeleton } from '@/components/States';
import { useAuth } from '@/features/auth/AuthProvider';
import { coverOf, TxnRow, useMyTransactions } from '@/features/transactions/api';
import { activityBucket, roleOf, statusLabel } from '@/features/transactions/rules';
import { formatMoney, timeAgo } from '@/lib/format';
import { publicImageUrl } from '@/lib/supabase';
import { friendlyError } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

type Tab = 'requests' | 'active' | 'history';

export default function ActivityScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const me = session?.user.id ?? null;
  const q = useMyTransactions(me);
  const [tab, setTab] = useState<Tab>('requests');

  const rows = useMemo(() => (q.data ?? []).filter((t) => activityBucket(t.status) === tab), [q.data, tab]);
  const counts = useMemo(() => {
    const c = { requests: 0, active: 0, history: 0 };
    (q.data ?? []).forEach((t) => (c[activityBucket(t.status)] += 1));
    return c;
  }, [q.data]);

  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: 20 }}>
        <AppText variant="display" style={{ marginTop: 8, marginBottom: 12 }}>
          Activity
        </AppText>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { key: 'requests', label: `Requests${counts.requests ? ` (${counts.requests})` : ''}` },
            { key: 'active', label: `Active${counts.active ? ` (${counts.active})` : ''}` },
            { key: 'history', label: 'History' },
          ]}
        />
      </View>
      {q.isLoading ? (
        <View style={{ padding: 20, gap: 12 }}>
          <Skeleton style={{ height: 84 }} />
          <Skeleton style={{ height: 84 }} />
        </View>
      ) : q.isError ? (
        <ErrorState message={friendlyError(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ padding: 20, gap: 12, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.primary} />}
          ListEmptyComponent={
            <EmptyState
              icon="clipboard"
              title={tab === 'requests' ? 'No pending requests' : tab === 'active' ? 'Nothing active right now' : 'No history yet'}
              message="Requests you send and receive show up here."
            />
          }
          renderItem={({ item: t }) => <TxnCard t={t} me={me} onPress={() => router.push({ pathname: '/txn/[id]', params: { id: t.id } })} />}
        />
      )}
    </Screen>
  );
}

function TxnCard({ t, me, onPress }: { t: TxnRow; me: string | null; onPress: () => void }) {
  const { colors } = useTheme();
  const role = me ? roleOf(t, me) : null;
  const other = role === 'owner' ? t.requester : t.owner;
  const st = statusLabel(t.status, t.kind);
  const cover = publicImageUrl('item-images', coverOf(t));
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.card, { borderColor: colors.border, backgroundColor: colors.bg }]}
    >
      <View style={[styles.thumb, { backgroundColor: colors.fill }]}>
        {cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="smallStrong" numberOfLines={1}>
          {t.item?.title ?? 'Listing'}
        </AppText>
        <AppText variant="caption" color="muted" numberOfLines={1}>
          {role === 'owner' ? 'Request from' : 'Owner'} {other?.display_name ?? 'someone'} · {t.kind === 'rent' ? 'Rent' : 'Buy'} · {formatMoney(t.price)}
        </AppText>
        <View style={styles.meta}>
          <Badge label={st.label} tone={st.tone} />
          <AppText variant="caption" color="muted">
            {timeAgo(t.updated_at)}
          </AppText>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: 12, padding: 12, borderWidth: 1, borderRadius: radius.lg, alignItems: 'center' },
  thumb: { width: 64, height: 64, borderRadius: radius.md, overflow: 'hidden' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
});
