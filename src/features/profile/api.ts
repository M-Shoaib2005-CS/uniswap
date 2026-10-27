import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { compressAndUpload, PickedImage, removeFiles } from '@/lib/images';
import { supabase } from '@/lib/supabase';
import type { ListingMode, ListingStatus } from '@/types/models';

export interface MyItem {
  id: string;
  title: string;
  mode: ListingMode;
  status: ListingStatus;
  rent_price: number | null;
  sale_price: number | null;
  created_at: string;
  images: { path: string; position: number }[] | null;
}

/** All of my listings, including archived ones. */
export function useMyItems(myId: string | null) {
  return useQuery({
    queryKey: ['my-items', myId],
    enabled: !!myId,
    queryFn: async (): Promise<MyItem[]> => {
      const { data, error } = await supabase
        .from('items')
        .select('id,title,mode,status,rent_price,sale_price,created_at,images:item_images(path,position)')
        .eq('owner_id', myId as string)
        .is('removed_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as MyItem[];
    },
  });
}

export interface PublicProfile {
  id: string;
  display_name: string;
  avatar_path: string | null;
  department: string | null;
  trust_score: number | null;
  ratings_count: number;
  swaps_count: number;
  founding_member: boolean;
  is_pro: boolean;
  created_at: string;
}

export function useUserProfile(id: string | undefined) {
  return useQuery({
    queryKey: ['user', id],
    enabled: !!id,
    queryFn: async (): Promise<PublicProfile | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id,display_name,avatar_path,department,trust_score,ratings_count,swaps_count,founding_member,is_pro,created_at')
        .eq('id', id as string)
        .maybeSingle();
      if (error) throw error;
      return (data as PublicProfile | null) ?? null;
    },
  });
}

export interface ReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer: { display_name: string } | null;
}

export function useUserReviews(id: string | undefined) {
  return useQuery({
    queryKey: ['user-reviews', id],
    enabled: !!id,
    queryFn: async (): Promise<ReviewRow[]> => {
      const { data, error } = await supabase
        .from('reviews')
        .select('id,rating,comment,created_at,reviewer:profiles!reviewer_id(display_name)')
        .eq('reviewee_id', id as string)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as unknown as ReviewRow[];
    },
  });
}

export type PrefKey = 'messages' | 'requests' | 'reminders' | 'likes' | 'comments';
export type Prefs = Record<PrefKey, boolean>;
const DEFAULT_PREFS: Prefs = { messages: true, requests: true, reminders: true, likes: true, comments: true };

export function useNotificationPrefs(myId: string | null) {
  return useQuery({
    queryKey: ['prefs', myId],
    enabled: !!myId,
    queryFn: async (): Promise<Prefs> => {
      const { data, error } = await supabase.from('user_private').select('notification_prefs').eq('user_id', myId as string).maybeSingle();
      if (error) throw error;
      const raw = ((data as { notification_prefs: Record<string, unknown> } | null)?.notification_prefs ?? {}) as Record<string, unknown>;
      const out = { ...DEFAULT_PREFS };
      (Object.keys(out) as PrefKey[]).forEach((k) => {
        if (raw[k] === false || raw[k] === 'false') out[k] = false;
      });
      return out;
    },
  });
}

export function useSetPrefs(myId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (prefs: Prefs) => {
      const { error } = await supabase.from('user_private').update({ notification_prefs: prefs }).eq('user_id', myId as string);
      if (error) throw error;
    },
    onMutate: (prefs) => qc.setQueryData(['prefs', myId], prefs),
    onSettled: () => qc.invalidateQueries({ queryKey: ['prefs', myId] }),
  });
}

/** Uploads a new avatar and returns its storage path; removes the old file afterwards. */
export async function uploadAvatar(userId: string, img: PickedImage, oldPath: string | null): Promise<string> {
  const path = await compressAndUpload('avatars', userId, img);
  if (oldPath) await removeFiles('avatars', [oldPath]);
  return path;
}

export async function deleteMyAccount(): Promise<void> {
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw error;
}
