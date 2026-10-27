import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppBar } from '@/components/AppBar';
import { AppText } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { PostCard } from '@/components/PostCard';
import { ReportSheet } from '@/components/ReportSheet';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState } from '@/components/States';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  Comment,
  likedByMe,
  postImages,
  useAddComment,
  useComments,
  useDeleteComment,
  useDeletePost,
  usePost,
  useToggleLike,
} from '@/features/feed/api';
import { useSafetyMenu } from '@/features/safety/useSafetyMenu';
import { timeAgo } from '@/lib/format';
import { useKeyboardVisible } from '@/lib/useKeyboardVisible';
import { friendlyError } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';
import { FONT, TAP } from '@/theme/tokens';

export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const kbOpen = useKeyboardVisible();
  const { session, profile } = useAuth();
  const me = session?.user.id ?? null;
  const post = usePost(id, me);
  const comments = useComments(id);
  const add = useAddComment(id, me);
  const delComment = useDeleteComment(id);
  const delPost = useDeletePost();
  const like = useToggleLike(me);
  const safety = useSafetyMenu(me);
  const [text, setText] = useState('');

  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  if (post.isError) {
    return (
      <Screen>
        <AppBar title="Post" />
        <ErrorState message={friendlyError(post.error)} onRetry={() => post.refetch()} />
      </Screen>
    );
  }
  if (!post.isLoading && !post.data) {
    return (
      <Screen>
        <AppBar title="Post" />
        <EmptyState icon="archive" title="Post not available" message="It may have been deleted." actionLabel="Go back" onAction={back} />
      </Screen>
    );
  }
  const p = post.data;

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    add.mutate(body, { onSuccess: () => setText(''), onError: (e) => Alert.alert('Could not comment', friendlyError(e)) });
  };

  const commentMenu = (c: Comment) =>
    safety.open({
      reportType: 'comment',
      reportId: c.id,
      label: 'comment',
      userId: c.author_id,
      userName: c.author?.display_name ?? 'this user',
      isMine: c.author_id === me,
      onDelete: () => delComment.mutate(c.id, { onError: (e) => Alert.alert('Could not delete', friendlyError(e)) }),
    });

  return (
    <Screen padded={false} edges={{ bottom: false }}>
      <AppBar title="Post" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {!p ? (
          <ActivityIndicator color={colors.primary} style={{ margin: 24 }} />
        ) : (
          <FlatList
            data={comments.data ?? []}
            keyExtractor={(c) => c.id}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <View>
                <PostCard
                  full
                  post={p}
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
                      onDelete: () => delPost.mutate({ id: p.id, paths: postImages(p) }, { onSuccess: back, onError: (e) => Alert.alert('Could not delete', friendlyError(e)) }),
                      onBlocked: back,
                    })
                  }
                />
                <AppText variant="heading" style={{ marginTop: 16, marginBottom: 4 }}>
                  Comments
                </AppText>
                {comments.isLoading ? <ActivityIndicator color={colors.primary} style={{ margin: 16 }} /> : null}
                {comments.isError ? <ErrorState message={friendlyError(comments.error)} onRetry={() => comments.refetch()} /> : null}
              </View>
            }
            ListEmptyComponent={comments.isLoading || comments.isError ? undefined : <AppText variant="small" color="muted" style={{ paddingVertical: 12 }}>No comments yet. Be the first.</AppText>}
            renderItem={({ item: c }) => (
              <View style={styles.comment}>
                <Avatar name={c.author?.display_name ?? '?'} path={c.author?.avatar_path} size={32} />
                <View style={{ flex: 1 }}>
                  <AppText variant="smallStrong">
                    {c.author?.display_name ?? 'Student'}{' '}
                    <AppText variant="caption" color="muted">
                      {timeAgo(c.created_at)}
                    </AppText>
                  </AppText>
                  <AppText variant="small">{c.body}</AppText>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Comment options" hitSlop={8} onPress={() => commentMenu(c)} style={styles.more}>
                  <Icon name="more-horizontal" size={18} color="muted" />
                </Pressable>
              </View>
            )}
          />
        )}
        <View style={[styles.composer, { borderTopColor: colors.border, backgroundColor: colors.bg, paddingBottom: kbOpen ? 8 : Math.max(insets.bottom, 8) }]}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={profile?.is_suspended ? 'Your account is suspended' : 'Add a comment'}
            editable={!profile?.is_suspended}
            placeholderTextColor={colors.placeholder}
            accessibilityLabel="Add a comment"
            multiline
            maxLength={500}
            style={[styles.input, { backgroundColor: colors.fill, color: colors.ink, fontFamily: FONT.regular }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send comment"
            disabled={!text.trim() || add.isPending}
            onPress={submit}
            style={[styles.send, { backgroundColor: colors.primary, opacity: text.trim() && !add.isPending ? 1 : 0.4 }]}
          >
            <Icon name="send" size={18} color="onPrimary" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      <ReportSheet target={safety.target} onClose={safety.close} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  comment: { flexDirection: 'row', gap: 10, paddingVertical: 8, alignItems: 'flex-start' },
  more: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, maxHeight: 110, minHeight: TAP, borderRadius: 22, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 16 },
  send: { width: TAP, height: TAP, borderRadius: TAP / 2, alignItems: 'center', justifyContent: 'center' },
});
