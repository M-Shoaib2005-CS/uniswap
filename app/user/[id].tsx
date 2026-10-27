import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { AppBar, IconButton } from '@/components/AppBar';
import { AppText } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { ListingRow } from '@/components/ListingCards';
import { ReportSheet } from '@/components/ReportSheet';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState } from '@/components/States';
import { useAuth } from '@/features/auth/AuthProvider';
import { useSearchItems } from '@/features/listings/api';
import { useUserProfile, useUserReviews } from '@/features/profile/api';
import { Button } from '@/components/Button';
import { useBlockedUsers, useUnblock } from '@/features/safety/api';
import { useSafetyMenu } from '@/features/safety/useSafetyMenu';
import { timeAgo } from '@/lib/format';
import { friendlyError } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import type { SearchItem } from '@/types/models';

export default function UserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const me = session?.user.id ?? null;
  const u = useUserProfile(id);
  const reviews = useUserReviews(id);
  const filters = useMemo(() => ({ query: '', mode: 'all' as const, categoryId: null, zoneId: null, sort: 'newest' as const, ownerId: id ?? null }), [id]);
  const items = useSearchItems(filters, !!id);
  const safety = useSafetyMenu(me);
  const blockedList = useBlockedUsers(me);
  const unblock = useUnblock(me);
  const iBlockedThem = (blockedList.data ?? []).some((b) => b.blocked_id === id);
  const list = (items.data?.pages.flat() ?? []) as SearchItem[];

  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  if (u.isError) {
    return (
      <Screen>
        <AppBar title="Profile" />
        <ErrorState message={friendlyError(u.error)} onRetry={() => u.refetch()} />
      </Screen>
    );
  }
  if (u.isLoading) {
    return (
      <Screen>
        <AppBar title="Profile" />
        <ActivityIndicator color={colors.primary} style={{ margin: 32 }} />
      </Screen>
    );
  }
  const p = u.data;
  if (!p) {
    return (
      <Screen>
        <AppBar title="Profile" />
        <EmptyState icon="user-x" title="Profile not available" actionLabel="Go back" onAction={back} />
      </Screen>
    );
  }
  const mine = p.id === me;

  return (
    <Screen padded={false}>
      <AppBar
        title={p.display_name}
        right={
          mine ? undefined : (
            <IconButton
              name="more-horizontal"
              label="More options"
              onPress={() =>
                safety.open({ reportType: 'user', reportId: p.id, label: 'user', userId: p.id, userName: p.display_name, onBlocked: back })
              }
            />
          )
        }
      />
      <FlatList
        data={list}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
        ListHeaderComponent={
          <View>
            <View style={styles.head}>
              <Avatar name={p.display_name} path={p.avatar_path} size={72} />
              <View style={{ flex: 1, gap: 4 }}>
                <AppText variant="title">{p.display_name}</AppText>
                {p.department ? (
                  <AppText variant="small" color="muted">
                    {p.department}
                  </AppText>
                ) : null}
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Badge label="Verified student" tone="success" />
                  {p.founding_member ? <Badge label="Founding member" tone="primary" /> : null}
                </View>
              </View>
            </View>
            {iBlockedThem ? (
              <View style={[styles.blockedBar, { backgroundColor: colors.warnSoft }]}>
                <AppText variant="small" color="warn" style={{ flex: 1 }}>
                  You blocked this person.
                </AppText>
                <Button compact variant="secondary" label="Unblock" loading={unblock.isPending} onPress={() => unblock.mutate(p.id)} />
              </View>
            ) : null}
            <View style={[styles.stats, { backgroundColor: colors.fill }]}>
              <Stat value={p.trust_score != null ? p.trust_score.toFixed(1) : '–'} label="Trust score" />
              <Stat value={String(p.swaps_count)} label="Swaps" />
              <Stat value={String(p.ratings_count)} label="Reviews" />
            </View>

            <AppText variant="heading" style={{ marginTop: 24, marginBottom: 4 }}>
              Reviews
            </AppText>
            {reviews.isLoading ? <ActivityIndicator color={colors.primary} style={{ margin: 12 }} /> : null}
            {(reviews.data ?? []).length === 0 && !reviews.isLoading ? (
              <AppText variant="small" color="muted">
                No reviews yet.
              </AppText>
            ) : null}
            {(reviews.data ?? []).map((r) => (
              <View key={r.id} style={[styles.review, { borderBottomColor: colors.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Icon name="star" size={14} color="warn" />
                  <AppText variant="smallStrong">{r.rating}</AppText>
                  <AppText variant="caption" color="muted">
                    {r.reviewer?.display_name ?? 'Student'} · {timeAgo(r.created_at)}
                  </AppText>
                </View>
                {r.comment ? <AppText variant="small">{r.comment}</AppText> : null}
              </View>
            ))}

            <AppText variant="heading" style={{ marginTop: 24, marginBottom: 4 }}>
              Listings
            </AppText>
            {!items.isLoading && list.length === 0 ? (
              <AppText variant="small" color="muted">
                No active listings.
              </AppText>
            ) : null}
          </View>
        }
        onEndReached={() => items.hasNextPage && !items.isFetchingNextPage && items.fetchNextPage()}
        renderItem={({ item }) => <ListingRow item={item} prefer="all" onPress={() => router.push({ pathname: '/listing/[id]', params: { id: item.id } })} />}
      />
      <ReportSheet target={safety.target} onClose={safety.close} />
    </Screen>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', paddingVertical: 12 }}>
      <AppText variant="title">{value}</AppText>
      <AppText variant="caption" color="muted">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  blockedBar: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, marginTop: 16 },
  head: { flexDirection: 'row', gap: 16, alignItems: 'center', marginTop: 8 },
  stats: { flexDirection: 'row', borderRadius: radius.md, marginTop: 20 },
  review: { paddingVertical: 10, gap: 2, borderBottomWidth: StyleSheet.hairlineWidth },
});
