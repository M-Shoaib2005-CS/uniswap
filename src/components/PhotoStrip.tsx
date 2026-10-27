import { Image } from 'expo-image';
import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { PickedImage, pickFromGallery, takePhoto } from '@/lib/images';
import { publicImageUrl } from '@/lib/supabase';
import { friendlyError } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';

export interface StripPhoto {
  key: string;
  uri: string; // local file or public URL
}

/** Row of photo thumbnails with an Add tile. Used by the sell form and the feed composer. */
export function PhotoStrip({
  photos,
  max,
  onAdd,
  onRemove,
  size = 84,
}: {
  photos: StripPhoto[];
  max: number;
  onAdd: (imgs: PickedImage[]) => void;
  onRemove: (key: string) => void;
  size?: number;
}) {
  const { colors } = useTheme();

  const add = () => {
    const room = max - photos.length;
    if (room <= 0) return;
    Alert.alert('Add photo', undefined, [
      {
        text: 'Take a photo',
        onPress: async () => {
          try {
            const p = await takePhoto();
            if (p) onAdd([p]);
          } catch (e) {
            Alert.alert('Camera', friendlyError(e));
          }
        },
      },
      {
        text: 'Choose from gallery',
        onPress: async () => {
          try {
            const picked = await pickFromGallery(room);
            if (picked.length) onAdd(picked);
          } catch (e) {
            Alert.alert('Gallery', friendlyError(e));
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
      {photos.length < max ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add photo"
          onPress={add}
          style={[styles.tile, { width: size, height: size, borderColor: colors.border }]}
        >
          <Icon name="camera" size={22} color="muted" />
          <AppText variant="caption" color="muted">
            Add
          </AppText>
        </Pressable>
      ) : null}
      {photos.map((p, i) => (
        <View key={p.key} style={{ width: size, height: size }}>
          <Image source={{ uri: p.uri }} style={{ width: size, height: size, borderRadius: radius.md }} contentFit="cover" />
          {i === 0 ? (
            <View style={[styles.cover, { backgroundColor: colors.overlay }]}>
              <AppText variant="caption" color="onPrimary">
                Cover
              </AppText>
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove photo"
            hitSlop={8}
            onPress={() => onRemove(p.key)}
            style={[styles.remove, { backgroundColor: colors.bg, borderColor: colors.border }]}
          >
            <Icon name="x" size={14} />
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

export function storagePhotoUrl(path: string): string {
  return publicImageUrl('item-images', path) ?? '';
}

const styles = StyleSheet.create({
  tile: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', gap: 2 },
  cover: { position: 'absolute', left: 6, bottom: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.full },
  remove: { position: 'absolute', top: -6, right: -6, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});
