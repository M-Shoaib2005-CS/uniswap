import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { AppBar } from '@/components/AppBar';
import { AppText } from '@/components/AppText';
import { Icon, IconName } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState } from '@/components/States';
import { timeAgo } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';

interface Notif {
  id: string;
  kind: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
  data: { txn_id?: string; conversation_id?: string } | null;
}

const ICONS: Record<string, IconName> = {
  messages: 'message-circle',
  requests: 'clipboard',
  reminders: 'clock',
  likes: 'heart',
  comments: 'message-square',
  system: 'shield',
};

export default function Notifications() {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const router = useRouter();
  const q = useQuery({
    queryKey: ['notifications'],
    queryFn: async (): Promise<Notif[]> => {
      const { data, error } = await supabase.from('notifications').select('id,kind,title,body,read_at,created_at,data').order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []) as Notif[];
    },
  });
  const markAll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notif-count'] });
    },
  });
  const markOne = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notif-count'] });
    },
  });
  const hasUnread = (q.data ?? []).some((n) => !n.read_at);

  return (
    <Screen padded={false}>
      <AppBar
        title="Notifications"
        right={
          hasUnread ? (
            <Pressable accessibilityRole="button" onPress={() => markAll.mutate()} hitSlop={8}>
              <AppText variant="smallStrong" color="primaryText">
                Read all
              </AppText>
            </Pressable>
          ) : null
        }
      />
      {q.isError ? (
        <ErrorState message={friendlyError(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(n) => n.id}
          refreshing={q.isRefetching}
          onRefresh={() => q.refetch()}
          ListEmptyComponent={q.isLoading ? undefined : <EmptyState icon="bell" title="You're all caught up" message="Requests, messages and reminders will show up here." />}
          renderItem={({ item: n }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (!n.read_at) markOne.mutate(n.id);
                if (n.data?.txn_id) router.push({ pathname: '/txn/[id]', params: { id: n.data.txn_id } });
                else if (n.data?.conversation_id) router.push({ pathname: '/chat/[id]', params: { id: n.data.conversation_id } });
              }}
              style={[styles.row, { borderBottomColor: colors.border, backgroundColor: n.read_at ? colors.bg : colors.primarySoft }]}
            >
              <Icon name={ICONS[n.kind] ?? 'bell'} size={20} color="primaryText" />
              <View style={{ flex: 1 }}>
                <AppText variant="smallStrong">{n.title}</AppText>
                {n.body ? (
                  <AppText variant="small" color="muted" numberOfLines={2}>
                    {n.body}
                  </AppText>
                ) : null}
              </View>
              <AppText variant="caption" color="muted">
                {timeAgo(n.created_at)}
              </AppText>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'flex-start' },
});
