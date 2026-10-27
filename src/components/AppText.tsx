import React from 'react';
import { Text, TextProps } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Palette, textStyles, TextVariant } from '@/theme/tokens';

interface Props extends TextProps {
  variant?: TextVariant;
  color?: keyof Palette;
  center?: boolean;
}

export function AppText({ variant = 'body', color = 'ink', center, style, ...rest }: Props) {
  const { colors } = useTheme();
  return <Text {...rest} style={[textStyles[variant], { color: colors[color] }, center && { textAlign: 'center' }, style]} />;
}
