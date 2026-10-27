import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { AppBar } from '@/components/AppBar';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip, Segmented } from '@/components/Chip';
import { Field } from '@/components/Field';
import { Icon } from '@/components/Icon';
import { PhotoStrip, storagePhotoUrl } from '@/components/PhotoStrip';
import { Screen } from '@/components/Screen';
import { OptionSheet } from '@/components/Sheets';
import { ErrorState, Skeleton } from '@/components/States';
import { useAuth } from '@/features/auth/AuthProvider';
import { useItem } from '@/features/listings/api';
import { PhotoDraft, useSaveListing } from '@/features/listings/manage';
import { hasErrors, ListingErrors, ListingForm, MAX_PHOTOS, validateListing } from '@/features/listings/validation';
import { useCategories, useZones } from '@/features/reference/api';
import { PickedImage } from '@/lib/images';
import { friendlyError } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, TAP } from '@/theme/tokens';
import { CONDITION_LABEL, Condition, ListingMode } from '@/types/models';

const EMPTY: ListingForm = {
  title: '',
  description: '',
  categoryId: null,
  condition: 'good',
  mode: 'rent',
  rentPrice: '',
  deposit: '0',
  salePrice: '',
  zoneId: null,
};

let keySeq = 0;
const nextKey = () => `p${++keySeq}`;

