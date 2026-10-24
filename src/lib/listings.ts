import 'server-only';
import { isSupabaseConfigured } from './supabase/env';
import { createClient } from './supabase/server';

export type PublicProperty = {
  id: string;
  ref_code: string;
  title: string;
  transaction_type: 'sale' | 'rent' | 'lease';
  category: 'residential' | 'commercial';
  property_type: string;
  configuration: string | null;
  locality: string;
  city: string;
  project_name: string | null;
  price: number | null;
  price_on_request: boolean;
  carpet_area: number | null;
  area_unit: 'sq_ft' | 'sq_m';
  furnishing: string | null;
  possession_status: string | null;
  status: 'available' | 'reserved';
  is_demo: boolean;
  last_verified_at: string | null;
  rera_number: string | null;
  cover_path: string | null;
};

export type ListingFilters = {
  locality?: string;
  category?: string;
  transaction?: string;
  type?: string;
  maxBudget?: number;
};

const PAGE_SIZE = 12;

/**
 * Published listings only, via the public_properties view (no private fields).
 * Returns an empty list when Supabase isn't configured yet.
 */
export async function getPublicProperties(filters: ListingFilters = {}, page = 1) {
  if (!isSupabaseConfigured) return { items: [] as PublicProperty[], total: 0, pageSize: PAGE_SIZE };
  const supabase = await createClient();
  let q = supabase.from('public_properties').select('*', { count: 'exact' });
  if (filters.locality) q = q.eq('locality', filters.locality);
  if (filters.category === 'residential' || filters.category === 'commercial') q = q.eq('category', filters.category);
  if (filters.transaction && ['sale', 'rent', 'lease'].includes(filters.transaction)) q = q.eq('transaction_type', filters.transaction);
  if (filters.type) q = q.ilike('property_type', filters.type);
  if (filters.maxBudget && filters.maxBudget > 0) q = q.lte('price', filters.maxBudget);
  const from = (Math.max(page, 1) - 1) * PAGE_SIZE;
  const { data, count, error } = await q.order('updated_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
  if (error) return { items: [] as PublicProperty[], total: 0, pageSize: PAGE_SIZE };
  return { items: (data ?? []) as PublicProperty[], total: count ?? 0, pageSize: PAGE_SIZE };
}
