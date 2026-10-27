import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Segmented } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { ListingTile } from '@/components/ListingCards';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, Skeleton } from '@/components/States';
import { useAuth } from '@/features/auth/AuthProvider';
import { FeedTab } from '@/features/feed/FeedTab';
import { useSearchItems, useToggleSave } from '@/features/listings/api';
import { useNotifCount } from '@/features/realtime/useRealtimeSync';
import { useZones } from '@/features/reference/api';
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
  { key: 'price', label: 'Lowest price' },
  { key: 'newest', label: 'Newest' },
];

export default function Home() {
  const { colors } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const { profile, session, updateProfile } = useAuth();
  const zones = useZones();
  const notifCount = useNotifCount(session?.user.id ?? null);

  const [tab, setTab] = useState<'market' | 'feed'>('market');
  const [mode, setMode] = useState<ModeFilter>('rent');
  const [sort, setSort] = useState<SortKey>('distance');
  const [sortOpen, setSortOpen] = useState(false);
  const [zoneOpen, setZoneOpen] = useState(false);

  const zoneId = profile?.default_zone_id ?? null;
  const zoneName = zones.data?.find((z) => z.id === zoneId)?.name ?? 'Choose your zone';

  const filters = useMemo(() => ({ query: '', mode, categoryId: null, zoneId, sort }), [mode, zoneId, sort]);
  const q = useSearchItems(filters, tab === 'market');
  const toggleSave = useToggleSave(session?.user.id ?? null);

  const items = useMemo(() => (q.data?.pages.flat() ?? []) as SearchItem[], [q.data]);

  const onRefresh = useCallback(() => {
    q.refetch();
  }, [q]);

  const pickZone = async (id: number) => {
    setZoneOpen(false);
    try {
      await updateProfile({ default_zone_id: id });
      qc.invalidateQueries({ queryKey: ['search'] });
    } catch {
      // keep the previous zone; the list stays as it was
    }
  };

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Your campus zone: ${zoneName}. Tap to change`}
          onPress={() => setZoneOpen(true)}
          style={[styles.zoneBtn]}
        >
          <Icon name="map-pin" size={16} color="primaryText" />
          <AppText variant="smallStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
            {zoneName}
          </AppText>
          <Icon name="chevron-down" size={16} color="muted" />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Notifications" onPress={() => router.push('/notifications')} style={styles.bell}>
          <Icon name="bell" size={22} />
          {(notifCount.data ?? 0) > 0 ? <View style={{ position: 'absolute', top: 8, right: 8, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.danger }} /> : null}
        </Pressable>
      </View>

      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        {(['market', 'feed'] as const).map((t) => {
          const active = tab === t;
          return (
            <Pressable
              key={t}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => setTab(t)}
              style={[styles.tabBtn, active && { borderBottomColor: colors.primary }]}
            >
              <AppText variant="smallStrong" color={active ? 'ink' : 'muted'}>
                {t === 'market' ? 'Marketplace' : 'Campus feed'}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {tab === 'feed' ? (
        <FeedTab />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 12, paddingHorizontal: 20 }}
          refreshControl={<RefreshControl refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={onRefresh} tintColor={colors.primary} />}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
          }}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <Pressable
                accessibilityRole="search"
                accessibilityLabel="Search books, lab gear, tools"
                onPress={() => router.push('/search')}
                style={[styles.search, { backgroundColor: colors.fill }]}
              >
                <Icon name="search" size={18} color="muted" />
                <AppText variant="small" color="placeholder" style={{ flex: 1 }}>
                  Search books, lab gear, tools
                </AppText>
              </Pressable>
              <View style={styles.filterRow}>
                <View style={{ flex: 1 }}>
                  <Segmented options={MODES} value={mode} onChange={setMode} />
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Sort: ${SORTS.find((s) => s.key === sort)?.label}`}
                  onPress={() => setSortOpen(true)}
                  style={styles.sortBtn}
                >
                  <AppText variant="smallStrong" color="primaryText">
                    {SORTS.find((s) => s.key === sort)?.label}
                  </AppText>
                  <Icon name="chevron-down" size={14} color="primaryText" />
                </Pressable>
              </View>
            </View>
          }
          ListEmptyComponent={
            q.isLoading ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 20 }}>
                {[0, 1, 2, 3].map((n) => (
                  <View key={n} style={{ width: '47%' }}>
                    <Skeleton style={{ aspectRatio: 1, borderRadius: radius.lg }} />
                    <Skeleton style={{ height: 14, marginTop: 10, width: '80%' }} />
                    <Skeleton style={{ height: 14, marginTop: 6, width: '50%' }} />
                  </View>
                ))}
              </View>
            ) : q.isError ? (
              <ErrorState message={friendlyError(q.error)} onRetry={() => q.refetch()} />
            ) : (
              <EmptyState
                icon="package"
                title={mode === 'buy' ? 'Nothing for sale nearby yet' : mode === 'rent' ? 'Nothing to rent nearby yet' : 'No listings yet'}
                message="Be the first to list something. Tap the + button below."
              />
            )
          }
          ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator color={colors.primary} style={{ margin: 16 }} /> : <View style={{ height: 8 }} />}
          renderItem={({ item }) => (
            <ListingTile
              item={item}
              prefer={mode}
              onPress={() => router.push({ pathname: '/listing/[id]', params: { id: item.id } })}
              onToggleSave={() => toggleSave.mutate({ itemId: item.id, saved: item.is_saved })}
            />
          )}
        />
      )}

      <Modal visible={sortOpen} transparent animationType="fade" onRequestClose={() => setSortOpen(false)}>
        <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={() => setSortOpen(false)}>
          <View style={[styles.sheet, { backgroundColor: colors.bg }]}>
            <AppText variant="heading" style={{ marginBottom: 8 }}>
              Sort by
            </AppText>
            {SORTS.map((s) => (
              <Pressable
                key={s.key}
                accessibilityRole="button"
                onPress={() => {
                  setSort(s.key);
                  setSortOpen(false);
                }}
                style={styles.sheetRow}
              >
                <AppText variant="body">{s.label}</AppText>
                {sort === s.key ? <Icon name="check" size={18} color="primaryText" /> : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <ZonePicker
        visible={zoneOpen}
        onClose={() => setZoneOpen(false)}
        onPick={pickZone}
        selectedId={zoneId}
        zones={zones.data ?? []}
        loading={zones.isLoading}
      />
    </Screen>
  );
}

function ZonePicker({
  visible,
  onClose,
  onPick,
  selectedId,
  zones,
  loading,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (id: number) => void;
  selectedId: number | null;
  zones: { id: number; name: string; category: string }[];
  loading: boolean;
}) {
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const filtered = zones.filter((z) => z.name.toLowerCase().includes(text.trim().toLowerCase()));
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.bg, maxHeight: '80%' }]} onPress={() => undefined}>
          <AppText variant="title">Where are you on campus?</AppText>
          <AppText variant="small" color="muted" style={{ marginTop: 2, marginBottom: 12 }}>
            Results are ranked by walking distance from this spot.
          </AppText>
          <View style={[styles.search, { backgroundColor: colors.fill, marginBottom: 8 }]}>
            <Icon name="search" size={18} color="muted" />
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Search zones"
              placeholderTextColor={colors.placeholder}
              style={{ flex: 1, color: colors.ink, fontFamily: FONT.regular, fontSize: 16 }}
              accessibilityLabel="Search zones"
            />
          </View>
          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ margin: 24 }} />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(z) => String(z.id)}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<AppText variant="small" color="muted" center style={{ padding: 24 }}>No zones match.</AppText>}
              renderItem={({ item: z }) => (
                <Pressable accessibilityRole="button" onPress={() => onPick(z.id)} style={styles.sheetRow}>
                  <View style={{ flex: 1 }}>
                    <AppText variant="body">{z.name}</AppText>
                    <AppText variant="caption" color="muted">
                      {z.category}
                    </AppText>
                  </View>
                  {selectedId === z.id ? <Icon name="check" size={18} color="primaryText" /> : null}
                </Pressable>
              )}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, minHeight: 56 },
  zoneBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: TAP, flexShrink: 1, maxWidth: '80%' },
  bell: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', paddingHorizontal: 20, gap: 24, borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn: { minHeight: TAP, justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  listHeader: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, gap: 12 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: TAP + 4, borderRadius: radius.md, paddingHorizontal: 12 },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: TAP },
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  sheetRow: { minHeight: TAP + 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
