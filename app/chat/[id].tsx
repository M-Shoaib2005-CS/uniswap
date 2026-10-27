import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppBar, IconButton } from '@/components/AppBar';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { ReportSheet } from '@/components/ReportSheet';
import { Screen } from '@/components/Screen';
import { ErrorState } from '@/components/States';
import { useAuth } from '@/features/auth/AuthProvider';
import { markRead, Message, useConversation, useConversationRealtime, useMessages, useSendMessage } from '@/features/chat/api';
import { timeAgo } from '@/lib/format';
import { useSafetyMenu } from '@/features/safety/useSafetyMenu';
import { useKeyboardVisible } from '@/lib/useKeyboardVisible';
import { friendlyError } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';
import { FONT, radius, TAP } from '@/theme/tokens';

export default function ChatThread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const kbOpen = useKeyboardVisible();
  const qc = useQueryClient();
  const { session } = useAuth();
  const me = session?.user.id ?? null;
  const conv = useConversation(id);
  const msgs = useMessages(id);
  const send = useSendMessage(id, me);
  const [text, setText] = useState('');
  const safety = useSafetyMenu(me);
  const [outbox, setOutbox] = useState<Message[]>([]);

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['messages', id] });
    qc.invalidateQueries({ queryKey: ['conversations'] });
    if (id) markRead(id).then(() => qc.invalidateQueries({ queryKey: ['conversations'] }));
  }, [qc, id]);
  useConversationRealtime(id, refresh);
  useEffect(() => {
    if (id) markRead(id).then(() => qc.invalidateQueries({ queryKey: ['conversations'] }));
  }, [id, qc, msgs.data?.pages[0]?.[0]?.id]);

  const sent = useMemo(() => (msgs.data?.pages ?? []).flat(), [msgs.data]);
  // optimistic messages that the server has not returned yet
  const data = useMemo(() => {
    const ids = new Set(sent.map((m) => m.id));
    return [...outbox.filter((m) => !ids.has(m.id)), ...sent];
  }, [sent, outbox]);

  const other = conv.data ? (conv.data.owner_id === me ? conv.data.other : conv.data.owner) : null;

  const deliver = (m: Message) => {
    setOutbox((o) => o.map((x) => (x.id === m.id ? { ...x, pending: true, failed: false } : x)));
    send.mutate(m.body, {
      onSuccess: () => setOutbox((o) => o.filter((x) => x.id !== m.id)),
      onError: () => setOutbox((o) => o.map((x) => (x.id === m.id ? { ...x, pending: false, failed: true } : x))),
    });
  };

  const submit = () => {
    const body = text.trim();
    if (!body || !id) return;
    const m: Message = { id: `local-${Date.now()}`, conversation_id: id, sender_id: me, kind: 'text', body, created_at: new Date().toISOString(), pending: true };
    setText('');
    setOutbox((o) => [m, ...o]);
    deliver(m);
  };

  if (conv.isError) {
    return (
      <Screen>
        <AppBar title="Chat" />
        <ErrorState message={friendlyError(conv.error)} onRetry={() => conv.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen padded={false} edges={{ bottom: false }}>
      <AppBar
        title={other?.display_name ?? 'Chat'}
        right={
          other ? (
            <IconButton
              name="more-horizontal"
              label="More options"
              onPress={() =>
                safety.open({
                  reportType: 'conversation',
                  reportId: id as string,
                  label: 'chat',
                  userId: other.id,
                  userName: other.display_name,
                  onBlocked: () => router.replace('/(tabs)/chat'),
                })
              }
            />
          ) : undefined
        }
      />
      {conv.data?.item ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/listing/[id]', params: { id: conv.data!.item_id } })}
          style={[styles.itemBar, { backgroundColor: colors.fill }]}
        >
          <Icon name="package" size={16} color="muted" />
          <AppText variant="small" numberOfLines={1} style={{ flex: 1 }}>
            {conv.data.item.title}
          </AppText>
          <Icon name="chevron-right" size={16} color="muted" />
        </Pressable>
      ) : null}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {msgs.isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ margin: 24 }} />
        ) : (
          <FlatList
            inverted
            data={data}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ padding: 16, gap: 6 }}
            onEndReached={() => msgs.hasNextPage && !msgs.isFetchingNextPage && msgs.fetchNextPage()}
            onEndReachedThreshold={0.4}
            ListEmptyComponent={
              <View style={{ transform: [{ scaleY: -1 }] }}>
                <AppText variant="small" color="muted" center style={{ marginTop: 40 }}>
                  No messages yet. Say hello.
                </AppText>
              </View>
            }
            ListFooterComponent={msgs.isFetchingNextPage ? <ActivityIndicator color={colors.primary} /> : undefined}
            renderItem={({ item: m }) => <Bubble m={m} mine={m.sender_id === me} onRetry={() => deliver(m)} />}
          />
        )}
        <View style={[styles.composer, { borderTopColor: colors.border, backgroundColor: colors.bg, paddingBottom: kbOpen ? 8 : Math.max(insets.bottom, 8) }]}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Message"
            placeholderTextColor={colors.placeholder}
            accessibilityLabel="Message"
            multiline
            maxLength={1000}
            style={[styles.input, { backgroundColor: colors.fill, color: colors.ink, fontFamily: FONT.regular }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send message"
            disabled={!text.trim()}
            onPress={submit}
            style={[styles.sendBtn, { backgroundColor: colors.primary, opacity: text.trim() ? 1 : 0.4 }]}
          >
            <Icon name="send" size={18} color="onPrimary" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      <ReportSheet target={safety.target} onClose={safety.close} />
    </Screen>
  );
}

function Bubble({ m, mine, onRetry }: { m: Message; mine: boolean; onRetry: () => void }) {
  const { colors } = useTheme();
  if (m.kind === 'system') {
    return (
      <View style={{ alignItems: 'center', marginVertical: 6 }}>
        <AppText variant="caption" color="muted" center style={[styles.system, { backgroundColor: colors.fill }]}>
          {m.body}
        </AppText>
      </View>
    );
  }
  return (
    <View style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
      <View style={[styles.bubble, { backgroundColor: mine ? colors.primary : colors.fill }]}>
        <AppText color={mine ? 'onPrimary' : 'ink'}>{m.body}</AppText>
      </View>
      {m.failed ? (
        <Pressable accessibilityRole="button" onPress={onRetry} hitSlop={8}>
          <AppText variant="caption" color="danger">
            Not sent. Tap to retry
          </AppText>
        </Pressable>
      ) : m.pending ? (
        <AppText variant="caption" color="muted">
          Sending…
        </AppText>
      ) : (
        <AppText variant="caption" color="muted">
          {timeAgo(m.created_at)}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  itemBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, minHeight: TAP, marginHorizontal: 16, borderRadius: radius.md },
  bubble: { maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18 },
  system: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: radius.full, overflow: 'hidden' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, maxHeight: 110, minHeight: TAP, borderRadius: 22, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 16 },
  sendBtn: { width: TAP, height: TAP, borderRadius: TAP / 2, alignItems: 'center', justifyContent: 'center' },
});
