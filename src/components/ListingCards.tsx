import { Image } from 'expo-image';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { formatDistance, formatMoney } from '@/lib/format';
import { publicImageUrl } from '@/lib/supabase';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, TAP } from '@/theme/tokens';
import { ListingMode, ListingStatus, SearchItem, STATUS_LABEL } from '@/types/models';
import { AppText } from './AppText';
import { Badge, BadgeTone } from './Chip';
import { Icon } from './Icon';

export function priceLine(item: Pick<SearchItem, 'mode' | 'rent_price' | 'sale_price'>, prefer: 'rent' | 'buy' | 'all' = 'all'): string {
  const rent = item.rent_price !== null ? `${formatMoney(item.rent_price)} / sem` : '';
  const sale = item.sale_price !== null ? formatMoney(item.sale_price) : '';
  if (item.mode === 'rent') return rent;
  if (item.mode === 'sell') return sale;
  return prefer === 'buy' ? sale : rent;
}

export function modeLabel(mode: ListingMode, prefer: 'rent' | 'buy' | 'all' = 'all'): string {
  if (mode === 'rent') return 'For rent';
  if (mode === 'sell') return 'For sale';
  return prefer === 'buy' ? 'For sale' : prefer === 'rent' ? 'For rent' : 'Rent or buy';
}

export function statusTone(s: ListingStatus): BadgeTone {
  if (s === 'available') return 'success';
  if (s === 'requested') return 'warn';
  return 'neutral';
}

function SaveButton({ saved, onToggle }: { saved: boolean; onToggle?: () => void }) {
  const { colors } = useTheme();
  if (!onToggle) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={saved ? 'Remove from saved' : 'Save listing'}
      onPress={onToggle}
      hitSlop={6}
      style={[styles.heart, { backgroundColor: colors.bg }]}
    >
      <Icon name="heart" size={16} color={saved ? 'danger' : 'muted'} />
    </Pressable>
  );
}

/** Grid card used on Home. */
export function ListingTile({
  item,
  prefer,
  onPress,
  onToggleSave,
}: {
  item: SearchItem;
  prefer: 'rent' | 'buy' | 'all';
  onPress: () => void;
  onToggleSave?: () => void;
}) {
  const { colors } = useTheme();
  const uri = publicImageUrl('item-images', item.cover_path);
  const unavailable = item.status !== 'available';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${priceLine(item, prefer)}, ${STATUS_LABEL[item.status]}`}
      onPress={onPress}
      style={styles.tile}
    >
      <View style={[styles.cover, { backgroundColor: colors.fill }]}>
        {uri ? (
          <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <Icon name="image" size={28} color="placeholder" />
        )}
        <View style={styles.coverBadge}>
          <Badge label={modeLabel(item.mode, prefer)} tone="primary" />
        </View>
        <SaveButton saved={item.is_saved} onToggle={onToggleSave} />
      </View>
      <AppText variant="smallStrong" numberOfLines={1} style={styles.title}>
        {item.title}
      </AppText>
      <AppText variant="smallStrong" color="primaryText">
        {priceLine(item, prefer)}
      </AppText>
      <AppText variant="caption" color={unavailable ? 'muted' : 'success'} numberOfLines={1}>
        {STATUS_LABEL[item.status]}
        {item.distance_m !== null ? ` · ${formatDistance(item.distance_m)}` : ''}
      </AppText>
    </Pressable>
  );
}

/** Row card used in search results. */
export function ListingRow({ item, prefer, onPress }: { item: SearchItem; prefer: 'rent' | 'buy' | 'all'; onPress: () => void }) {
  const { colors } = useTheme();
  const uri = publicImageUrl('item-images', item.cover_path);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${priceLine(item, prefer)}`}
      onPress={onPress}
      style={[styles.row, { minHeight: TAP + 60 }]}
    >
      <View style={[styles.thumb, { backgroundColor: colors.fill }]}>
        {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Icon name="image" size={22} color="placeholder" />}
      </View>
      <View style={styles.rowBody}>
        <AppText variant="smallStrong" numberOfLines={2}>
          {item.title}
        </AppText>
        <AppText variant="smallStrong" color="primaryText">
          {priceLine(item, prefer)}
        </AppText>
        <View style={styles.badges}>
          <Badge label={modeLabel(item.mode, prefer)} tone="primary" />
          <Badge label={STATUS_LABEL[item.status]} tone={statusTone(item.status)} />
        </View>
        <View style={styles.where}>
          <Icon name="map-pin" size={12} color="muted" />
          <AppText variant="caption" color="muted" numberOfLines={1} style={styles.whereText}>
            {item.distance_m !== null ? `${formatDistance(item.distance_m)} · ` : ''}
            {item.zone_name}
          </AppText>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, marginBottom: 20 },
  cover: { aspectRatio: 1, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  coverBadge: { position: 'absolute', left: 8, bottom: 8 },
  heart: { position: 'absolute', right: 8, top: 8, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  title: { marginTop: 8 },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 10 },
  thumb: { width: 84, height: 84, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  rowBody: { flex: 1, gap: 2 },
  badges: { flexDirection: 'row', gap: 6, marginTop: 2 },
  where: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  whereText: { flex: 1 },
});
