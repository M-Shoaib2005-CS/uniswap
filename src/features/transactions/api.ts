import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { compressAndUpload, PickedImage } from '@/lib/images';
import { supabase } from '@/lib/supabase';
import type { TxnKind, TxnStatus } from './rules';

export interface Person {
  id: string;
  display_name: string;
  avatar_path: string | null;
}

export interface TxnRow {
  id: string;
  item_id: string;
  owner_id: string;
  requester_id: string;
  kind: TxnKind;
  status: TxnStatus;
  start_date: string | null;
  due_date: string | null;
  price: number;
  deposit: number;
  deposit_status: 'none' | 'held' | 'returned' | 'deducted';
  deposit_outcome: 'none' | 'held' | 'returned' | 'deducted' | null;
  note: string | null;
  owner_handover_at: string | null;
  requester_handover_at: string | null;
  owner_return_at: string | null;
  requester_return_at: string | null;
  created_at: string;
  updated_at: string;
  item: { title: string; images: { path: string; position: number }[] | null; zone: { name: string } | null } | null;
  owner: Person | null;
  requester: Person | null;
}

const SELECT =
  'id,item_id,owner_id,requester_id,kind,status,start_date,due_date,price,deposit,deposit_status,deposit_outcome,note,' +
  'owner_handover_at,requester_handover_at,owner_return_at,requester_return_at,created_at,updated_at,' +
  'item:items(title,images:item_images(path,position),zone:zones(name)),' +
  'owner:profiles!owner_id(id,display_name,avatar_path),' +
  'requester:profiles!requester_id(id,display_name,avatar_path)';

export function coverOf(t: TxnRow): string | null {
  const imgs = [...(t.item?.images ?? [])].sort((a, b) => a.position - b.position);
  return imgs[0]?.path ?? null;
}

export function useMyTransactions(myId: string | null) {
  return useQuery({
    queryKey: ['activity', myId],
    enabled: !!myId,
    queryFn: async (): Promise<TxnRow[]> => {
      const { data, error } = await supabase.from('transactions').select(SELECT).order('updated_at', { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as TxnRow[];
    },
  });
}

export interface Evidence {
  id: string;
  user_id: string;
  phase: 'handover' | 'return';
  note: string | null;
  photo_paths: string[];
  created_at: string;
}

export interface TxnDetail {
  txn: TxnRow;
  evidence: (Evidence & { urls: string[] })[];
  reviewed: boolean;
}

export function useTransaction(id: string | undefined, myId: string | null) {
  return useQuery({
    queryKey: ['txn', id],
    enabled: !!id && !!myId,
    queryFn: async (): Promise<TxnDetail | null> => {
      const { data, error } = await supabase.from('transactions').select(SELECT).eq('id', id as string).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const txn = data as unknown as TxnRow;
      const ev = await supabase.from('txn_evidence').select('id,user_id,phase,note,photo_paths,created_at').eq('txn_id', txn.id).order('created_at');
      if (ev.error) throw ev.error;
      const rows = (ev.data ?? []) as Evidence[];
      const evidence = await Promise.all(
        rows.map(async (e) => {
          const urls: string[] = [];
          for (const p of e.photo_paths) {
            const s = await supabase.storage.from('evidence').createSignedUrl(p, 3600);
            if (s.data?.signedUrl) urls.push(s.data.signedUrl);
          }
          return { ...e, urls };
        }),
      );
      const rv = await supabase.from('reviews').select('id').eq('txn_id', txn.id).eq('reviewer_id', myId as string).maybeSingle();
      return { txn, evidence, reviewed: !!rv.data };
    },
  });
}

function useInvalidateTxn() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['txn'] });
    qc.invalidateQueries({ queryKey: ['activity'] });
    qc.invalidateQueries({ queryKey: ['search'] });
    qc.invalidateQueries({ queryKey: ['item'] });
    qc.invalidateQueries({ queryKey: ['conversations'] });
  };
}

export function useRespond() {
  const done = useInvalidateTxn();
  return useMutation({
    mutationFn: async ({ txnId, accept }: { txnId: string; accept: boolean }) => {
      const { error } = await supabase.rpc('respond_request', { p_txn: txnId, p_accept: accept });
      if (error) throw error;
    },
    onSettled: done,
  });
}

export function useCancel() {
  const done = useInvalidateTxn();
  return useMutation({
    mutationFn: async (txnId: string) => {
      const { error } = await supabase.rpc('cancel_request', { p_txn: txnId });
      if (error) throw error;
    },
    onSettled: done,
  });
}

export interface EvidenceInput {
  txnId: string;
  userId: string;
  note: string;
  photos: PickedImage[];
  deposit?: 'returned' | 'deducted' | null; // owner, at return only
}

async function uploadEvidence(i: EvidenceInput): Promise<string[]> {
  const paths: string[] = [];
  for (const p of i.photos) paths.push(await compressAndUpload('evidence', `${i.userId}/${i.txnId}`, p));
  return paths;
}

export function useConfirmHandover() {
  const done = useInvalidateTxn();
  return useMutation({
    mutationFn: async (i: EvidenceInput) => {
      const photos = await uploadEvidence(i);
      const { error } = await supabase.rpc('confirm_handover', { p_txn: i.txnId, p_note: i.note.trim() || null, p_photos: photos });
      if (error) throw error;
    },
    onSettled: done,
  });
}

export function useConfirmReturn() {
  const done = useInvalidateTxn();
  return useMutation({
    mutationFn: async (i: EvidenceInput) => {
      const photos = await uploadEvidence(i);
      const { error } = await supabase.rpc('confirm_return', {
        p_txn: i.txnId,
        p_note: i.note.trim() || null,
        p_photos: photos,
        p_deposit: i.deposit ?? null,
      });
      if (error) throw error;
    },
    onSettled: done,
  });
}

export function useSubmitReview() {
  const done = useInvalidateTxn();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ txnId, rating, comment }: { txnId: string; rating: number; comment: string }) => {
      const { error } = await supabase.rpc('submit_review', { p_txn: txnId, p_rating: rating, p_comment: comment.trim() || null });
      if (error) throw error;
    },
    onSettled: () => {
      done();
      qc.invalidateQueries({ queryKey: ['item'] });
    },
  });
}
