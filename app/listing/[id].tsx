import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { modeLabel, statusTone } from '@/components/ListingCards';
import { ReportSheet } from '@/components/ReportSheet';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, Skeleton } from '@/components/States';
import { useAuth } from '@/features/auth/AuthProvider';
import { startConversation } from '@/features/chat/api';
import { useSafetyMenu } from '@/features/safety/useSafetyMenu';
import { useItem, useToggleSave } from '@/features/listings/api';
import { useArchiveListing, useBoostListing, useDeleteListing } from '@/features/listings/manage';
import { formatDistance, formatMoney } from '@/lib/format';
import { publicImageUrl } from '@/lib/supabase';
import { friendlyError } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, TAP } from '@/theme/tokens';
import { CONDITION_LABEL, STATUS_LABEL } from '@/types/models';

export default function ListingDetail() {
  const { colors } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile, session } = useAuth();
  const myId = session?.user.id ?? null;
  const q = useItem(id, profile?.default_zone_id ?? null, myId);
  const toggleSave = useToggleSave(myId);
  const archive = useArchiveListing();
  const safety = useSafetyMenu(myId);
  const del = useDeleteListing();
  const boost = useBoostListing();
  const [page, setPage] = useState(0);
  const [chatBusy, setChatBusy] = useState(false);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  if (q.isLoading) {
    return (
      <Screen padded={false} edges={{ top: false }}>
        <Skeleton style={{ width, height: width * 0.85, borderRadius: 0 }} />
        <View style={{ padding: 20, gap: 12 }}>
          <Skeleton style={{ height: 20, width: '70%' }} />
          <Skeleton style={{ height: 28, width: '40%' }} />
          <Skeleton style={{ height: 14, width: '90%' }} />
        </View>
      </Screen>
    );
  }
  if (q.isError) {
    return (
      <Screen>
        <ErrorState message={friendlyError(q.error)} onRetry={() => q.refetch()} />
      </Screen>
    );
  }
  const item = q.data;
  if (!item) {
    return (
      <Screen>
        <EmptyState icon="archive" title="Listing not available" message="It may have been removed or archived by its owner." actionLabel="Go back" onAction={back} />
      </Screen>
    );
  }

  const isOwner = item.owner.id === myId;
  const openChat = async () => {
    setChatBusy(true);
    try {
      const convId = await startConversation(item.id);
      router.push({ pathname: '/chat/[id]', params: { id: convId } });
    } catch (e) {
      Alert.alert('Could not open chat', friendlyError(e));
    } finally {
      setChatBusy(false);
    }
  };
  const doBoost = () => {
    if (!profile?.is_pro) {
      Alert.alert('Pro feature', 'Boosting puts your listing at the top of its zone for 7 days. It is available to Pro members.');
      return;
    }
    boost.mutate(item.id, {
      onSuccess: () => Alert.alert('Boosted', 'Your listing will appear first in its zone for 7 days.'),
      onError: (e) => Alert.alert('Could not boost', friendlyError(e)),
    });
  };
  const toggleArchive = () =>
    archive.mutate(
      { id: item.id, archived: item.status !== 'archived' },
      { onError: (e) => Alert.alert('Could not update', friendlyError(e)) },
    );
  const confirmDelete = () =>
    Alert.alert('Delete this listing?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => del.mutate({ id: item.id, paths: item.images }, { onSuccess: back, onError: (e) => Alert.alert('Could not delete', friendlyError(e)) }),
      },
    ]);
  const canRequest = !isOwner && item.status === 'available' && !profile?.is_suspended;
  const offersRent = item.mode === 'rent' || item.mode === 'both';
  const offersSale = item.mode === 'sell' || item.mode === 'both';
  const cta = offersRent ? 'Request to rent' : 'Request to buy';
  const ctaDisabledText = isOwner ? 'This is your listing' : item.status === 'available' ? 'Unavailable' : STATUS_LABEL[item.status];

  return (
    <Screen
      padded={false}
      edges={{ top: false }}
      scroll
      footer={
        isOwner ? (
          <View style={{ gap: 8 }}>
          {item.status === 'available' ? <Button variant="ghost" compact icon="trending-up" label="Boost for 7 days" loading={boost.isPending} onPress={doBoost} /> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button style={{ flex: 1 }} variant="secondary" label="Edit" icon="edit-2" onPress={() => router.push({ pathname: '/sell', params: { editId: item.id } })} />
            <Button style={{ flex: 1 }} variant="secondary" label={item.status === 'archived' ? 'Unarchive' : 'Archive'} loading={archive.isPending} onPress={toggleArchive} />
            <Button style={{ flex: 1 }} variant="danger" label="Delete" onPress={confirmDelete} />
          </View>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button style={{ flex: 1 }} variant="secondary" label="Chat" icon="message-circle" loading={chatBusy} disabled={!!profile?.is_suspended} onPress={openChat} />
            <Button
              style={{ flex: 2 }}
              label={canRequest ? cta : ctaDisabledText}
              disabled={!canRequest}
              onPress={() => router.push({ pathname: '/request/[id]', params: { id: item.id } })}
            />
          </View>
        )
      }
    >
      <View style={{ width, height: width * 0.85, backgroundColor: colors.fill }}>
        {item.images.length > 0 ? (
          <FlatList
            data={item.images}
            keyExtractor={(p) => p}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
            renderItem={({ item: path }) => (
              <Image source={{ uri: publicImageUrl('item-images', path) ?? undefined }} style={{ width, height: width * 0.85 }} contentFit="cover" />
            )}
          />
        ) : (
          <View style={styles.noImage}>
            <Icon name="image" size={40} color="placeholder" />
          </View>
        )}
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={back} style={[styles.roundBtn, { backgroundColor: colors.bg }]}>
            <Icon name="chevron-left" size={22} />
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.is_saved ? 'Remove from saved' : 'Save listing'}
            onPress={() => toggleSave.mutate({ itemId: item.id, saved: item.is_saved })}
            style={[styles.roundBtn, { backgroundColor: colors.bg }]}
          >
            <Icon name="heart" size={20} color={item.is_saved ? 'danger' : 'ink'} />
          </Pressable>
          {!isOwner ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="More options"
              onPress={() =>
                safety.open({ reportType: 'item', reportId: item.id, label: 'listing', userId: item.owner.id, userName: item.owner.display_name, onBlocked: back })
              }
              style={[styles.roundBtn, { backgroundColor: colors.bg }]}
            >
              <Icon name="more-horizontal" size={20} />
            </Pressable>
          ) : null}
          </View>
        </View>
        {item.images.length > 1 ? (
          <View style={[styles.counter, { backgroundColor: colors.overlay }]}>
            <AppText variant="caption" color="onPrimary">
              {page + 1}/{item.images.length}
            </AppText>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <View style={styles.badges}>
          <Badge label={modeLabel(item.mode)} tone="primary" />
          <Badge label={STATUS_LABEL[item.status]} tone={statusTone(item.status)} />
          <Badge label={CONDITION_LABEL[item.condition]} />
        </View>

        <AppText variant="title" style={{ marginTop: 12 }}>
          {item.title}
        </AppText>

        {offersRent ? (
          <View style={{ marginTop: 8 }}>
            <AppText variant="display" color="primaryText">
              {formatMoney(item.rent_price)}{' '}
              <AppText variant="small" color="muted">
                / semester
              </AppText>
            </AppText>
            <AppText variant="small" color="muted">
              Refundable deposit {formatMoney(item.deposit ?? 0)}
            </AppText>
          </View>
        ) : null}
        {offersSale ? (
          <AppText variant={offersRent ? 'bodyStrong' : 'display'} color={offersRent ? 'ink' : 'primaryText'} style={{ marginTop: offersRent ? 8 : 8 }}>
            {offersRent ? 'Or buy for ' : ''}
            {formatMoney(item.sale_price)}
          </AppText>
        ) : null}

        <View style={[styles.row, { borderColor: colors.border }]}>
          <Icon name="map-pin" size={16} color="muted" />
          <AppText variant="small" color="muted" style={{ flex: 1 }}>
            {item.zone_name}
            {item.distance_m !== null ? ` · ${formatDistance(item.distance_m)} from you` : ''}
          </AppText>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.owner.display_name}'s profile`}
          onPress={() => router.push({ pathname: '/user/[id]', params: { id: item.owner.id } })}
          style={[styles.owner, { borderColor: colors.border }]}
        >
          <Avatar name={item.owner.display_name} path={item.owner.avatar_path} size={44} />
          <View style={{ flex: 1 }}>
            <AppText variant="smallStrong">{item.owner.display_name}</AppText>
            <AppText variant="caption" color="muted">
              {item.owner.trust_score !== null ? `★ ${item.owner.trust_score.toFixed(1)} · ` : 'New · '}
              {item.owner.swaps_count} swaps
              {item.owner.department ? ` · ${item.owner.department}` : ''}
            </AppText>
          </View>
          <Icon name="chevron-right" size={18} color="muted" />
        </Pressable>

        {item.description ? (
          <>
            <AppText variant="heading" style={{ marginTop: 20, marginBottom: 6 }}>
              About this item
            </AppText>
            <AppText variant="body" color="muted">
              {item.description}
            </AppText>
          </>
        ) : null}

        <View style={{ marginTop: 20, flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <Icon name="info" size={16} color="muted" />
          <AppText variant="caption" color="muted" style={{ flex: 1 }}>
            UniSwap never handles money. You settle the rent, deposit or price in person at handover and return.
          </AppText>
        </View>
      </View>
      <ReportSheet target={safety.target} onClose={safety.close} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  noImage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { position: 'absolute', top: 44, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
  roundBtn: { width: TAP, height: TAP, borderRadius: TAP / 2, alignItems: 'center', justifyContent: 'center' },
  counter: { position: 'absolute', right: 16, bottom: 12, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
  body: { padding: 20 },
  badges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14, marginTop: 16, borderTopWidth: StyleSheet.hairlineWidth },
  owner: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
});
