import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Category, Zone } from '@/types/models';

export function useZones() {
  return useQuery({
    queryKey: ['zones'],
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<Zone[]> => {
      const { data, error } = await supabase.from('zones').select('id,name,category,lat,lng').eq('active', true).order('name');
      if (error) throw error;
      return (data ?? []) as Zone[];
    },
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase.from('categories').select('id,name').eq('active', true).order('sort');
      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });
}
