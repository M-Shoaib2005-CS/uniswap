import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { AppBar } from '@/components/AppBar';
import { AppText } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Chip';
import { EvidenceResult, EvidenceSheet } from '@/components/EvidenceSheet';
import { ReviewSheet } from '@/components/ReviewSheet';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, Skeleton } from '@/components/States';
import { useAuth } from '@/features/auth/AuthProvider';
import { findConversation, startConversation } from '@/features/chat/api';
import {
  coverOf,
  useCancel,
  useConfirmHandover,
  useConfirmReturn,
  useRespond,
  useSubmitReview,
  useTransaction,
} from '@/features/transactions/api';
import { allowedActions, nextStep, roleOf, statusLabel } from '@/features/transactions/rules';
import { formatMoney } from '@/lib/format';
import { publicImageUrl } from '@/lib/supabase';
import { friendlyError } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

type Sheet = 'handover' | 'return' | 'review' | null;

export default function TxnScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const me = session?.user.id ?? null;
  const q = useTransaction(id, me);
  const respond = useRespond();
  const cancel = useCancel();
  const handover = useConfirmHandover();
  const ret = useConfirmReturn();
  const review = useSubmitReview();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [opening, setOpening] = useState(false);

  const fail = (title: string) => (e: unknown) => Alert.alert(title, friendlyError(e));

  if (q.isLoading) {
    return (
      <Screen>
        <AppBar title="Request" />
        <Skeleton style={{ height: 120 }} />
      </Screen>
    );
  }
  if (q.isError) {
    return (
      <Screen>
        <AppBar title="Request" />
        <ErrorState message={friendlyError(q.error)} onRetry={() => q.refetch()} />
      </Screen>
    );
  }
  if (!q.data || !me) {
    return (
      <Screen>
        <AppBar title="Request" />
        <EmptyState icon="archive" title="Request not found" message="It may have been removed." actionLabel="Go back" onAction={() => router.back()} />
      </Screen>
    );
  }

  const { txn: t, evidence, reviewed } = q.data;
  const role = roleOf(t, me);
  const other = role === 'owner' ? t.requester : t.owner;
  const otherName = other?.display_name ?? 'the other person';
  const st = statusLabel(t.status, t.kind);
  const actions = allowedActions(t, me, reviewed);
  const step = nextStep(t, me, otherName);
  const cover = publicImageUrl('item-images', coverOf(t));
  const isRent = t.kind === 'rent';
  const owner = role === 'owner';

  const openChat = async () => {
    setOpening(true);
    try {
      const convId = owner ? await findConversation(t.item_id, t.requester_id) : await startConversation(t.item_id);
      if (!convId) Alert.alert('No chat yet', 'A chat opens once the request is accepted.');
      else router.push({ pathname: '/chat/[id]', params: { id: convId } });
    } catch (e) {
      fail('Could not open chat')(e);
    } finally {
      setOpening(false);
    }
  };

  const submitEvidence = (kind: 'handover' | 'return') => (r: EvidenceResult) => {
    const input = { txnId: t.id, userId: me, note: r.note, photos: r.photos, deposit: r.deposit };
    const m = kind === 'handover' ? handover : ret;
    m.mutate(input, { onSuccess: () => setSheet(null), onError: fail('Could not confirm') });
  };

  const confirmDecline = () =>
    Alert.alert('Decline this request?', `${otherName} will be told.`, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Decline', style: 'destructive', onPress: () => respond.mutate({ txnId: t.id, accept: false }, { onError: fail('Could not decline') }) },
    ]);
  const confirmCancel = () =>
    Alert.alert('Cancel this request?', undefined, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Cancel request', style: 'destructive', onPress: () => cancel.mutate(t.id, { onError: fail('Could not cancel') }) },
    ]);

  const has = (a: (typeof actions)[number]) => actions.includes(a);

  return (
    <Screen scroll>
      <AppBar title="Request" />
      <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/listing/[id]', params: { id: t.item_id } })} style={[styles.item, { borderColor: colors.border }]}>
        <View style={[styles.thumb, { backgroundColor: colors.fill }]}>{cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}</View>
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="bodyStrong" numberOfLines={2}>
            {t.item?.title ?? 'Listing'}
          </AppText>
          <Badge label={st.label} tone={st.tone} />
        </View>
      </Pressable>

      {step ? (
        <View style={[styles.step, { backgroundColor: colors.primarySoft }]}>
          <AppText variant="small" color="primaryText">
            {step}
          </AppText>
        </View>
      ) : null}

      <View style={[styles.person, { borderColor: colors.border }]}>
        <Avatar name={otherName} path={other?.avatar_path} size={44} />
        <View style={{ flex: 1 }}>
          <AppText variant="caption" color="muted">
            {owner ? 'Requested by' : 'Owner'}
          </AppText>
          <AppText variant="bodyStrong">{otherName}</AppText>
        </View>
        <Button compact variant="secondary" label="Chat" icon="message-circle" loading={opening} onPress={openChat} />
      </View>

      <View style={{ gap: 10, marginVertical: 16 }}>
        <Row label="Type" value={isRent ? 'Rental' : 'Purchase'} />
        {isRent ? <Row label="Dates" value={`${t.start_date} to ${t.due_date}`} /> : null}
        <Row label={isRent ? 'Rent' : 'Price'} value={formatMoney(t.price)} />
        {isRent ? <Row label="Deposit" value={`${formatMoney(t.deposit)}${t.deposit_status !== 'none' ? ` (${t.deposit_status})` : ''}`} /> : null}
        <Row label="Pickup" value={t.item?.zone?.name ?? ''} />
        {t.note ? <Row label="Note" value={t.note} /> : null}
      </View>

      {evidence.length > 0 ? (
        <View style={{ gap: 10, marginBottom: 16 }}>
          <AppText variant="heading">Handover and return records</AppText>
          {evidence.map((e) => (
            <View key={e.id} style={[styles.ev, { borderColor: colors.border }]}>
              <AppText variant="smallStrong">
                {e.phase === 'handover' ? 'Handover' : 'Return'} · {e.user_id === me ? 'You' : otherName}
              </AppText>
              {e.note ? <AppText variant="small" color="muted">{e.note}</AppText> : null}
              {e.urls.length > 0 ? (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                  {e.urls.map((u) => (
                    <Image key={u} source={{ uri: u }} style={{ width: 96, height: 96, borderRadius: radius.md }} contentFit="cover" />
                  ))}
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        {has('accept') ? <Button label="Accept request" loading={respond.isPending} onPress={() => respond.mutate({ txnId: t.id, accept: true }, { onError: fail('Could not accept') })} /> : null}
        {has('decline') ? <Button label="Decline" variant="secondary" disabled={respond.isPending} onPress={confirmDecline} /> : null}
        {has('confirm_handover') ? <Button label="Confirm handover" onPress={() => setSheet('handover')} /> : null}
        {has('confirm_return') ? <Button label="Confirm return" onPress={() => setSheet('return')} /> : null}
        {has('review') ? <Button label={`Rate ${otherName}`} icon="star" onPress={() => setSheet('review')} /> : null}
        {has('cancel') ? <Button label="Cancel request" variant="danger" loading={cancel.isPending} onPress={confirmCancel} /> : null}
      </View>

      <EvidenceSheet
        visible={sheet === 'handover'}
        title="Confirm handover"
        message="Optional: add a note and up to 2 photos of the item as handed over. Only you and the other person can see them."
        loading={handover.isPending}
        onClose={() => setSheet(null)}
        onSubmit={submitEvidence('handover')}
      />
      <EvidenceSheet
        visible={sheet === 'return'}
        title="Confirm return"
        message="Optional: add a note and up to 2 photos of the item as returned."
        askDeposit={owner && isRent && t.deposit > 0}
        loading={ret.isPending}
        onClose={() => setSheet(null)}
        onSubmit={submitEvidence('return')}
      />
      <ReviewSheet
        visible={sheet === 'review'}
        name={otherName}
        loading={review.isPending}
        onClose={() => setSheet(null)}
        onSubmit={(rating, comment) => review.mutate({ txnId: t.id, rating, comment }, { onSuccess: () => setSheet(null), onError: fail('Could not submit review') })}
      />
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16 }}>
      <AppText variant="small" color="muted">
        {label}
      </AppText>
      <AppText variant="small" style={{ flexShrink: 1, textAlign: 'right' }}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row', gap: 12, padding: 12, borderWidth: 1, borderRadius: radius.lg, alignItems: 'center' },
  thumb: { width: 72, height: 72, borderRadius: radius.md, overflow: 'hidden' },
  step: { padding: 12, borderRadius: radius.md, marginTop: 12 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, marginTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  ev: { padding: 12, borderWidth: 1, borderRadius: radius.md, gap: 2 },
});
