import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export interface ConversationRow {
  id: string;
  item_id: string;
  item_title: string;
  item_cover: string | null;
  item_status: string;
  other_id: string;
  other_name: string;
  other_avatar: string | null;
  last_message_preview: string | null;
  last_message_at: string;
  unread: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  kind: 'text' | 'system';
  body: string;
  created_at: string;
  /** client-only: message is being sent or failed */
  pending?: boolean;
  failed?: boolean;
}

export const MESSAGE_PAGE = 30;

export function useConversations(myId: string | null) {
  return useQuery({
    queryKey: ['conversations', myId],
    enabled: !!myId,
    queryFn: async (): Promise<ConversationRow[]> => {
      const { data, error } = await supabase.rpc('my_conversations');
      if (error) throw error;
      return (data ?? []) as ConversationRow[];
    },
  });
}

export async function startConversation(itemId: string): Promise<string> {
  const { data, error } = await supabase.rpc('start_conversation', { p_item: itemId });
  if (error) throw error;
  return data as string;
}

/** The owner's side: find the conversation about an item with a given requester (may not exist). */
export async function findConversation(itemId: string, otherId: string): Promise<string | null> {
  const { data, error } = await supabase.from('conversations').select('id').eq('item_id', itemId).eq('other_id', otherId).maybeSingle();
  if (error) throw error;
  return (data as { id: string } | null)?.id ?? null;
}

export interface ConversationInfo {
  id: string;
  item_id: string;
  owner_id: string;
  other_id: string;
  item: { title: string } | null;
  owner: { id: string; display_name: string; avatar_path: string | null } | null;
  other: { id: string; display_name: string; avatar_path: string | null } | null;
}

export function useConversation(id: string | undefined) {
  return useQuery({
    queryKey: ['conversation', id],
    enabled: !!id,
    queryFn: async (): Promise<ConversationInfo | null> => {
      const { data, error } = await supabase
        .from('conversations')
        .select(
          'id,item_id,owner_id,other_id,item:items(title),owner:profiles!owner_id(id,display_name,avatar_path),other:profiles!other_id(id,display_name,avatar_path)',
        )
        .eq('id', id as string)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as ConversationInfo | null) ?? null;
    },
  });
}

/** Newest first. Pages go backwards in time. */
export function useMessages(convId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ['messages', convId],
    enabled: !!convId,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<Message[]> => {
      let q = supabase
        .from('messages')
        .select('id,conversation_id,sender_id,kind,body,created_at')
        .eq('conversation_id', convId as string)
        .order('created_at', { ascending: false })
        .limit(MESSAGE_PAGE);
      if (pageParam) q = q.lt('created_at', pageParam);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Message[];
    },
    getNextPageParam: (last) => (last.length < MESSAGE_PAGE ? undefined : last[last.length - 1].created_at),
  });
}

/** Live updates for one open conversation. */
export function useConversationRealtime(convId: string | undefined, onInsert: () => void) {
  useEffect(() => {
    if (!convId) return;
    const channel = supabase
      .channel(`conv-${convId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convId}` }, onInsert)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [convId, onInsert]);
}

export function useSendMessage(convId: string | undefined, myId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      const { error } = await supabase.from('messages').insert({ conversation_id: convId, sender_id: myId, body: body.trim(), kind: 'text' });
      if (error) throw error;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['messages', convId] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export async function markRead(convId: string): Promise<void> {
  await supabase.rpc('mark_conversation_read', { p_conv: convId });
}

export function useUnreadCount(myId: string | null) {
  const q = useConversations(myId);
  return (q.data ?? []).reduce((n, c) => n + c.unread, 0);
}
