import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ReportReason, ReportType, REPORT_REASONS, useSubmitReport } from '@/features/safety/api';
import { friendlyError } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, TAP } from '@/theme/tokens';
import { AppText } from './AppText';
import { Button } from './Button';
import { Field } from './Field';
import { Icon } from './Icon';

export interface ReportTarget {
  type: ReportType;
  id: string;
  label: string; // what is being reported, shown in the title
}

/** Reason picker + optional details. Reports go to the admin queue (FR-MOD). */
export function ReportSheet({ target, onClose }: { target: ReportTarget | null; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const submit = useSubmitReport();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');

  useEffect(() => {
    if (target) {
      setReason(null);
      setDetails('');
    }
  }, [target]);

  const send = () => {
    if (!target || !reason) return;
    submit.mutate(
      { type: target.type, target: target.id, reason, details },
      {
        onSuccess: () => {
          onClose();
          Alert.alert('Report sent', 'Thanks. A moderator will review it.');
        },
        onError: (e) => Alert.alert('Could not send report', friendlyError(e)),
      },
    );
  };

  return (
    <Modal visible={!!target} transparent animationType="slide" onRequestClose={onClose}>
<KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={submit.isPending ? undefined : onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.bg, paddingBottom: Math.max(insets.bottom, 16) }]} onPress={() => undefined}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <AppText variant="title">Report {target?.label ?? ''}</AppText>
            <AppText variant="small" color="muted" style={{ marginTop: 4, marginBottom: 8 }}>
              Why are you reporting this?
            </AppText>
            {REPORT_REASONS.map((r) => (
              <Pressable key={r.key} accessibilityRole="radio" accessibilityState={{ selected: reason === r.key }} onPress={() => setReason(r.key)} style={styles.row}>
                <AppText style={{ flex: 1 }}>{r.label}</AppText>
                <Icon name={reason === r.key ? 'check-circle' : 'circle'} size={20} color={reason === r.key ? 'primaryText' : 'placeholder'} />
              </Pressable>
            ))}
            <View style={{ height: 8 }} />
            <Field label="Details (optional)" value={details} onChangeText={setDetails} maxLength={500} multiline style={{ minHeight: 60, textAlignVertical: 'top' }} />
            <Button label="Send report" disabled={!reason} loading={submit.isPending} onPress={send} />
            <Button label="Cancel" variant="ghost" disabled={submit.isPending} onPress={onClose} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </KeyboardAvoidingView>
</Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.lg + 4, borderTopRightRadius: radius.lg + 4, padding: 20, maxHeight: '90%' },
  row: { minHeight: TAP + 4, flexDirection: 'row', alignItems: 'center', gap: 12 },
});
