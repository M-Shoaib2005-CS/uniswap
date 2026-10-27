// Pure transaction rules (unit-tested). They mirror the database functions so the UI only offers
// actions the server will accept; the server remains the authority.

export type TxnStatus = 'requested' | 'accepted' | 'rented' | 'returned' | 'completed' | 'declined' | 'cancelled';
export type TxnKind = 'rent' | 'buy';
export type TxnAction = 'accept' | 'decline' | 'cancel' | 'confirm_handover' | 'confirm_return' | 'review';
export type Tone = 'neutral' | 'primary' | 'success' | 'warn' | 'danger';

export interface TxnState {
  status: TxnStatus;
  kind: TxnKind;
  owner_id: string;
  requester_id: string;
  deposit: number;
  owner_handover_at: string | null;
  requester_handover_at: string | null;
  owner_return_at: string | null;
  requester_return_at: string | null;
}

export function roleOf(t: Pick<TxnState, 'owner_id' | 'requester_id'>, me: string): 'owner' | 'requester' | null {
  if (t.owner_id === me) return 'owner';
  if (t.requester_id === me) return 'requester';
  return null;
}

export function allowedActions(t: TxnState, me: string, alreadyReviewed: boolean): TxnAction[] {
  const role = roleOf(t, me);
  if (!role) return [];
  const mineHandover = role === 'owner' ? t.owner_handover_at : t.requester_handover_at;
  const mineReturn = role === 'owner' ? t.owner_return_at : t.requester_return_at;
  const out: TxnAction[] = [];
  switch (t.status) {
    case 'requested':
      if (role === 'owner') out.push('accept', 'decline');
      else out.push('cancel');
      break;
    case 'accepted':
      if (!mineHandover) out.push('confirm_handover');
      if (!t.owner_handover_at && !t.requester_handover_at) out.push('cancel');
      break;
    case 'rented':
      if (!mineReturn) out.push('confirm_return');
      break;
    case 'returned':
    case 'completed':
      if (!alreadyReviewed) out.push('review');
      break;
    default:
      break;
  }
  return out;
}

export function statusLabel(status: TxnStatus, kind: TxnKind): { label: string; tone: Tone } {
  switch (status) {
    case 'requested':
      return { label: 'Requested', tone: 'warn' };
    case 'accepted':
      return { label: kind === 'rent' ? 'Accepted' : 'Accepted', tone: 'primary' };
    case 'rented':
      return { label: 'Rented', tone: 'primary' };
    case 'returned':
      return { label: 'Returned', tone: 'success' };
    case 'completed':
      return { label: 'Completed', tone: 'success' };
    case 'declined':
      return { label: 'Declined', tone: 'danger' };
    case 'cancelled':
      return { label: 'Cancelled', tone: 'neutral' };
  }
}

/** One short line saying what happens next, from the viewer's side. */
export function nextStep(t: TxnState, me: string, otherName: string): string | null {
  const role = roleOf(t, me);
  if (!role) return null;
  const mineH = role === 'owner' ? t.owner_handover_at : t.requester_handover_at;
  const theirH = role === 'owner' ? t.requester_handover_at : t.owner_handover_at;
  const mineR = role === 'owner' ? t.owner_return_at : t.requester_return_at;
  const theirR = role === 'owner' ? t.requester_return_at : t.owner_return_at;
  switch (t.status) {
    case 'requested':
      return role === 'owner' ? `${otherName} is waiting for your reply.` : `Waiting for ${otherName} to reply.`;
    case 'accepted':
      if (mineH && !theirH) return `You confirmed the handover. Waiting for ${otherName}.`;
      if (!mineH && theirH) return `${otherName} confirmed the handover. Please confirm on your side.`;
      return 'Meet at the pickup spot, then both of you confirm the handover here.';
    case 'rented':
      if (mineR && !theirR) return `You confirmed the return. Waiting for ${otherName}.`;
      if (!mineR && theirR) return `${otherName} confirmed the return. Please confirm on your side.`;
      return 'When the item comes back, both of you confirm the return here.';
    case 'returned':
    case 'completed':
      return 'All done. Leave a rating to build trust on campus.';
    case 'declined':
      return 'This request was declined.';
    case 'cancelled':
      return 'This request was cancelled.';
  }
}

/** Which Activity tab a transaction belongs to. */
export function activityBucket(status: TxnStatus): 'requests' | 'active' | 'history' {
  if (status === 'requested') return 'requests';
  if (status === 'accepted' || status === 'rented') return 'active';
  return 'history';
}
