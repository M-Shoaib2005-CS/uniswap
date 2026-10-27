import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PickedImage } from '@/lib/images';
import { useTheme } from '@/theme/ThemeProvider';
import { Chip } from './Chip';
import { AppText } from './AppText';
import { Button } from './Button';
import { Field } from './Field';
import { PhotoStrip } from './PhotoStrip';

export interface EvidenceResult {
  note: string;
  photos: PickedImage[];
  deposit: 'returned' | 'deducted' | null;
}

/** Note + up to 2 photos recorded when confirming a handover or return (FR-TRX-08/09). */
export function EvidenceSheet({
  visible,
  title,
  message,
  askDeposit,
  loading,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  message: string;
  askDeposit?: boolean; // owner confirming a return with a deposit
  loading: boolean;
  onClose: () => void;
  onSubmit: (r: EvidenceResult) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<(PickedImage & { key: string })[]>([]);
  const [deposit, setDeposit] = useState<'returned' | 'deducted'>('returned');

  useEffect(() => {
    if (visible) {
      setNote('');
      setPhotos([]);
      setDeposit('returned');
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
<KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={loading ? undefined : onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.bg, paddingBottom: Math.max(insets.bottom, 16) }]} onPress={() => undefined}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <AppText variant="title">{title}</AppText>
            <AppText variant="small" color="muted" style={{ marginTop: 4, marginBottom: 16 }}>
              {message}
            </AppText>
            <PhotoStrip
              photos={photos.map((p) => ({ key: p.key, uri: p.uri }))}
              max={2}
              onAdd={(imgs) => setPhotos((c) => [...c, ...imgs.map((i, n) => ({ ...i, key: `e${Date.now()}${n}` }))].slice(0, 2))}
              onRemove={(k) => setPhotos((c) => c.filter((p) => p.key !== k))}
            />
            <View style={{ height: 12 }} />
            <Field label="Note (optional)" value={note} onChangeText={setNote} maxLength={300} multiline placeholder="Condition, accessories included…" style={{ minHeight: 60, textAlignVertical: 'top' }} />
            {askDeposit ? (
              <View style={{ marginBottom: 16 }}>
                <AppText variant="smallStrong" style={{ marginBottom: 8 }}>
                  Deposit
                </AppText>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Chip label="Return in full" selected={deposit === 'returned'} onPress={() => setDeposit('returned')} />
                  <Chip label="Deduct (damage)" selected={deposit === 'deducted'} onPress={() => setDeposit('deducted')} />
                </View>
              </View>
            ) : null}
            <Button label="Confirm" loading={loading} onPress={() => onSubmit({ note, photos, deposit: askDeposit ? deposit : null })} />
            <Button label="Cancel" variant="ghost" disabled={loading} onPress={onClose} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </KeyboardAvoidingView>
</Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '90%' },
});
