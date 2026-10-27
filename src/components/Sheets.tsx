import React, { useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { FONT, radius, TAP } from '@/theme/tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';

export interface SheetOption {
  id: number | string;
  label: string;
  sublabel?: string;
}

/** Bottom sheet with a list of options and an optional search box. */
export function OptionSheet({
  visible,
  title,
  subtitle,
  options,
  selectedId,
  onPick,
  onClose,
  searchable,
  loading,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  options: SheetOption[];
  selectedId: number | string | null;
  onPick: (id: number | string) => void;
  onClose: () => void;
  searchable?: boolean;
  loading?: boolean;
}) {
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const filtered = options.filter((o) => o.label.toLowerCase().includes(text.trim().toLowerCase()));
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
<KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.bg }]} onPress={() => undefined}>
          <AppText variant="title">{title}</AppText>
          {subtitle ? (
            <AppText variant="small" color="muted" style={{ marginTop: 2 }}>
              {subtitle}
            </AppText>
          ) : null}
          {searchable ? (
            <View style={[styles.search, { backgroundColor: colors.fill }]}>
              <Icon name="search" size={18} color="muted" />
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="Search"
                placeholderTextColor={colors.placeholder}
                accessibilityLabel={`Search ${title}`}
                style={{ flex: 1, color: colors.ink, fontFamily: FONT.regular, fontSize: 16 }}
              />
            </View>
          ) : (
            <View style={{ height: 8 }} />
          )}
          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ margin: 24 }} />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(o) => String(o.id)}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <AppText variant="small" color="muted" center style={{ padding: 24 }}>
                  Nothing matches.
                </AppText>
              }
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setText('');
                    onPick(item.id);
                  }}
                  style={styles.row}
                >
                  <View style={{ flex: 1 }}>
                    <AppText variant="body">{item.label}</AppText>
                    {item.sublabel ? (
                      <AppText variant="caption" color="muted">
                        {item.sublabel}
                      </AppText>
                    ) : null}
                  </View>
                  {selectedId === item.id ? <Icon name="check" size={18} color="primaryText" /> : null}
                </Pressable>
              )}
            />
          )}
        </Pressable>
      </Pressable>
    </KeyboardAvoidingView>
</Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32, maxHeight: '80%' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: TAP + 4, borderRadius: radius.md, paddingHorizontal: 12, marginVertical: 12 },
  row: { minHeight: TAP + 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
