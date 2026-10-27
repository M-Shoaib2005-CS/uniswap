import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';

interface Props {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Content pinned to the bottom (primary action bars). */
  footer?: React.ReactNode;
  edges?: { top?: boolean; bottom?: boolean };
}

export function Screen({ children, scroll, padded = true, style, footer, edges }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const top = edges?.top === false ? 0 : insets.top;
  const bottom = edges?.bottom === false ? 0 : insets.bottom;

  const body = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[padded && styles.padded, { paddingBottom: 24 }, style]}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, padded && styles.padded, style]}>{children}</View>
  );

  return (
    <KeyboardAvoidingView style={[styles.flex, { backgroundColor: colors.bg, paddingTop: top }]} behavior="padding">
      {body}
      {footer ? (
        <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.bg, paddingBottom: Math.max(bottom, 12) }]}>{footer}</View>
      ) : (
        <View style={{ height: bottom }} />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  padded: { paddingHorizontal: 20 },
  footer: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
