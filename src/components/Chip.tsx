import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { FONT, radius, TAP } from '@/theme/tokens';
import { AppText } from './AppText';

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: selected ? colors.ink : colors.fill, minHeight: TAP - 8 }]}
    >
      <AppText variant="smallStrong" color={selected ? 'bg' : 'ink'}>
        {label}
      </AppText>
    </Pressable>
  );
}

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warn' | 'danger';

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const { colors } = useTheme();
  const map = {
    neutral: [colors.fill, 'muted'],
    primary: [colors.primarySoft, 'primaryText'],
    success: [colors.successSoft, 'success'],
    warn: [colors.warnSoft, 'warn'],
    danger: [colors.dangerSoft, 'danger'],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <AppText variant="caption" color={fg} style={{ fontFamily: FONT.semibold }}>
        {label}
      </AppText>
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (k: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.seg, { backgroundColor: colors.fill }]} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.key)}
            style={[styles.segItem, active && { backgroundColor: colors.bg }]}
          >
            <AppText variant="smallStrong" color={active ? 'ink' : 'muted'}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 14, borderRadius: radius.full, justifyContent: 'center', alignItems: 'center' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full, alignSelf: 'flex-start' },
  seg: { flexDirection: 'row', borderRadius: radius.md, padding: 3 },
  segItem: { flex: 1, minHeight: TAP - 8, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md - 3 },
});
