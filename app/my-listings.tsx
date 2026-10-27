import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { AppBar } from '@/components/AppBar';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Chip';
import { statusTone, priceLine } from '@/components/ListingCards';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, Skeleton } from '@/components/States';
import { useAuth } from '@/features/auth/AuthProvider';
import { useMyItems } from '@/features/profile/api';
import { publicImageUrl } from '@/lib/supabase';
import { friendlyError } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { STATUS_LABEL } from '@/types/models';

export default function MyListings() {
  const { colors } = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const q = useMyItems(session?.user.id ?? null);

  return (
    <Screen padded={false}>
      <AppBar title="My listings" />
      {q.isLoading ? (
        <View style={{ padding: 20, gap: 12 }}>
          <Skeleton style={{ height: 84 }} />
          <Skeleton style={{ height: 84 }} />
        </View>
      ) : q.isError ? (
        <ErrorState message={friendlyError(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 20, gap: 12, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.primary} />}
          ListEmptyComponent={<EmptyState icon="package" title="You have no listings" message="Tap the + button to rent out or sell something." actionLabel="Create listing" onAction={() => router.push('/sell')} />}
          renderItem={({ item: i }) => {
            const cover = [...(i.images ?? [])].sort((a, b) => a.position - b.position)[0]?.path;
            const uri = publicImageUrl('item-images', cover);
            return (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/listing/[id]', params: { id: i.id } })}
                style={[styles.card, { borderColor: colors.border }]}
              >
                <View style={[styles.thumb, { backgroundColor: colors.fill }]}>{uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}</View>
                <View style={{ flex: 1, gap: 4 }}>
                  <AppText variant="smallStrong" numberOfLines={2}>
                    {i.title}
                  </AppText>
                  <AppText variant="smallStrong" color="primaryText">
                    {priceLine({ mode: i.mode, rent_price: i.rent_price, sale_price: i.sale_price })}
                  </AppText>
                  <Badge label={STATUS_LABEL[i.status]} tone={statusTone(i.status)} />
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: 12, padding: 12, borderWidth: 1, borderRadius: radius.lg, alignItems: 'center' },
  thumb: { width: 72, height: 72, borderRadius: radius.md, overflow: 'hidden' },
});
