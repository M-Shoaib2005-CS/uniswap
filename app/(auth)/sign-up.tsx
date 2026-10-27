import { Link, useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import { AppText } from '@/components/AppText';
import { BrandMark } from '@/components/BrandMark';
import { Button } from '@/components/Button';
import { Field, InputHandle } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { signUp } from '@/features/auth/api';
import { pendingCredentials } from '@/features/auth/pending';
import { ALLOWED_EMAIL_DOMAIN } from '@/lib/env';
import { friendlyError, normalizeEmail, validateEmail, validateName, validatePassword } from '@/lib/validation';

export default function SignUp() {
  const router = useRouter();
  const emailRef = useRef<InputHandle>(null);
  const pwRef = useRef<InputHandle>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ name?: string | null; email?: string | null; password?: string | null; form?: string | null }>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const next = {
      name: validateName(name),
      email: validateEmail(email, ALLOWED_EMAIL_DOMAIN),
      password: validatePassword(password),
    };
    setErrors(next);
    if (next.name || next.email || next.password) return;

    setBusy(true);
    try {
      const e = normalizeEmail(email);
      const res = await signUp({ email: e, password, fullName: name.trim() });
      if (res.alreadyRegistered) {
        setErrors({ email: 'This email is already registered. Try logging in.' });
        return;
      }
      if (res.needsVerification) {
        pendingCredentials.set(e, password);
        router.replace({ pathname: '/(auth)/verify', params: { email: e } });
      }
      // If email confirmation is switched off in Supabase the session exists and the gate continues to Home.
    } catch (err) {
      setErrors({ form: friendlyError(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <View style={{ height: 32 }} />
      <BrandMark />
      <AppText variant="display" style={{ marginTop: 20 }}>
        Create your account
      </AppText>
      <AppText variant="small" color="muted" style={{ marginTop: 4, marginBottom: 24 }}>
        Use your university email so we know you're a student on campus.
      </AppText>

      <Field
        label="Full name"
        placeholder="Muhammad Shoaib"
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        value={name}
        onChangeText={setName}
        error={errors.name}
        returnKeyType="next"
        onSubmitEditing={() => emailRef.current?.focus()}
      />
      <Field
        ref={emailRef}
        label="University email"
        icon="mail"
        placeholder={`name@${ALLOWED_EMAIL_DOMAIN}`}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        helper={`Only @${ALLOWED_EMAIL_DOMAIN} addresses can register.`}
        returnKeyType="next"
        onSubmitEditing={() => pwRef.current?.focus()}
      />
      <Field
        ref={pwRef}
        label="Password"
        icon="lock"
        secure
        placeholder="At least 8 characters"
        autoComplete="new-password"
        textContentType="newPassword"
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        helper="Use letters and numbers."
        returnKeyType="go"
        onSubmitEditing={submit}
      />

      {errors.form ? (
        <AppText variant="small" color="danger" style={{ marginBottom: 12 }}>
          {errors.form}
        </AppText>
      ) : null}

      <Button label="Create account" onPress={submit} loading={busy} />

      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 24, gap: 4 }}>
        <AppText variant="small" color="muted">
          Already have an account?
        </AppText>
        <Link href="/(auth)/login">
          <AppText variant="smallStrong" color="primaryText">
            Log in
          </AppText>
        </Link>
      </View>
    </Screen>
  );
}
