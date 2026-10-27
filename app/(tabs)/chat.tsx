import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, Skeleton } from '@/components/States';
import { useAuth } from '@/features/auth/AuthProvider';
import { ConversationRow, useConversations } from '@/features/chat/api';
import { timeAgo } from '@/lib/format';
import { publicImageUrl } from '@/lib/supabase';
import { friendlyError } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

export default function ChatScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const q = useConversations(session?.user.id ?? null);

  return (
    <Screen padded={false}>
      <AppText variant="display" style={{ marginTop: 8, marginBottom: 8, paddingHorizontal: 20 }}>
        Chat
      </AppText>
      {q.isLoading ? (
        <View style={{ padding: 20, gap: 12 }}>
          <Skeleton style={{ height: 64 }} />
          <Skeleton style={{ height: 64 }} />
        </View>
      ) : q.isError ? (
        <ErrorState message={friendlyError(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.primary} />}
          ListEmptyComponent={<EmptyState icon="message-circle" title="No conversations yet" message="Open a listing and tap Chat to ask the owner a question." />}
          renderItem={({ item: c }) => <Row c={c} onPress={() => router.push({ pathname: '/chat/[id]', params: { id: c.id } })} />}
        />
      )}
    </Screen>
  );
}

function Row({ c, onPress }: { c: ConversationRow; onPress: () => void }) {
  const { colors } = useTheme();
  const cover = publicImageUrl('item-images', c.item_cover);
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.row, { borderBottomColor: colors.border }]}>
      <Avatar name={c.other_name} path={c.other_avatar} size={48} />
      <View style={{ flex: 1 }}>
        <View style={styles.top}>
          <AppText variant="smallStrong" numberOfLines={1} style={{ flex: 1 }}>
            {c.other_name}
          </AppText>
          <AppText variant="caption" color="muted">
            {timeAgo(c.last_message_at)}
          </AppText>
        </View>
        <AppText variant="caption" color="muted" numberOfLines={1}>
          {c.item_title}
        </AppText>
        <AppText variant="small" color={c.unread > 0 ? 'ink' : 'muted'} numberOfLines={1} style={c.unread > 0 ? { fontWeight: '600' } : undefined}>
          {c.last_message_preview ?? 'Say hello'}
        </AppText>
      </View>
      {c.unread > 0 ? (
        <View style={[styles.unread, { backgroundColor: colors.primary }]}>
          <AppText variant="caption" color="onPrimary">
            {c.unread > 9 ? '9+' : c.unread}
          </AppText>
        </View>
      ) : cover ? (
        <Image source={{ uri: cover }} style={styles.cover} contentFit="cover" />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingVertical: 12, alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  top: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  unread: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  cover: { width: 40, height: 40, borderRadius: radius.sm },
});