export default function Sell() {
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { session, profile } = useAuth();
  const userId = session?.user.id ?? null;
  const zones = useZones();
  const cats = useCategories();
  const existing = useItem(editId, profile?.default_zone_id ?? null, userId);
  const save = useSaveListing();

  const [form, setForm] = useState<ListingForm>({ ...EMPTY, zoneId: profile?.default_zone_id ?? null });
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [original, setOriginal] = useState<string[]>([]);
  const [errors, setErrors] = useState<ListingErrors>({});
  const [sheet, setSheet] = useState<'cat' | 'zone' | null>(null);
  const [loaded, setLoaded] = useState(!editId);

  // fill the form once when editing
  useEffect(() => {
    const it = existing.data;
    if (!editId || loaded || !it) return;
    setForm({
      title: it.title,
      description: it.description,
      categoryId: (cats.data ?? []).find((c) => c.name === it.category_name)?.id ?? null,
      condition: it.condition,
      mode: it.mode,
      rentPrice: it.rent_price?.toString() ?? '',
      deposit: it.deposit?.toString() ?? '0',
      salePrice: it.sale_price?.toString() ?? '',
      zoneId: it.zone_id,
    });
    setPhotos(it.images.map((path) => ({ key: nextKey(), kind: 'existing', path })));
    setOriginal(it.images);
    setLoaded(true);
  }, [editId, existing.data, cats.data, loaded]);

  const set = <K extends keyof ListingForm>(k: K, v: ListingForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const stripPhotos = useMemo(
    () => photos.map((p) => ({ key: p.key, uri: p.kind === 'existing' ? storagePhotoUrl(p.path) : p.image.uri })),
    [photos],
  );

  const addPhotos = (imgs: PickedImage[]) => {
    setPhotos((cur) => [...cur, ...imgs.map((image) => ({ key: nextKey(), kind: 'new' as const, image }))].slice(0, MAX_PHOTOS));
    setErrors((e) => ({ ...e, photos: undefined }));
  };

  const submit = async () => {
    const errs = validateListing(form, photos.length);
    setErrors(errs);
    if (hasErrors(errs) || !userId) return;
    try {
      const id = await save.mutateAsync({ userId, editId: editId ?? null, form, photos, originalPaths: original });
      router.replace({ pathname: '/listing/[id]', params: { id } });
    } catch (e) {
      Alert.alert('Could not publish', friendlyError(e));
    }
  };

  if (editId && existing.isError) {
    return (
      <Screen>
        <AppBar title="Edit listing" closeIcon />
        <ErrorState message="Check your connection and try again." onRetry={() => existing.refetch()} />
      </Screen>
    );
  }
  if (!loaded) {
    return (
      <Screen>
        <AppBar title="Edit listing" closeIcon />
        <Skeleton style={{ height: 200 }} />
      </Screen>
    );
  }

  const rent = form.mode === 'rent' || form.mode === 'both';
  const sale = form.mode === 'sell' || form.mode === 'both';
  const catName = cats.data?.find((c) => c.id === form.categoryId)?.name;
  const zoneName = zones.data?.find((z) => z.id === form.zoneId)?.name;

  return (
    <Screen
      scroll
      footer={<Button label={editId ? 'Save changes' : 'Publish listing'} onPress={submit} loading={save.isPending} />}
    >
      <AppBar title={editId ? 'Edit listing' : 'New listing'} closeIcon />

      <AppText variant="smallStrong" style={styles.label}>
        Photos ({photos.length}/{MAX_PHOTOS})
      </AppText>
      <PhotoStrip photos={stripPhotos} max={MAX_PHOTOS} onAdd={addPhotos} onRemove={(k) => setPhotos((c) => c.filter((p) => p.key !== k))} />
      {errors.photos ? (
        <AppText variant="caption" color="danger" style={{ marginTop: 4 }}>
          {errors.photos}
        </AppText>
      ) : (
        <AppText variant="caption" color="muted" style={{ marginTop: 4 }}>
          The first photo is the cover. Photos are compressed on your phone.
        </AppText>
      )}

      <View style={{ height: 16 }} />
      <Field label="Title" value={form.title} onChangeText={(t) => set('title', t)} error={errors.title} maxLength={80} placeholder="e.g. Scientific calculator fx-991ES" />
      <Field
        label="Description (optional)"
        value={form.description}
        onChangeText={(t) => set('description', t)}
        error={errors.description}
        multiline
        maxLength={1000}
        placeholder="Condition details, what is included…"
        style={{ minHeight: 80, textAlignVertical: 'top' }}
      />

      <Picker label="Category" value={catName} error={errors.categoryId} onPress={() => setSheet('cat')} />

      <AppText variant="smallStrong" style={styles.label}>
        Condition
      </AppText>
      <View style={styles.chips}>
        {(Object.keys(CONDITION_LABEL) as Condition[]).map((c) => (
          <Chip key={c} label={CONDITION_LABEL[c]} selected={form.condition === c} onPress={() => set('condition', c)} />
        ))}
      </View>

      <AppText variant="smallStrong" style={[styles.label, { marginTop: 16 }]}>
        I want to
      </AppText>
      <Segmented<ListingMode>
        value={form.mode}
        onChange={(m) => set('mode', m)}
        options={[
          { key: 'rent', label: 'Rent out' },
          { key: 'sell', label: 'Sell' },
          { key: 'both', label: 'Both' },
        ]}
      />
      <View style={{ height: 16 }} />
      {rent ? (
        <>
          <Field label="Rent per semester (Rs)" value={form.rentPrice} onChangeText={(t) => set('rentPrice', t)} error={errors.rentPrice} keyboardType="number-pad" placeholder="500" />
          <Field label="Deposit (Rs)" value={form.deposit} onChangeText={(t) => set('deposit', t)} error={errors.deposit} keyboardType="number-pad" helper="Returned when the item comes back in good shape." />
        </>
      ) : null}
      {sale ? <Field label="Sale price (Rs)" value={form.salePrice} onChangeText={(t) => set('salePrice', t)} error={errors.salePrice} keyboardType="number-pad" placeholder="1500" /> : null}

      <Picker label="Pickup zone" value={zoneName} error={errors.zoneId} onPress={() => setSheet('zone')} />

      <OptionSheet
        visible={sheet === 'cat'}
        title="Category"
        options={(cats.data ?? []).map((c) => ({ id: c.id, label: c.name }))}
        selectedId={form.categoryId}
        loading={cats.isLoading}
        onClose={() => setSheet(null)}
        onPick={(id) => {
          set('categoryId', id as number);
          setSheet(null);
        }}
      />
      <OptionSheet
        visible={sheet === 'zone'}
        title="Pickup zone"
        subtitle="Where the item will be handed over"
        searchable
        options={(zones.data ?? []).map((z) => ({ id: z.id, label: z.name, sublabel: z.category }))}
        selectedId={form.zoneId}
        loading={zones.isLoading}
        onClose={() => setSheet(null)}
        onPick={(id) => {
          set('zoneId', id as number);
          setSheet(null);
        }}
      />
    </Screen>
  );
}

function Picker({ label, value, error, onPress }: { label: string; value?: string; error?: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: 16 }}>
      <AppText variant="smallStrong" style={styles.label}>
        {label}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ?? 'not chosen'}`}
        onPress={onPress}
        style={[styles.picker, { backgroundColor: colors.fill, borderColor: error ? colors.danger : 'transparent' }]}
      >
        <AppText color={value ? 'ink' : 'placeholder'} style={{ flex: 1 }}>
          {value ?? 'Choose'}
        </AppText>
        <Icon name="chevron-down" size={18} color="muted" />
      </Pressable>
      {error ? (
        <AppText variant="caption" color="danger" style={{ marginTop: 4 }}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  picker: { minHeight: TAP + 4, borderRadius: radius.md, borderWidth: 1.5, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
});
