import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface AdminStats {
  users: number;
  active_listings: number;
  completed_swaps: number;
  open_reports: number;
  posts: number;
  suspended_users: number;
}

export function useAdminStats() {
  return useQuery({
    queryKey: ['admin-stats'],
    queryFn: async (): Promise<AdminStats> => {
      const { data, error } = await supabase.rpc('admin_stats');
      if (error) throw error;
      return data as AdminStats;
    },
  });
}

export interface QueueReport {
  id: string;
  target_type: 'item' | 'post' | 'comment' | 'user' | 'conversation';
  target_id: string;
  target_user_id: string | null;
  target_user_name: string | null;
  reporter_name: string;
  reason: string;
  details: string | null;
  status: 'open' | 'upheld' | 'dismissed';
  created_at: string;
  preview: string | null;
}

export function useReportQueue(status: 'open' | 'upheld' | 'dismissed') {
  return useQuery({
    queryKey: ['admin-reports', status],
    queryFn: async (): Promise<QueueReport[]> => {
      const { data, error } = await supabase.rpc('admin_report_queue', { p_status: status });
      if (error) throw error;
      return (data ?? []) as QueueReport[];
    },
  });
}

export type ReportAction = 'dismiss' | 'warn' | 'remove' | 'suspend';

export function useResolveReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action, note }: { id: string; action: ReportAction; note: string }) => {
      const { error } = await supabase.rpc('admin_resolve_report', { p_report: id, p_action: action, p_note: note.trim() || null });
      if (error) throw error;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['admin-reports'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });
}

export interface AdminUser {
  id: string;
  display_name: string;
  is_suspended: boolean;
  is_admin: boolean;
  trust_score: number | null;
  swaps_count: number;
  created_at: string;
}

export function useAdminUsers(query: string) {
  return useQuery({
    queryKey: ['admin-users', query],
    queryFn: async (): Promise<AdminUser[]> => {
      const { data, error } = await supabase.rpc('admin_search_users', { p_query: query });
      if (error) throw error;
      return (data ?? []) as AdminUser[];
    },
  });
}

export function useSetSuspended() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, suspend, reason }: { id: string; suspend: boolean; reason: string }) => {
      const { error } = await supabase.rpc('admin_set_suspended', { p_user: id, p_suspend: suspend, p_reason: reason.trim() || null });
      if (error) throw error;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
    },
  });
}
