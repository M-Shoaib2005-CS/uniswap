import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { initials } from '@/lib/format';
import { publicImageUrl } from '@/lib/supabase';
import { useTheme } from '@/theme/ThemeProvider';
import { AppText } from './AppText';

export function Avatar({ name, path, size = 40 }: { name: string; path?: string | null; size?: number }) {
  const { colors } = useTheme();
  const uri = publicImageUrl('avatars', path);
  return (
    <View style={[styles.box, { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primarySoft }]}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" accessibilityLabel={name} />
      ) : (
        <AppText variant={size >= 56 ? 'title' : 'smallStrong'} color="primaryText">
          {initials(name)}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ box: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' } });
