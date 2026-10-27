import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { AppBar } from '@/components/AppBar';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Chip';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState } from '@/components/States';
import { AdminUser, useAdminUsers, useSetSuspended } from '@/features/admin/api';
import { friendlyError } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';
import { FONT, radius, TAP } from '@/theme/tokens';

export default function AdminUsers() {
  const { colors } = useTheme();
  const router = useRouter();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const q = useAdminUsers(query);
  const setSusp = useSetSuspended();

  // debounce typing
  useEffect(() => {
    const t = setTimeout(() => setQuery(text.trim()), 350);
    return () => clearTimeout(t);
  }, [text]);

  const toggle = (u: AdminUser) => {
    const suspend = !u.is_suspended;
    Alert.alert(suspend ? `Suspend ${u.display_name}?` : `Reinstate ${u.display_name}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: suspend ? 'Suspend' : 'Reinstate',
        style: suspend ? 'destructive' : 'default',
        onPress: () =>
          setSusp.mutate(
            { id: u.id, suspend, reason: suspend ? 'Suspended by a moderator' : '' },
            { onError: (e) => Alert.alert('Could not update', friendlyError(e)) },
          ),
      },
    ]);
  };

  return (
    <Screen padded={false}>
      <AppBar title="Users" />
      <View style={[styles.search, { backgroundColor: colors.fill }]}>
        <Icon name="search" size={18} color="muted" />
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Search by name"
          placeholderTextColor={colors.placeholder}
          accessibilityLabel="Search users"
          autoCapitalize="none"
          style={{ flex: 1, color: colors.ink, fontFamily: FONT.regular, fontSize: 16 }}
        />
      </View>
      {q.isError ? (
        <ErrorState message={friendlyError(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ paddingHorizontal: 20, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={q.isLoading ? undefined : <EmptyState icon="users" title="No users found" />}
          renderItem={({ item: u }) => (
            <View style={[styles.row, { borderBottomColor: colors.border }]}>
              <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/user/[id]', params: { id: u.id } })} style={{ flex: 1, gap: 2 }}>
                <AppText variant="smallStrong" numberOfLines={1}>
                  {u.display_name}
                </AppText>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <AppText variant="caption" color="muted">
                    ★ {u.trust_score != null ? u.trust_score.toFixed(1) : '–'} · {u.swaps_count} swaps
                  </AppText>
                  {u.is_suspended ? <Badge label="Suspended" tone="danger" /> : null}
                  {u.is_admin ? <Badge label="Admin" tone="warn" /> : null}
                </View>
              </Pressable>
              {u.is_admin ? null : (
                <Button compact variant={u.is_suspended ? 'secondary' : 'danger'} label={u.is_suspended ? 'Reinstate' : 'Suspend'} onPress={() => toggle(u)} />
              )}
            </View>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: TAP + 4, borderRadius: radius.md, paddingHorizontal: 12, marginHorizontal: 20, marginVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
