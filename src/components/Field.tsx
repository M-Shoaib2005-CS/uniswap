import React, { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, TextInputProps, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { FONT, radius, TAP } from '@/theme/tokens';
import { AppText } from './AppText';
import { Icon, IconName } from './Icon';

interface Props extends TextInputProps {
  label: string;
  error?: string | null;
  helper?: string;
  icon?: IconName;
  secure?: boolean; // password field with show/hide toggle
}

export type InputHandle = React.ComponentRef<typeof TextInput>;

export const Field = forwardRef<InputHandle, Props>(function Field({ label, error, helper, icon, secure, style, ...rest }, ref) {
  const { colors } = useTheme();
  const [hidden, setHidden] = useState(!!secure);
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrap}>
      <AppText variant="smallStrong" style={styles.label}>
        {label}
      </AppText>
      <View
        style={[
          styles.box,
          { backgroundColor: colors.fill, borderColor: error ? colors.danger : focused ? colors.primary : 'transparent' },
        ]}
      >
        {icon ? <Icon name={icon} size={18} color="muted" /> : null}
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={colors.placeholder}
          secureTextEntry={hidden}
          autoCapitalize={secure ? 'none' : rest.autoCapitalize}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          {...rest}
          style={[styles.input, { color: colors.ink, fontFamily: FONT.regular }, style]}
        />
        {secure ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            hitSlop={12}
            onPress={() => setHidden((h) => !h)}
          >
            <Icon name={hidden ? 'eye' : 'eye-off'} size={18} color="muted" />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <AppText variant="caption" color="danger" style={styles.msg}>
          {error}
        </AppText>
      ) : helper ? (
        <AppText variant="caption" color="muted" style={styles.msg}>
          {helper}
        </AppText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  label: { marginBottom: 6 },
  box: {
    minHeight: TAP + 4,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: { flex: 1, fontSize: 16, paddingVertical: 10 },
  msg: { marginTop: 4 },
});
