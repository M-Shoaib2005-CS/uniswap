import React from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { AppBar } from '@/components/AppBar';
import { AppText } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState } from '@/components/States';
import { useAuth } from '@/features/auth/AuthProvider';
import { useBlockedUsers, useUnblock } from '@/features/safety/api';
import { friendlyError } from '@/lib/validation';

export default function Blocked() {
  const { session } = useAuth();
  const me = session?.user.id ?? null;
  const q = useBlockedUsers(me);
  const unblock = useUnblock(me);

  return (
    <Screen padded={false}>
      <AppBar title="Blocked users" />
      {q.isError ? (
        <ErrorState message={friendlyError(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(b) => b.blocked_id}
          contentContainerStyle={{ paddingHorizontal: 20, flexGrow: 1 }}
          ListEmptyComponent={q.isLoading ? undefined : <EmptyState icon="shield" title="No blocked users" message="People you block can't message you or see your listings and posts." />}
          renderItem={({ item: b }) => (
            <View style={styles.row}>
              <Avatar name={b.user?.display_name ?? '?'} path={b.user?.avatar_path} size={40} />
              <AppText style={{ flex: 1 }} numberOfLines={1}>
                {b.user?.display_name ?? 'Student'}
              </AppText>
              <Button
                compact
                variant="secondary"
                label="Unblock"
                loading={unblock.isPending && unblock.variables === b.blocked_id}
                onPress={() => unblock.mutate(b.blocked_id, { onError: (e) => Alert.alert('Could not unblock', friendlyError(e)) })}
              />
            </View>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 } });
