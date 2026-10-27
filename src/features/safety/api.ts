import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type ReportType = 'item' | 'post' | 'comment' | 'user' | 'conversation';
export type ReportReason = 'spam' | 'fake' | 'abusive' | 'unsafe' | 'inappropriate' | 'other';

export const REPORT_REASONS: { key: ReportReason; label: string }[] = [
  { key: 'spam', label: 'Spam or advertising' },
  { key: 'fake', label: 'Fake or misleading' },
  { key: 'abusive', label: 'Harassment or abuse' },
  { key: 'unsafe', label: 'Unsafe or prohibited item' },
  { key: 'inappropriate', label: 'Inappropriate content' },
  { key: 'other', label: 'Something else' },
];

export function useSubmitReport() {
  return useMutation({
    mutationFn: async (r: { type: ReportType; target: string; reason: ReportReason; details: string }) => {
      const { error } = await supabase.rpc('submit_report', {
        p_type: r.type,
        p_target: r.target,
        p_reason: r.reason,
        p_details: r.details.trim() || null,
      });
      if (error) throw error;
    },
  });
}

export interface BlockedUser {
  blocked_id: string;
  created_at: string;
  user: { id: string; display_name: string; avatar_path: string | null } | null;
}

export function useBlockedUsers(myId: string | null) {
  return useQuery({
    queryKey: ['blocked', myId],
    enabled: !!myId,
    queryFn: async (): Promise<BlockedUser[]> => {
      const { data, error } = await supabase
        .from('blocks')
        .select('blocked_id,created_at,user:profiles!blocked_id(id,display_name,avatar_path)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BlockedUser[];
    },
  });
}

function useRefreshAfterBlock() {
  const qc = useQueryClient();
  return () => {
    for (const k of ['blocked', 'conversations', 'search', 'feed', 'post', 'activity', 'item']) qc.invalidateQueries({ queryKey: [k] });
  };
}

export function useBlock(myId: string | null) {
  const done = useRefreshAfterBlock();
  return useMutation({
    mutationFn: async (userId: string) => {
      if (!myId) throw new Error('Not signed in');
      const { error } = await supabase.from('blocks').insert({ blocker_id: myId, blocked_id: userId });
      if (error && error.code !== '23505') throw error; // already blocked is fine
    },
    onSuccess: done,
  });
}

export function useUnblock(myId: string | null) {
  const done = useRefreshAfterBlock();
  return useMutation({
    mutationFn: async (userId: string) => {
      if (!myId) throw new Error('Not signed in');
      const { error } = await supabase.from('blocks').delete().eq('blocker_id', myId).eq('blocked_id', userId);
      if (error) throw error;
    },
    onSuccess: done,
  });
}
