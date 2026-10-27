export type ListingMode = 'rent' | 'sell' | 'both';
export type ListingStatus = 'available' | 'requested' | 'rented' | 'sold' | 'archived';
export type Condition = 'new' | 'like_new' | 'good' | 'fair';
export type SortKey = 'distance' | 'price' | 'newest';
export type ModeFilter = 'rent' | 'buy' | 'all';
export type TxnKind = 'rent' | 'buy';

export interface Zone {
  id: number;
  name: string;
  category: string;
  lat: number;
  lng: number;
}

export interface Category {
  id: number;
  name: string;
}

export interface Profile {
  id: string;
  display_name: string;
  avatar_path: string | null;
  department: string | null;
  default_zone_id: number | null;
  is_admin: boolean;
  is_suspended: boolean;
  trust_score: number | null;
  ratings_count: number;
  swaps_count: number;
  is_pro: boolean;
  pro_until: string | null;
  founding_member: boolean;
  created_at: string;
}

/** One row returned by the search_items() database function. */
export interface SearchItem {
  id: string;
  title: string;
  mode: ListingMode;
  status: ListingStatus;
  condition: Condition;
  rent_price: number | null;
  deposit: number | null;
  sale_price: number | null;
  zone_id: number;
  zone_name: string;
  category_id: number;
  category_name: string;
  distance_m: number | null;
  cover_path: string | null;
  owner_id: string;
  owner_name: string;
  owner_trust: number | null;
  created_at: string;
  boosted: boolean;
  is_saved: boolean;
}

export interface ItemDetail {
  id: string;
  title: string;
  description: string;
  mode: ListingMode;
  status: ListingStatus;
  condition: Condition;
  rent_price: number | null;
  deposit: number | null;
  sale_price: number | null;
  zone_id: number;
  zone_name: string;
  category_name: string;
  owner: {
    id: string;
    display_name: string;
    avatar_path: string | null;
    trust_score: number | null;
    ratings_count: number;
    swaps_count: number;
    department: string | null;
  };
  images: string[]; // storage paths ordered by position
  distance_m: number | null;
  is_saved: boolean;
  created_at: string;
}

export const CONDITION_LABEL: Record<Condition, string> = {
  new: 'New',
  like_new: 'Like new',
  good: 'Good condition',
  fair: 'Fair condition',
};

export const STATUS_LABEL: Record<ListingStatus, string> = {
  available: 'Available',
  requested: 'Requested',
  rented: 'Rented',
  sold: 'Sold',
  archived: 'Archived',
};
