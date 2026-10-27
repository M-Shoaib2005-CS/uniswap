import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { AppBar } from '@/components/AppBar';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { requestPasswordReset } from '@/features/auth/api';
import { ALLOWED_EMAIL_DOMAIN } from '@/lib/env';
import { friendlyError, normalizeEmail, validateEmail } from '@/lib/validation';

export default function Forgot() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const v = validateEmail(email, ALLOWED_EMAIL_DOMAIN);
    setError(v);
    if (v) return;
    setBusy(true);
    try {
      await requestPasswordReset(normalizeEmail(email));
      setSent(true);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <AppBar title="" onBack={() => router.back()} />
      <AppText variant="display" style={{ marginTop: 8 }}>
        Reset your password
      </AppText>
      <AppText variant="small" color="muted" style={{ marginTop: 4, marginBottom: 24 }}>
        Enter your university email and we'll send you a link to choose a new password.
      </AppText>
      {sent ? (
        <View style={{ gap: 16 }}>
          <AppText variant="body">If an account exists for that address, a reset link is on its way. Check your inbox and spam folder.</AppText>
          <Button label="Back to log in" variant="secondary" onPress={() => router.replace('/(auth)/login')} />
        </View>
      ) : (
        <>
          <Field
            label="University email"
            icon="mail"
            placeholder={`name@${ALLOWED_EMAIL_DOMAIN}`}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={email}
            onChangeText={setEmail}
            error={error}
            returnKeyType="go"
            onSubmitEditing={submit}
          />
          <Button label="Send reset link" onPress={submit} loading={busy} />
        </>
      )}
    </Screen>
  );
}
