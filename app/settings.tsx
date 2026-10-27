import { useRouter } from 'expo-router';
import { Linking } from 'react-native';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';
import { AppBar } from '@/components/AppBar';
import { AppText } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { OptionSheet } from '@/components/Sheets';
import { useAuth } from '@/features/auth/AuthProvider';
import { deleteMyAccount, PrefKey, uploadAvatar, useNotificationPrefs, useSetPrefs } from '@/features/profile/api';
import { useZones } from '@/features/reference/api';
import { PRIVACY_POLICY_URL } from '@/lib/env';
import { pickFromGallery } from '@/lib/images';
import { friendlyError, validateName } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, TAP } from '@/theme/tokens';

const PREF_ROWS: { key: PrefKey; label: string }[] = [
  { key: 'requests', label: 'Requests and handovers' },
  { key: 'messages', label: 'Messages' },
  { key: 'reminders', label: 'Return reminders' },
  { key: 'likes', label: 'Likes on my posts' },
  { key: 'comments', label: 'Comments on my posts' },
];

export default function Settings() {
  const { colors } = useTheme();
  const router = useRouter();
  const { profile, session, updateProfile, signOut } = useAuth();
  const me = session?.user.id ?? null;
  const zones = useZones();
  const prefs = useNotificationPrefs(me);
  const setPrefs = useSetPrefs(me);

  const [name, setName] = useState(profile?.display_name ?? '');
  const [dept, setDept] = useState(profile?.department ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [zoneOpen, setZoneOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (profile) {
      setName(profile.display_name);
      setDept(profile.department ?? '');
    }
  }, [profile?.display_name, profile?.department]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = name.trim() !== (profile?.display_name ?? '') || dept.trim() !== (profile?.department ?? '');
  const zoneName = zones.data?.find((z) => z.id === profile?.default_zone_id)?.name ?? 'Choose your zone';

  const saveProfile = async () => {
    const err = validateName(name);
    setNameError(err);
    if (err) return;
    setSaving(true);
    try {
      await updateProfile({ display_name: name.trim(), department: dept.trim() || null });
    } catch (e) {
      Alert.alert('Could not save', friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const changePhoto = async () => {
    if (!me) return;
    setPhotoBusy(true);
    try {
      const [img] = await pickFromGallery(1);
      if (!img) return;
      const path = await uploadAvatar(me, img, profile?.avatar_path ?? null);
      await updateProfile({ avatar_path: path });
    } catch (e) {
      Alert.alert('Could not change photo', friendlyError(e));
    } finally {
      setPhotoBusy(false);
    }
  };

  const pickZone = async (id: number) => {
    setZoneOpen(false);
    try {
      await updateProfile({ default_zone_id: id });
    } catch (e) {
      Alert.alert('Could not change zone', friendlyError(e));
    }
  };

  const togglePref = (key: PrefKey, value: boolean) => {
    if (!prefs.data) return;
    setPrefs.mutate({ ...prefs.data, [key]: value }, { onError: (e) => Alert.alert('Could not save', friendlyError(e)) });
  };

  const confirmDelete = () =>
    Alert.alert(
      'Delete your account?',
      'Your profile, listings, posts and messages will be permanently deleted. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete forever',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteMyAccount();
              await signOut().catch(() => undefined);
            } catch (e) {
              Alert.alert('Could not delete account', friendlyError(e));
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );

  return (
    <Screen scroll>
      <AppBar title="Settings" />

      <View style={styles.photoRow}>
        <Avatar name={profile?.display_name ?? '?'} path={profile?.avatar_path} size={72} />
        <Button compact variant="secondary" label="Change photo" icon="camera" loading={photoBusy} onPress={changePhoto} />
      </View>

      <Field label="Full name" value={name} onChangeText={(t) => { setName(t); setNameError(null); }} error={nameError} maxLength={60} autoCapitalize="words" />
      <Field label="Department (optional)" value={dept} onChangeText={setDept} maxLength={60} placeholder="e.g. Computer Science" />
      <Field label="University email" value={session?.user.email ?? ''} editable={false} helper="Your email can't be changed." />
      <Button label="Save changes" onPress={saveProfile} disabled={!dirty} loading={saving} />

      <AppText variant="smallStrong" style={styles.section}>
        Campus zone
      </AppText>
      <Pressable accessibilityRole="button" accessibilityLabel={`Campus zone: ${zoneName}`} onPress={() => setZoneOpen(true)} style={[styles.pick, { backgroundColor: colors.fill }]}>
        <Icon name="map-pin" size={18} color="muted" />
        <AppText style={{ flex: 1 }}>{zoneName}</AppText>
        <Icon name="chevron-down" size={18} color="muted" />
      </Pressable>

      <AppText variant="smallStrong" style={styles.section}>
        Notifications
      </AppText>
      {PREF_ROWS.map((r) => (
        <View key={r.key} style={styles.prefRow}>
          <AppText style={{ flex: 1 }}>{r.label}</AppText>
          <Switch
            accessibilityLabel={r.label}
            value={prefs.data?.[r.key] ?? true}
            disabled={!prefs.data}
            onValueChange={(v) => togglePref(r.key, v)}
            trackColor={{ true: colors.primary, false: colors.border }}
          />
        </View>
      ))}

      <AppText variant="smallStrong" style={styles.section}>
        Privacy
      </AppText>
      <Pressable accessibilityRole="button" onPress={() => router.push('/blocked')} style={styles.linkRow}>
        <Icon name="slash" size={18} color="muted" />
        <AppText style={{ flex: 1 }}>Blocked users</AppText>
        <Icon name="chevron-right" size={18} color="muted" />
      </Pressable>
      {PRIVACY_POLICY_URL ? (
        <Pressable accessibilityRole="link" onPress={() => Linking.openURL(PRIVACY_POLICY_URL).catch(() => undefined)} style={styles.linkRow}>
          <Icon name="file-text" size={18} color="muted" />
          <AppText style={{ flex: 1 }}>Privacy policy</AppText>
          <Icon name="external-link" size={18} color="muted" />
        </Pressable>
      ) : null}

      <View style={{ marginTop: 32 }}>
        <Button label="Delete my account" variant="danger" loading={deleting} onPress={confirmDelete} />
      </View>

      <OptionSheet
        visible={zoneOpen}
        title="Campus zone"
        subtitle="Distances are measured from here"
        searchable
        options={(zones.data ?? []).map((z) => ({ id: z.id, label: z.name, sublabel: z.category }))}
        selectedId={profile?.default_zone_id ?? null}
        loading={zones.isLoading}
        onClose={() => setZoneOpen(false)}
        onPick={(id) => pickZone(id as number)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginVertical: 16 },
  section: { marginTop: 28, marginBottom: 8 },
  pick: { minHeight: TAP + 4, borderRadius: radius.md, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  prefRow: { minHeight: TAP + 4, flexDirection: 'row', alignItems: 'center', gap: 12 },
  linkRow: { minHeight: TAP + 4, flexDirection: 'row', alignItems: 'center', gap: 12 },
});
