import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { Badge, Segmented } from '@/components/Chip';
import { Button } from '@/components/Button';
import { Icon, IconName } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/features/auth/AuthProvider';
import { useTheme, ThemeMode } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

export default function ProfileScreen() {
  const { colors, mode, setMode } = useTheme();
  const { profile, session, signOut } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const logout = async () => {
    setBusy(true);
    try {
      await signOut();
    } catch {
      Alert.alert('Could not log out', 'Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <AppText variant="display" style={{ marginTop: 8, marginBottom: 16 }}>
        Profile
      </AppText>
      <View style={styles.head}>
        <Avatar name={profile?.display_name ?? '?'} path={profile?.avatar_path} size={64} />
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="title">{profile?.display_name ?? '…'}</AppText>
          <AppText variant="small" color="muted" numberOfLines={1}>
            {session?.user.email}
          </AppText>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Badge label="Verified student" tone="success" />
            {profile?.is_pro ? <Badge label={profile.founding_member ? 'Founding member' : 'Pro'} tone="primary" /> : null}
            {profile?.is_admin ? <Badge label="Admin" tone="warn" /> : null}
          </View>
        </View>
      </View>

      <View style={[styles.stats, { backgroundColor: colors.fill }]}>
        <Stat value={profile?.trust_score != null ? profile.trust_score.toFixed(1) : '–'} label="Trust score" />
        <Stat value={String(profile?.swaps_count ?? 0)} label="Swaps" />
        <Stat value={String(profile?.ratings_count ?? 0)} label="Reviews" />
      </View>

      <View style={{ marginTop: 16 }}>
        <MenuRow icon="package" label="My listings" onPress={() => router.push('/my-listings')} />
        <MenuRow icon="heart" label="Saved items" onPress={() => router.push('/saved')} />
        <MenuRow icon="star" label="My reviews" onPress={() => profile && router.push({ pathname: '/user/[id]', params: { id: profile.id } })} />
        <MenuRow icon="settings" label="Settings" onPress={() => router.push('/settings')} />
        {profile?.is_admin ? <MenuRow icon="shield" label="Admin" onPress={() => router.push('/admin')} /> : null}
      </View>

      {profile?.is_pro ? (
        <View style={[styles.pro, { backgroundColor: colors.primarySoft }]}>
          <Icon name="award" size={18} color="primaryText" />
          <AppText variant="small" color="primaryText" style={{ flex: 1 }}>
            {profile.founding_member ? 'Founding member. ' : 'Pro. '}
            Unlimited listings and photos, plus boosts
            {profile.pro_until ? ` until ${new Date(profile.pro_until).toLocaleDateString()}` : ''}.
          </AppText>
        </View>
      ) : (
        <AppText variant="caption" color="muted" style={{ marginTop: 16 }}>
          Free plan: up to 5 active listings and 40 photos.
        </AppText>
      )}

      <AppText variant="smallStrong" style={{ marginTop: 24, marginBottom: 8 }}>
        Appearance
      </AppText>
      <Segmented<ThemeMode>
        options={[
          { key: 'system', label: 'System' },
          { key: 'light', label: 'Light' },
          { key: 'dark', label: 'Dark' },
        ]}
        value={mode}
        onChange={setMode}
      />

      <View style={{ marginTop: 32 }}>
        <Button label="Log out" variant="secondary" icon="log-out" onPress={logout} loading={busy} />
      </View>
    </Screen>
  );
}

function MenuRow({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.menu}>
      <Icon name={icon} size={20} color="muted" />
      <AppText style={{ flex: 1 }}>{label}</AppText>
      <Icon name="chevron-right" size={18} color="muted" />
    </Pressable>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', paddingVertical: 12 }}>
      <AppText variant="title">{value}</AppText>
      <AppText variant="caption" color="muted">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  pro: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radius.md, marginTop: 16, alignItems: 'center' },
  menu: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 14 },
  head: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  stats: { flexDirection: 'row', borderRadius: radius.md, marginTop: 20 },
});
