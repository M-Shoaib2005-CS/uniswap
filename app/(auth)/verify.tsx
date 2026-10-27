import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { resendVerification, signIn } from '@/features/auth/api';
import { pendingCredentials } from '@/features/auth/pending';
import { friendlyError } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';

const COOLDOWN = 60;

export default function Verify() {
  const { colors } = useTheme();
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email?: string }>();
  const address = typeof email === 'string' ? email : '';
  const [cooldown, setCooldown] = useState(0);
  const [msg, setMsg] = useState<{ text: string; tone: 'muted' | 'danger' | 'success' } | null>(null);
  const [resending, setResending] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const resend = async () => {
    setResending(true);
    setMsg(null);
    try {
      await resendVerification(address);
      setCooldown(COOLDOWN);
      setMsg({ text: 'We sent a new link. Check your inbox and spam folder.', tone: 'success' });
    } catch (e) {
      setMsg({ text: friendlyError(e), tone: 'danger' });
    } finally {
      setResending(false);
    }
  };

  const continueAfterVerify = async () => {
    const creds = pendingCredentials.get();
    if (!creds) {
      router.replace('/(auth)/login');
      return;
    }
    setChecking(true);
    setMsg(null);
    try {
      await signIn(creds.email, creds.password);
      pendingCredentials.clear();
    } catch (e) {
      const text = friendlyError(e);
      setMsg({ text: text.toLowerCase().includes('verify your email') ? "We can't see your verification yet. Open the link in the email first." : text, tone: 'danger' });
    } finally {
      setChecking(false);
    }
  };

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="mail" size={30} color="primaryText" />
        </View>
        <AppText variant="display" center style={{ marginTop: 24 }}>
          Check your inbox
        </AppText>
        <AppText variant="small" color="muted" center style={{ marginTop: 8, maxWidth: 300 }}>
          We sent a verification link to {address || 'your university email'}. Open it to start posting and requesting items.
        </AppText>

        <View style={{ alignSelf: 'stretch', marginTop: 32, gap: 12 }}>
          <Button label="Open email app" icon="external-link" onPress={() => Linking.openURL('mailto:').catch(() => undefined)} />
          <Button label="I've verified, continue" variant="secondary" onPress={continueAfterVerify} loading={checking} />
          <Button
            label={cooldown > 0 ? `Resend link in ${cooldown}s` : 'Resend link'}
            variant="ghost"
            onPress={resend}
            loading={resending}
            disabled={cooldown > 0 || !address}
          />
        </View>

        {msg ? (
          <AppText variant="small" color={msg.tone} center style={{ marginTop: 12 }}>
            {msg.text}
          </AppText>
        ) : null}

        <AppText variant="caption" color="muted" center style={{ marginTop: 24 }} onPress={() => router.replace('/(auth)/sign-up')}>
          Wrong email? Change it
        </AppText>
      </View>
    </Screen>
  );
}
