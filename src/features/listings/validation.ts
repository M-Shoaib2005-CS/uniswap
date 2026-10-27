// Pure listing-form rules (unit-tested). They mirror the database constraints.
import type { Condition, ListingMode } from '../../types/models';

export interface ListingForm {
  title: string;
  description: string;
  categoryId: number | null;
  condition: Condition;
  mode: ListingMode;
  rentPrice: string;
  deposit: string;
  salePrice: string;
  zoneId: number | null;
}

export type ListingErrors = Partial<Record<'photos' | 'title' | 'description' | 'categoryId' | 'rentPrice' | 'deposit' | 'salePrice' | 'zoneId', string>>;

export const MAX_PHOTOS = 5;
const MAX_PRICE = 1_000_000;

/** Whole numbers only. Returns null when the text is not a valid non-negative integer. */
export function parseMoney(text: string): number | null {
  const t = text.replace(/[,\s]/g, '');
  if (!/^\d{1,9}$/.test(t)) return null;
  return Number(t);
}

export function validateListing(f: ListingForm, photoCount: number): ListingErrors {
  const e: ListingErrors = {};
  if (photoCount < 1) e.photos = 'Add at least one photo';
  if (photoCount > MAX_PHOTOS) e.photos = `You can add up to ${MAX_PHOTOS} photos`;

  const title = f.title.trim();
  if (title.length < 3) e.title = 'Give your listing a title (at least 3 characters)';
  else if (title.length > 80) e.title = 'Title is too long (80 characters max)';

  if (f.description.length > 1000) e.description = 'Description is too long (1000 characters max)';
  if (f.categoryId === null) e.categoryId = 'Choose a category';
  if (f.zoneId === null) e.zoneId = 'Choose a pickup zone';

  if (f.mode === 'rent' || f.mode === 'both') {
    const rent = parseMoney(f.rentPrice);
    if (rent === null || rent <= 0) e.rentPrice = 'Enter the rent per semester';
    else if (rent > MAX_PRICE) e.rentPrice = 'That price looks too high';
    const dep = parseMoney(f.deposit);
    if (dep === null) e.deposit = 'Enter a deposit (0 if none)';
    else if (dep > MAX_PRICE) e.deposit = 'That deposit looks too high';
  }
  if (f.mode === 'sell' || f.mode === 'both') {
    const sale = parseMoney(f.salePrice);
    if (sale === null || sale <= 0) e.salePrice = 'Enter the sale price';
    else if (sale > MAX_PRICE) e.salePrice = 'That price looks too high';
  }
  return e;
}

export function hasErrors(e: ListingErrors): boolean {
  return Object.keys(e).length > 0;
}
