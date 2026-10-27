import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { setNewPassword } from '@/features/auth/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { friendlyError, validatePassword } from '@/lib/validation';

export default function ResetPassword() {
  const router = useRouter();
  const { clearRecovery } = useAuth();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const v = validatePassword(pw);
    if (v) return setError(v);
    if (pw !== pw2) return setError('The two passwords do not match');
    setError(null);
    setBusy(true);
    try {
      await setNewPassword(pw);
      clearRecovery();
      router.replace('/(tabs)');
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <AppText variant="display" style={{ marginTop: 48 }}>
        Choose a new password
      </AppText>
      <AppText variant="small" color="muted" style={{ marginTop: 4, marginBottom: 24 }}>
        You'll use it the next time you log in.
      </AppText>
      <Field label="New password" icon="lock" secure value={pw} onChangeText={setPw} placeholder="At least 8 characters" autoComplete="new-password" />
      <Field label="Confirm password" icon="lock" secure value={pw2} onChangeText={setPw2} placeholder="Repeat the password" error={error} returnKeyType="go" onSubmitEditing={submit} />
      <Button label="Save password" onPress={submit} loading={busy} />
    </Screen>
  );
}
