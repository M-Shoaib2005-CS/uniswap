import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { TAP } from '@/theme/tokens';
import { AppText } from './AppText';
import { Icon, IconName } from './Icon';

export function IconButton({ name, onPress, label, size = 22 }: { name: IconName; onPress: () => void; label: string; size?: number }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6} style={styles.iconBtn}>
      <Icon name={name} size={size} />
    </Pressable>
  );
}

export function AppBar({ title, onBack, right, closeIcon }: { title?: string; onBack?: () => void; right?: React.ReactNode; closeIcon?: boolean }) {
  const router = useRouter();
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/(tabs)')));
  return (
    <View style={styles.bar}>
      <IconButton name={closeIcon ? 'x' : 'chevron-left'} label={closeIcon ? 'Close' : 'Go back'} onPress={back} size={24} />
      <AppText variant="heading" numberOfLines={1} style={styles.title}>
        {title ?? ''}
      </AppText>
      <View style={styles.right}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', height: 52, paddingHorizontal: 8 },
  iconBtn: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center' },
  right: { minWidth: TAP, alignItems: 'flex-end' },
});
