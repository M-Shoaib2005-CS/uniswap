import { useMutation, useQueryClient } from '@tanstack/react-query';
import { compressAndUpload, PickedImage, removeFiles } from '@/lib/images';
import { supabase } from '@/lib/supabase';
import { ListingForm, parseMoney } from './validation';

export type PhotoDraft =
  | { key: string; kind: 'existing'; path: string }
  | { key: string; kind: 'new'; image: PickedImage };

function row(userId: string | null, f: ListingForm) {
  const rent = f.mode === 'rent' || f.mode === 'both';
  const sale = f.mode === 'sell' || f.mode === 'both';
  return {
    ...(userId ? { owner_id: userId } : {}),
    title: f.title.trim(),
    description: f.description.trim(),
    category_id: f.categoryId,
    condition: f.condition,
    mode: f.mode,
    rent_price: rent ? parseMoney(f.rentPrice) : null,
    deposit: rent ? parseMoney(f.deposit) : null,
    sale_price: sale ? parseMoney(f.salePrice) : null,
    zone_id: f.zoneId,
  };
}

/** Uploads new photos, returning their paths in order (existing ones keep their path). */
async function resolvePhotos(userId: string, photos: PhotoDraft[], uploaded: string[]): Promise<string[]> {
  const paths: string[] = [];
  for (const p of photos) {
    if (p.kind === 'existing') {
      paths.push(p.path);
    } else {
      const path = await compressAndUpload('item-images', userId, p.image);
      uploaded.push(path);
      paths.push(path);
    }
  }
  return paths;
}

async function writeImageRows(itemId: string, paths: string[]): Promise<void> {
  const del = await supabase.from('item_images').delete().eq('item_id', itemId);
  if (del.error) throw del.error;
  if (paths.length === 0) return;
  const ins = await supabase.from('item_images').insert(paths.map((path, position) => ({ item_id: itemId, path, position })));
  if (ins.error) throw ins.error;
}

export interface SaveInput {
  userId: string;
  editId: string | null;
  form: ListingForm;
  photos: PhotoDraft[];
  originalPaths: string[]; // photo paths the listing had before editing
}

export async function saveListing(input: SaveInput): Promise<string> {
  const uploaded: string[] = [];
  try {
    const paths = await resolvePhotos(input.userId, input.photos, uploaded);
    let itemId = input.editId;
    if (itemId) {
      const { error } = await supabase.from('items').update(row(null, input.form)).eq('id', itemId);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from('items').insert(row(input.userId, input.form)).select('id').single();
      if (error) throw error;
      itemId = (data as { id: string }).id;
    }
    try {
      await writeImageRows(itemId, paths);
    } catch (e) {
      if (!input.editId) await supabase.from('items').delete().eq('id', itemId); // do not leave a listing with no photos
      throw e;
    }
    await removeFiles(
      'item-images',
      input.originalPaths.filter((p) => !paths.includes(p)),
    );
    return itemId;
  } catch (e) {
    await removeFiles('item-images', uploaded);
    throw e;
  }
}

export function useSaveListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveListing,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['search'] });
      qc.invalidateQueries({ queryKey: ['item'] });
    },
  });
}

export function useArchiveListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase.from('items').update({ status: archived ? 'archived' : 'available' }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['search'] });
      qc.invalidateQueries({ queryKey: ['item'] });
    },
  });
}

export function useDeleteListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, paths }: { id: string; paths: string[] }) => {
      const { error } = await supabase.from('items').delete().eq('id', id);
      if (error) throw error;
      await removeFiles('item-images', paths);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['search'] });
      qc.invalidateQueries({ queryKey: ['item'] });
    },
  });
}

export function useBoostListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('boost_item', { p_item: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['search'] });
      qc.invalidateQueries({ queryKey: ['item'] });
    },
  });
}
