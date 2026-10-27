import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Modal, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppBar } from '@/components/AppBar';
import { AppText } from '@/components/AppText';
import { Badge, Segmented } from '@/components/Chip';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, Skeleton } from '@/components/States';
import { QueueReport, ReportAction, useReportQueue, useResolveReport } from '@/features/admin/api';
import { REPORT_REASONS } from '@/features/safety/api';
import { timeAgo } from '@/lib/format';
import { friendlyError } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

type Tab = 'open' | 'upheld' | 'dismissed';

const reasonLabel = (k: string) => REPORT_REASONS.find((r) => r.key === k)?.label ?? k;

export default function AdminReports() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('open');
  const q = useReportQueue(tab);
  const resolve = useResolveReport();
  const [active, setActive] = useState<QueueReport | null>(null);
  const [note, setNote] = useState('');

  const view = (r: QueueReport) => {
    if (r.target_type === 'item') router.push({ pathname: '/listing/[id]', params: { id: r.target_id } });
    else if (r.target_type === 'post') router.push({ pathname: '/post/[id]', params: { id: r.target_id } });
    else if (r.target_user_id) router.push({ pathname: '/user/[id]', params: { id: r.target_user_id } });
  };

  const act = (action: ReportAction) => {
    if (!active) return;
    resolve.mutate(
      { id: active.id, action, note },
      {
        onSuccess: () => {
          setActive(null);
          setNote('');
        },
        onError: (e) => Alert.alert('Could not resolve', friendlyError(e)),
      },
    );
  };

  const confirm = (action: ReportAction, title: string) =>
    Alert.alert(title, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', style: action === 'dismiss' ? 'default' : 'destructive', onPress: () => act(action) },
    ]);

  return (
    <Screen padded={false}>
      <AppBar title="Reports" />
      <View style={{ paddingHorizontal: 20 }}>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { key: 'open', label: 'Open' },
            { key: 'upheld', label: 'Upheld' },
            { key: 'dismissed', label: 'Dismissed' },
          ]}
        />
      </View>
      {q.isLoading ? (
        <View style={{ padding: 20, gap: 12 }}>
          <Skeleton style={{ height: 96 }} />
          <Skeleton style={{ height: 96 }} />
        </View>
      ) : q.isError ? (
        <ErrorState message={friendlyError(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: 20, gap: 12, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.primary} />}
          ListEmptyComponent={<EmptyState icon="check-circle" title={tab === 'open' ? 'Queue is clear' : 'Nothing here'} message="Reports from students appear here." />}
          renderItem={({ item: r }) => (
            <Pressable accessibilityRole="button" onPress={() => (tab === 'open' ? setActive(r) : view(r))} style={[styles.card, { borderColor: colors.border }]}>
              <View style={styles.top}>
                <Badge label={r.target_type} tone="primary" />
                <Badge label={reasonLabel(r.reason)} tone="warn" />
                <AppText variant="caption" color="muted" style={{ marginLeft: 'auto' }}>
                  {timeAgo(r.created_at)}
                </AppText>
              </View>
              <AppText variant="smallStrong" numberOfLines={3}>
                {r.preview ?? '(content no longer available)'}
              </AppText>
              <AppText variant="caption" color="muted">
                About {r.target_user_name ?? 'unknown'} · reported by {r.reporter_name}
              </AppText>
              {r.details ? (
                <AppText variant="small" color="muted" numberOfLines={3}>
                  “{r.details}”
                </AppText>
              ) : null}
            </Pressable>
          )}
        />
      )}

      <Modal visible={!!active} transparent animationType="slide" onRequestClose={() => setActive(null)}>
<KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={() => (resolve.isPending ? undefined : setActive(null))}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.bg, paddingBottom: Math.max(insets.bottom, 16) }]} onPress={() => undefined}>
            <AppText variant="title">Resolve report</AppText>
            <AppText variant="small" color="muted" style={{ marginTop: 4 }} numberOfLines={3}>
              {active?.preview ?? ''}
            </AppText>
            <Button compact variant="ghost" label="View reported content" onPress={() => active && view(active)} />
            <Field label="Note to the user (optional)" value={note} onChangeText={setNote} maxLength={200} placeholder="Shown in their notification" />
            <View style={{ gap: 8 }}>
              <Button label="Dismiss (no violation)" variant="secondary" disabled={resolve.isPending} onPress={() => confirm('dismiss', 'Dismiss this report?')} />
              <Button label="Warn user" variant="secondary" disabled={resolve.isPending} onPress={() => confirm('warn', 'Send a warning?')} />
              {active && ['item', 'post', 'comment'].includes(active.target_type) ? (
                <Button label="Remove content" variant="danger" disabled={resolve.isPending} onPress={() => confirm('remove', 'Remove this content?')} />
              ) : null}
              <Button label="Suspend user" variant="danger" disabled={resolve.isPending} onPress={() => confirm('suspend', 'Suspend this user?')} />
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
</Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, borderWidth: 1, borderRadius: radius.lg, gap: 6 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
});
