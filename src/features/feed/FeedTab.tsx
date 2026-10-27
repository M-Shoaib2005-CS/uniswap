import { useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { PostCard } from '@/components/PostCard';
import { ReportSheet } from '@/components/ReportSheet';
import { EmptyState, ErrorState, Skeleton } from '@/components/States';
import { useAuth } from '@/features/auth/AuthProvider';
import { useSafetyMenu } from '@/features/safety/useSafetyMenu';
import { friendlyError } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, TAP } from '@/theme/tokens';
import { likedByMe, postImages, useDeletePost, useFeed, useToggleLike } from './api';

export function FeedTab() {
  const { colors } = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const me = session?.user.id ?? null;
  const q = useFeed(me);
  const like = useToggleLike(me);
  const del = useDeletePost();
  const safety = useSafetyMenu(me);
  const posts = q.data?.pages.flat() ?? [];

  const header = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Write a post"
      onPress={() => router.push('/post/new')}
      style={[styles.compose, { backgroundColor: colors.fill }]}
    >
      <Icon name="edit-3" size={18} color="muted" />
      <AppText color="muted">Share something with campus…</AppText>
    </Pressable>
  );

  if (q.isLoading) {
    return (
      <View style={{ padding: 20, gap: 16 }}>
        <Skeleton style={{ height: 48 }} />
        <Skeleton style={{ height: 180 }} />
        <Skeleton style={{ height: 120 }} />
      </View>
    );
  }
  if (q.isError) return <ErrorState message={friendlyError(q.error)} onRetry={() => q.refetch()} />;

  return (
    <>
      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={() => void q.refetch()} tintColor={colors.primary} />}
        onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={header}
        ListEmptyComponent={<EmptyState icon="users" title="No posts yet" message="Be the first to post something for your campus." />}
        ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator color={colors.primary} style={{ margin: 16 }} /> : undefined}
        renderItem={({ item: p }) => (
          <PostCard
            post={p}
            onOpen={() => router.push({ pathname: '/post/[id]', params: { id: p.id } })}
            onLike={() => like.mutate({ postId: p.id, liked: likedByMe(p) })}
            onAuthor={() => router.push({ pathname: '/user/[id]', params: { id: p.author_id } })}
            onMenu={() =>
              safety.open({
                reportType: 'post',
                reportId: p.id,
                label: 'post',
                userId: p.author_id,
                userName: p.author?.display_name ?? 'this user',
                isMine: p.author_id === me,
                onDelete: () => del.mutate({ id: p.id, paths: postImages(p) }, { onError: (e) => Alert.alert('Could not delete', friendlyError(e)) }),
              })
            }
          />
        )}
      />
      <ReportSheet target={safety.target} onClose={safety.close} />
    </>
  );
}

const styles = StyleSheet.create({
  compose: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: TAP + 4, borderRadius: radius.md, paddingHorizontal: 14, marginTop: 12 },
});
