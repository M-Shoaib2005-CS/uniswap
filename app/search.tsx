import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Chip, Segmented } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { ListingRow } from '@/components/ListingCards';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, Skeleton } from '@/components/States';
import { useAuth } from '@/features/auth/AuthProvider';
import { useSearchItems } from '@/features/listings/api';
import { useCategories, useZones } from '@/features/reference/api';
import { friendlyError } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';
import { FONT, radius, TAP } from '@/theme/tokens';
import { ModeFilter, SearchItem, SortKey } from '@/types/models';

const MODES: { key: ModeFilter; label: string }[] = [
  { key: 'rent', label: 'Rent' },
  { key: 'buy', label: 'Buy' },
  { key: 'all', label: 'All' },
];
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'distance', label: 'Nearest' },
  { key: 'price', label: 'Price' },
  { key: 'newest', label: 'Newest' },
];

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function SearchScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { profile } = useAuth();
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const categories = useCategories();
  const zones = useZones();

  const [text, setText] = useState('');
  const [mode, setMode] = useState<ModeFilter>('all');
  const [sort, setSort] = useState<SortKey>('distance');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const query = useDebounced(text, 300);

  const zoneId = profile?.default_zone_id ?? null;
  const zoneName = zones.data?.find((z) => z.id === zoneId)?.name;
  const filters = useMemo(() => ({ query, mode, categoryId, zoneId, sort }), [query, mode, categoryId, zoneId, sort]);
  const q = useSearchItems(filters);
  const items = useMemo(() => (q.data?.pages.flat() ?? []) as SearchItem[], [q.data]);
  const catName = categories.data?.find((c) => c.id === categoryId)?.name;

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, []);

  const summary = q.isLoading
    ? 'Searching…'
    : `${items.length}${q.hasNextPage ? '+' : ''} ${catName ? catName.toLowerCase() : 'results'}${zoneName ? ` near ${zoneName}` : ''}`;

  return (
    <Screen padded={false}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.back}>
          <Icon name="chevron-left" size={24} />
        </Pressable>
        <View style={[styles.input, { backgroundColor: colors.fill }]}>
          <Icon name="search" size={18} color="muted" />
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            placeholder="Search books, lab gear, tools"
            placeholderTextColor={colors.placeholder}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="Search"
            style={{ flex: 1, color: colors.ink, fontFamily: FONT.regular, fontSize: 16, paddingVertical: 10 }}
          />
          {text.length > 0 ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10} onPress={() => setText('')}>
              <Icon name="x" size={18} color="muted" />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={{ flexGrow: 0 }}>
        <Chip label="All" selected={categoryId === null} onPress={() => setCategoryId(null)} />
        {(categories.data ?? []).map((c) => (
          <Chip key={c.id} label={c.name} selected={categoryId === c.id} onPress={() => setCategoryId(c.id === categoryId ? null : c.id)} />
        ))}
      </ScrollView>

      <View style={styles.filterRow}>
        <View style={{ flex: 1 }}>
          <Segmented options={MODES} value={mode} onChange={setMode} />
        </View>
        <View style={{ flex: 1 }}>
          <Segmented options={SORTS} value={sort} onChange={setSort} />
        </View>
      </View>

      <AppText variant="caption" color="muted" style={{ paddingHorizontal: 20, marginBottom: 4 }} accessibilityLiveRegion="polite">
        {summary}
      </AppText>

      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
        }}
        ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />}
        ListEmptyComponent={
          q.isLoading ? (
            <View style={{ gap: 16, marginTop: 8 }}>
              {[0, 1, 2].map((n) => (
                <View key={n} style={{ flexDirection: 'row', gap: 12 }}>
                  <Skeleton style={{ width: 84, height: 84, borderRadius: radius.md }} />
                  <View style={{ flex: 1, gap: 8 }}>
                    <Skeleton style={{ height: 14, width: '80%' }} />
                    <Skeleton style={{ height: 14, width: '40%' }} />
                  </View>
                </View>
              ))}
            </View>
          ) : q.isError ? (
            <ErrorState message={friendlyError(q.error)} onRetry={() => q.refetch()} />
          ) : (
            <EmptyState
              icon="search"
              title="No matches"
              message={query ? `Nothing found for "${query}". Try a different word or clear the filters.` : 'Nothing listed here yet.'}
            />
          )
        }
        ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator color={colors.primary} style={{ margin: 16 }} /> : undefined}
        renderItem={({ item }) => (
          <ListingRow item={item} prefer={mode} onPress={() => router.push({ pathname: '/listing/[id]', params: { id: item.id } })} />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingTop: 8, gap: 4 },
  back: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: TAP + 4, borderRadius: radius.md, paddingHorizontal: 12, marginRight: 12 },
  chips: { paddingHorizontal: 20, paddingVertical: 12, gap: 8 },
  filterRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 12, marginBottom: 8 },
});
