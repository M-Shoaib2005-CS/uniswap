import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

/** Keeps lists fresh while the app is open: new messages and notifications trigger a refetch. */
export function useRealtimeSync(userId: string | null) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`user-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => {
        qc.invalidateQueries({ queryKey: ['notifications'] });
        qc.invalidateQueries({ queryKey: ['notif-count'] });
        qc.invalidateQueries({ queryKey: ['activity'] });
        qc.invalidateQueries({ queryKey: ['txn'] });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        qc.invalidateQueries({ queryKey: ['conversations'] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, qc]);
}

export function useNotifCount(userId: string | null) {
  return useQuery({
    queryKey: ['notif-count', userId],
    enabled: !!userId,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
      if (error) throw error;
      return count ?? 0;
    },
  });
}
