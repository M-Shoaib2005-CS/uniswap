import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { AppBar } from '@/components/AppBar';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Segmented } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState } from '@/components/States';
import { useAuth } from '@/features/auth/AuthProvider';
import { useItem, useRequestItem } from '@/features/listings/api';
import { daysBetween, formatDate, formatMoney, toDateString, validateRentalDates } from '@/lib/format';
import { friendlyError } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';
import { FONT, radius, TAP } from '@/theme/tokens';
import { TxnKind } from '@/types/models';

function startOfToday(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export default function RequestScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile, session } = useAuth();
  const q = useItem(id, profile?.default_zone_id ?? null, session?.user.id ?? null);
  const request = useRequestItem();

  const [kind, setKind] = useState<TxnKind | null>(null);
  const [start, setStart] = useState<Date>(() => addDays(startOfToday(), 1));
  const [due, setDue] = useState<Date>(() => addDays(startOfToday(), 1 + 105)); // roughly one semester
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const item = q.data;
  const activeKind: TxnKind = useMemo(() => {
    if (kind) return kind;
    if (!item) return 'rent';
    return item.mode === 'sell' ? 'buy' : 'rent';
  }, [kind, item]);

  const pickDate = (which: 'start' | 'due') => {
    const current = which === 'start' ? start : due;
    DateTimePickerAndroid.open({
      value: current,
      mode: 'date',
      minimumDate: which === 'start' ? startOfToday() : addDays(start, 1),
      onChange: (event, date) => {
        if (event.type !== 'set' || !date) return;
        const picked = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        if (which === 'start') {
          setStart(picked);
          if (daysBetween(picked, due) <= 0) setDue(addDays(picked, 30));
        } else {
          setDue(picked);
        }
        setError(null);
      },
    });
  };

  if (q.isLoading) return <Screen><AppBar title="Request" closeIcon /></Screen>;
  if (q.isError) {
    return (
      <Screen>
        <AppBar title="Request" closeIcon />
        <ErrorState message={friendlyError(q.error)} onRetry={() => q.refetch()} />
      </Screen>
    );
  }
  if (!item) {
    return (
      <Screen>
        <AppBar title="Request" closeIcon />
        <EmptyState icon="archive" title="Listing not available" />
      </Screen>
    );
  }

  const isRent = activeKind === 'rent';
  const days = daysBetween(start, due);
  const dateProblem = isRent ? validateRentalDates(start, due) : null;
  const total = isRent ? (item.rent_price ?? 0) + (item.deposit ?? 0) : item.sale_price ?? 0;

  const submit = async () => {
    setError(null);
    if (dateProblem) {
      setError(dateProblem);
      return;
    }
    try {
      const txnId = await request.mutateAsync({
        itemId: item.id,
        kind: activeKind,
        start: isRent ? toDateString(start) : null,
        due: isRent ? toDateString(due) : null,
        note,
      });
      setSent(txnId);
    } catch (e) {
      const msg = friendlyError(e);
      setError(msg);
      if (msg.toLowerCase().includes('meantime') || msg.toLowerCase().includes('no longer available')) {
        q.refetch();
      }
    }
  };

  if (sent) {
    return (
      <Screen>
        <EmptyState
          icon="check-circle"
          title="Request sent"
          message={`${item.owner.display_name} has been notified. You'll get an update when they reply. Pickup: ${item.zone_name}.`}
        />
        <Button label="View request" onPress={() => router.replace({ pathname: '/txn/[id]', params: { id: sent } })} />
        <Button variant="ghost" label="Back to home" onPress={() => router.replace('/(tabs)')} />
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      footer={<Button label={isRent ? 'Send request' : 'Request to buy'} onPress={submit} loading={request.isPending} />}
    >
      <AppBar title={isRent ? 'Request to rent' : 'Request to buy'} closeIcon />

      <View style={[styles.summary, { backgroundColor: colors.fill }]}>
        <View style={{ flex: 1 }}>
          <AppText variant="smallStrong" numberOfLines={2}>
            {item.title}
          </AppText>
          <AppText variant="caption" color="muted">
            {item.owner.display_name} · {item.zone_name}
          </AppText>
        </View>
      </View>

      {item.mode === 'both' ? (
        <View style={{ marginTop: 16 }}>
          <Segmented
            options={[
              { key: 'rent' as TxnKind, label: 'Rent' },
              { key: 'buy' as TxnKind, label: 'Buy' },
            ]}
            value={activeKind}
            onChange={setKind}
          />
        </View>
      ) : null}

      {isRent ? (
        <View style={styles.dates}>
          <DateBox label="Start date" value={formatDate(start)} onPress={() => pickDate('start')} />
          <DateBox label="Return due" value={formatDate(due)} onPress={() => pickDate('due')} />
        </View>
      ) : null}
      {isRent ? (
        <AppText variant="caption" color={dateProblem ? 'danger' : 'muted'} style={{ marginTop: 6 }}>
          {dateProblem ?? `${days} days. A rental can last up to 120 days.`}
        </AppText>
      ) : null}

      <AppText variant="smallStrong" style={{ marginTop: 20, marginBottom: 6 }}>
        Note to owner (optional)
      </AppText>
      <TextInput
        value={note}
        onChangeText={setNote}
        maxLength={300}
        multiline
        placeholder="Hi! I can pick it up after my lecture on Monday."
        placeholderTextColor={colors.placeholder}
        accessibilityLabel="Note to owner"
        style={[styles.note, { backgroundColor: colors.fill, color: colors.ink, fontFamily: FONT.regular }]}
      />

      <View style={[styles.cost, { backgroundColor: colors.fill }]}>
        {isRent ? (
          <>
            <CostRow label="Rent for one semester" value={formatMoney(item.rent_price)} />
            <CostRow label="Refundable deposit" value={formatMoney(item.deposit ?? 0)} />
          </>
        ) : (
          <CostRow label="Price" value={formatMoney(item.sale_price)} />
        )}
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <CostRow label="Due at handover" value={formatMoney(total)} strong />
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <Icon name="info" size={16} color="muted" />
        <AppText variant="caption" color="muted" style={{ flex: 1 }}>
          UniSwap never handles money. You settle the {isRent ? 'rent and deposit' : 'price'} in person at handover.
        </AppText>
      </View>

      {error ? (
        <AppText variant="small" color="danger" style={{ marginTop: 12 }} accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
    </Screen>
  );
}

function DateBox({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <AppText variant="smallStrong" style={{ marginBottom: 6 }}>
        {label}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}. Tap to change`}
        onPress={onPress}
        style={[styles.dateBox, { backgroundColor: colors.fill }]}
      >
        <Icon name="calendar" size={16} color="muted" />
        <AppText variant="small">{value}</AppText>
      </Pressable>
    </View>
  );
}

function CostRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.costRow}>
      <AppText variant={strong ? 'smallStrong' : 'small'} color={strong ? 'ink' : 'muted'}>
        {label}
      </AppText>
      <AppText variant={strong ? 'smallStrong' : 'small'}>{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', padding: 12, borderRadius: radius.md, marginTop: 8 },
  dates: { flexDirection: 'row', gap: 12, marginTop: 20 },
  dateBox: { minHeight: TAP + 4, borderRadius: radius.md, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  note: { minHeight: 88, borderRadius: radius.md, padding: 12, fontSize: 16, textAlignVertical: 'top' },
  cost: { borderRadius: radius.md, padding: 14, marginTop: 20, gap: 8 },
  costRow: { flexDirection: 'row', justifyContent: 'space-between' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 2 },
});
