import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { AppBar } from '@/components/AppBar';
import { ListingRow } from '@/components/ListingCards';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, Skeleton } from '@/components/States';
import { useSearchItems } from '@/features/listings/api';
import { friendlyError } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';
import type { SearchItem } from '@/types/models';

export default function Saved() {
  const { colors } = useTheme();
  const router = useRouter();
  const filters = useMemo(() => ({ query: '', mode: 'all' as const, categoryId: null, zoneId: null, sort: 'newest' as const, savedOnly: true }), []);
  const q = useSearchItems(filters);
  const items = (q.data?.pages.flat() ?? []) as SearchItem[];

  return (
    <Screen padded={false}>
      <AppBar title="Saved items" />
      {q.isLoading ? (
        <View style={{ padding: 20, gap: 12 }}>
          <Skeleton style={{ height: 84 }} />
          <Skeleton style={{ height: 84 }} />
        </View>
      ) : q.isError ? (
        <ErrorState message={friendlyError(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingHorizontal: 20, flexGrow: 1 }}
          onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
          ListEmptyComponent={<EmptyState icon="heart" title="Nothing saved yet" message="Tap the heart on a listing to keep it here." />}
          ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator color={colors.primary} style={{ margin: 16 }} /> : undefined}
          renderItem={({ item }) => <ListingRow item={item} prefer="all" onPress={() => router.push({ pathname: '/listing/[id]', params: { id: item.id } })} />}
        />
      )}
    </Screen>
  );
}
