import { Feather } from '@expo/vector-icons';
import React from 'react';
import { useTheme } from '@/theme/ThemeProvider';
import { Palette } from '@/theme/tokens';

export type IconName = React.ComponentProps<typeof Feather>['name'];

export function Icon({ name, size = 20, color = 'ink' }: { name: IconName; size?: number; color?: keyof Palette }) {
  const { colors } = useTheme();
  return <Feather name={name} size={size} color={colors[color]} />;
}
