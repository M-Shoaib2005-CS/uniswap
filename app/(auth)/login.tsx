import { Link, useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Field, InputHandle } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { BrandMark } from '@/components/BrandMark';
import { signIn } from '@/features/auth/api';
import { pendingCredentials } from '@/features/auth/pending';
import { ALLOWED_EMAIL_DOMAIN } from '@/lib/env';
import { friendlyError, normalizeEmail } from '@/lib/validation';

export default function Login() {
  const router = useRouter();
  const pwRef = useRef<InputHandle>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    const e = normalizeEmail(email);
    if (!e || !password) {
      setError('Enter your email and password');
      return;
    }
    setBusy(true);
    try {
      await signIn(e, password);
      pendingCredentials.clear();
      // The auth gate in the root layout moves the user to the home tabs.
    } catch (err) {
      const msg = friendlyError(err);
      if (msg.toLowerCase().includes('verify your email')) {
        pendingCredentials.set(e, password);
        router.push({ pathname: '/(auth)/verify', params: { email: e } });
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <View style={{ height: 40 }} />
      <BrandMark />
      <AppText variant="display" style={{ marginTop: 20 }}>
        Welcome back
      </AppText>
      <AppText variant="small" color="muted" style={{ marginTop: 4, marginBottom: 24 }}>
        Log in to rent, buy and sell on campus.
      </AppText>

      <Field
        label="University email"
        icon="mail"
        placeholder={`name@${ALLOWED_EMAIL_DOMAIN}`}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        textContentType="emailAddress"
        value={email}
        onChangeText={setEmail}
        returnKeyType="next"
        onSubmitEditing={() => pwRef.current?.focus()}
      />
      <Field
        ref={pwRef}
        label="Password"
        icon="lock"
        secure
        placeholder="Your password"
        autoComplete="password"
        textContentType="password"
        value={password}
        onChangeText={setPassword}
        returnKeyType="go"
        onSubmitEditing={submit}
        error={error}
      />
      <Link href="/(auth)/forgot" style={{ alignSelf: 'flex-end', marginBottom: 20 }}>
        <AppText variant="smallStrong" color="primaryText">
          Forgot password?
        </AppText>
      </Link>

      <Button label="Log in" onPress={submit} loading={busy} />

      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 24, gap: 4 }}>
        <AppText variant="small" color="muted">
          New to UniSwap?
        </AppText>
        <Link href="/(auth)/sign-up">
          <AppText variant="smallStrong" color="primaryText">
            Create an account
          </AppText>
        </Link>
      </View>
    </Screen>
  );
}
