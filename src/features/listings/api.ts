import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { ItemDetail, ModeFilter, SearchItem, SortKey, TxnKind } from '@/types/models';

export const PAGE_SIZE = 20;

export interface SearchFilters {
  query: string;
  mode: ModeFilter;
  categoryId: number | null;
  zoneId: number | null;
  sort: SortKey;
  savedOnly?: boolean;
  ownerId?: string | null;
}

async function searchItems(f: SearchFilters, offset: number): Promise<SearchItem[]> {
  const { data, error } = await supabase.rpc('search_items', {
    p_query: f.query.trim() || null,
    p_mode: f.mode,
    p_category: f.categoryId,
    p_zone: f.zoneId,
    p_sort: f.sort,
    p_limit: PAGE_SIZE,
    p_offset: offset,
    p_saved_only: !!f.savedOnly,
    p_owner: f.ownerId ?? null,
  });
  if (error) throw error;
  return (data ?? []) as SearchItem[];
}

export function useSearchItems(f: SearchFilters, enabled = true) {
  return useInfiniteQuery({
    queryKey: ['search', f],
    enabled,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => searchItems(f, pageParam as number),
    getNextPageParam: (last, all) => (last.length < PAGE_SIZE ? undefined : all.length * PAGE_SIZE),
  });
}

interface ItemRow {
  id: string;
  title: string;
  description: string;
  mode: ItemDetail['mode'];
  status: ItemDetail['status'];
  condition: ItemDetail['condition'];
  rent_price: number | null;
  deposit: number | null;
  sale_price: number | null;
  zone_id: number;
  created_at: string;
  zone: { name: string } | null;
  category: { name: string } | null;
  owner: ItemDetail['owner'] | null;
  images: { path: string; position: number }[] | null;
}

async function fetchItem(id: string, myZoneId: number | null, myId: string | null): Promise<ItemDetail | null> {
  const { data, error } = await supabase
    .from('items')
    .select(
      'id,title,description,mode,status,condition,rent_price,deposit,sale_price,zone_id,created_at,' +
        'zone:zones(name),category:categories(name),' +
        'owner:profiles!owner_id(id,display_name,avatar_path,trust_score,ratings_count,swaps_count,department),' +
        'images:item_images(path,position)',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as ItemRow;
  if (!row.owner) return null;

  let distance: number | null = null;
  if (myZoneId !== null) {
    const d = await supabase.rpc('zone_distance_m', { a: myZoneId, b: row.zone_id });
    if (!d.error && typeof d.data === 'number') distance = d.data;
  }
  let saved = false;
  if (myId) {
    const s = await supabase.from('saved_items').select('item_id').eq('item_id', id).eq('user_id', myId).maybeSingle();
    saved = !!s.data;
  }
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    mode: row.mode,
    status: row.status,
    condition: row.condition,
    rent_price: row.rent_price,
    deposit: row.deposit,
    sale_price: row.sale_price,
    zone_id: row.zone_id,
    zone_name: row.zone?.name ?? '',
    category_name: row.category?.name ?? '',
    owner: row.owner,
    images: [...(row.images ?? [])].sort((a, b) => a.position - b.position).map((i) => i.path),
    distance_m: distance,
    is_saved: saved,
    created_at: row.created_at,
  };
}

export function useItem(id: string | undefined, myZoneId: number | null, myId: string | null) {
  return useQuery({
    queryKey: ['item', id, myZoneId],
    enabled: !!id,
    queryFn: () => fetchItem(id as string, myZoneId, myId),
  });
}

export function useToggleSave(myId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, saved }: { itemId: string; saved: boolean }) => {
      if (!myId) throw new Error('Not signed in');
      if (saved) {
        const { error } = await supabase.from('saved_items').delete().eq('item_id', itemId).eq('user_id', myId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('saved_items').insert({ item_id: itemId, user_id: myId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['search'] });
      qc.invalidateQueries({ queryKey: ['item'] });
    },
  });
}

export interface RequestInput {
  itemId: string;
  kind: TxnKind;
  start: string | null; // YYYY-MM-DD
  due: string | null;
  note: string;
}

export function useRequestItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: RequestInput): Promise<string> => {
      const { data, error } = await supabase.rpc('request_item', {
        p_item: r.itemId,
        p_kind: r.kind,
        p_start: r.start,
        p_due: r.due,
        p_note: r.note.trim() || null,
      });
      if (error) throw error;
      return data as string;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['search'] });
      qc.invalidateQueries({ queryKey: ['item'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}
