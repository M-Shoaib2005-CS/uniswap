import { Image } from 'expo-image';
import React from 'react';

/** The UniSwap logo (same artwork as the app icon). */
export function BrandMark({ size = 44 }: { size?: number }) {
  return (
    <Image
      source={require('../../assets/icon.png')}
      accessibilityLabel="UniSwap"
      style={{ width: size, height: size, borderRadius: size * 0.22 }}
      contentFit="cover"
    />
  );
}
