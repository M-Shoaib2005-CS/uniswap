import { InfiniteData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { compressAndUpload, PickedImage, removeFiles } from '@/lib/images';
import { supabase } from '@/lib/supabase';

export const FEED_PAGE = 15;
export const MAX_POST_PHOTOS = 4;

export interface Author {
  id: string;
  display_name: string;
  avatar_path: string | null;
  department: string | null;
}

export interface Post {
  id: string;
  author_id: string;
  body: string;
  like_count: number;
  comment_count: number;
  created_at: string;
  author: Author | null;
  images: { path: string; position: number }[] | null;
  post_likes: { user_id: string }[] | null; // only my own like (filtered in the query)
}

export const likedByMe = (p: Post) => (p.post_likes?.length ?? 0) > 0;
export const postImages = (p: Post) => [...(p.images ?? [])].sort((a, b) => a.position - b.position).map((i) => i.path);

const POST_SELECT =
  'id,author_id,body,like_count,comment_count,created_at,' +
  'author:profiles!author_id(id,display_name,avatar_path,department),' +
  'images:post_images(path,position),post_likes(user_id)';

export function useFeed(myId: string | null, enabled = true) {
  return useInfiniteQuery({
    queryKey: ['feed', myId],
    enabled: enabled && !!myId,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<Post[]> => {
      let q = supabase
        .from('posts')
        .select(POST_SELECT)
        .is('removed_at', null)
        .eq('post_likes.user_id', myId as string)
        .order('created_at', { ascending: false })
        .limit(FEED_PAGE);
      if (pageParam) q = q.lt('created_at', pageParam);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Post[];
    },
    getNextPageParam: (last) => (last.length < FEED_PAGE ? undefined : last[last.length - 1].created_at),
  });
}

export function usePost(id: string | undefined, myId: string | null) {
  return useQuery({
    queryKey: ['post', id],
    enabled: !!id && !!myId,
    queryFn: async (): Promise<Post | null> => {
      const { data, error } = await supabase
        .from('posts')
        .select(POST_SELECT)
        .eq('id', id as string)
        .is('removed_at', null)
        .eq('post_likes.user_id', myId as string)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as Post | null) ?? null;
    },
  });
}

type FeedData = InfiniteData<Post[], string | null>;

export function useToggleLike(myId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ postId, liked }: { postId: string; liked: boolean }) => {
      if (!myId) throw new Error('Not signed in');
      if (liked) {
        const { error } = await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', myId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('post_likes').insert({ post_id: postId, user_id: myId });
        if (error) throw error;
      }
    },
    // flip the heart immediately; the server count arrives with the refetch
    onMutate: async ({ postId, liked }) => {
      const patch = (p: Post): Post =>
        p.id !== postId ? p : { ...p, like_count: Math.max(0, p.like_count + (liked ? -1 : 1)), post_likes: liked ? [] : [{ user_id: myId as string }] };
      qc.setQueryData<FeedData>(['feed', myId], (d) => (d ? { ...d, pages: d.pages.map((pg) => pg.map(patch)) } : d));
      qc.setQueryData<Post | null>(['post', postId], (p) => (p ? patch(p) : p));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['feed'] });
      qc.invalidateQueries({ queryKey: ['post'] });
    },
  });
}

export interface NewPost {
  userId: string;
  body: string;
  photos: PickedImage[];
}

export function useCreatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (n: NewPost): Promise<string> => {
      const uploaded: string[] = [];
      try {
        for (const p of n.photos) uploaded.push(await compressAndUpload('post-images', n.userId, p));
        const { data, error } = await supabase.from('posts').insert({ author_id: n.userId, body: n.body.trim() }).select('id').single();
        if (error) throw error;
        const id = (data as { id: string }).id;
        if (uploaded.length > 0) {
          const ins = await supabase.from('post_images').insert(uploaded.map((path, position) => ({ post_id: id, path, position })));
          if (ins.error) {
            await supabase.from('posts').delete().eq('id', id);
            throw ins.error;
          }
        }
        return id;
      } catch (e) {
        await removeFiles('post-images', uploaded);
        throw e;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feed'] }),
  });
}

export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, paths }: { id: string; paths: string[] }) => {
      const { error } = await supabase.from('posts').delete().eq('id', id);
      if (error) throw error;
      await removeFiles('post-images', paths);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feed'] });
      qc.invalidateQueries({ queryKey: ['post'] });
    },
  });
}

export interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author: { id: string; display_name: string; avatar_path: string | null } | null;
}

export function useComments(postId: string | undefined) {
  return useQuery({
    queryKey: ['comments', postId],
    enabled: !!postId,
    queryFn: async (): Promise<Comment[]> => {
      const { data, error } = await supabase
        .from('comments')
        .select('id,post_id,author_id,body,created_at,author:profiles!author_id(id,display_name,avatar_path)')
        .eq('post_id', postId as string)
        .is('removed_at', null)
        .order('created_at')
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as Comment[];
    },
  });
}

function refreshCounts(qc: ReturnType<typeof useQueryClient>, postId: string) {
  qc.invalidateQueries({ queryKey: ['comments', postId] });
  qc.invalidateQueries({ queryKey: ['feed'] });
  qc.invalidateQueries({ queryKey: ['post', postId] });
}

export function useAddComment(postId: string | undefined, myId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      const { error } = await supabase.from('comments').insert({ post_id: postId, author_id: myId, body: body.trim() });
      if (error) throw error;
    },
    onSuccess: () => postId && refreshCounts(qc, postId),
  });
}

export function useDeleteComment(postId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('comments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => postId && refreshCounts(qc, postId),
  });
}
