import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { TAP } from '@/theme/tokens';
import { AppText } from './AppText';
import { Button } from './Button';
import { Field } from './Field';
import { Icon } from './Icon';

export function ReviewSheet({
  visible,
  name,
  loading,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  name: string;
  loading: boolean;
  onClose: () => void;
  onSubmit: (rating: number, comment: string) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  useEffect(() => {
    if (visible) {
      setRating(0);
      setComment('');
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
<KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={loading ? undefined : onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.bg, paddingBottom: Math.max(insets.bottom, 16) }]} onPress={() => undefined}>
          <AppText variant="title">Rate {name}</AppText>
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`} accessibilityState={{ selected: rating === n }} onPress={() => setRating(n)} style={styles.star}>
                <Icon name="star" size={32} color={n <= rating ? 'warn' : 'placeholder'} />
              </Pressable>
            ))}
          </View>
          <Field label="Comment (optional)" value={comment} onChangeText={setComment} maxLength={300} multiline style={{ minHeight: 60, textAlignVertical: 'top' }} />
          <Button label="Submit review" disabled={rating === 0} loading={loading} onPress={() => onSubmit(rating, comment)} />
          <Button label="Not now" variant="ghost" disabled={loading} onPress={onClose} />
        </Pressable>
      </Pressable>
    </KeyboardAvoidingView>
</Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 4, marginVertical: 16 },
  star: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center' },
});
