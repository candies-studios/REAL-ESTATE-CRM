import 'server-only';
import { cache } from 'react';
import { isSupabaseConfigured } from './supabase/env';
import { createClient } from './supabase/server';

export type PublicProperty = {
  id: string;
  org_id: string;
  ref_code: string;
  title: string;
  transaction_type: 'sale' | 'rent' | 'lease';
  category: 'residential' | 'commercial';
  property_type: string;
  configuration: string | null;
  locality: string;
  city: string;
  project_name: string | null;
  public_location: string | null;
  price: number | null;
  price_on_request: boolean;
  carpet_area: number | null;
  area_unit: 'sq_ft' | 'sq_m';
  furnishing: string | null;
  possession_status: string | null;
  possession_date: string | null;
  amenities: string[];
  description: string | null;
  status: 'available' | 'reserved';
  is_demo: boolean;
  last_verified_at: string | null;
  rera_number: string | null;
  rera_project_name: string | null;
  cover_path: string | null;
};

export type ListingFilters = {
  locality?: string;
  category?: string;
  transaction?: string;
  type?: string;
  maxBudget?: number;
  sort?: string;
};

const PAGE_SIZE = 12;

/** The brokerage this public website belongs to. */
export const getSiteOrgId = cache(async (): Promise<string | null> => {
  if (process.env.NEXT_PUBLIC_SITE_ORG_ID) return process.env.NEXT_PUBLIC_SITE_ORG_ID;
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc('default_public_org');
  return (data as string | null) ?? null;
});

/** Published listings only, via the public_properties view (no private fields). */
export async function getPublicProperties(filters: ListingFilters = {}, page = 1) {
  const empty = { items: [] as PublicProperty[], total: 0, pageSize: PAGE_SIZE };
  const org = await getSiteOrgId();
  if (!org) return empty;
  const supabase = await createClient();
  let q = supabase.from('public_properties').select('*', { count: 'exact' }).eq('org_id', org);
  if (filters.locality) q = q.eq('locality', filters.locality);
  if (filters.category === 'residential' || filters.category === 'commercial') q = q.eq('category', filters.category);
  if (filters.transaction && ['sale', 'rent', 'lease'].includes(filters.transaction)) q = q.eq('transaction_type', filters.transaction);
  if (filters.type) q = q.ilike('property_type', filters.type);
  if (filters.maxBudget && filters.maxBudget > 0) q = q.lte('price', filters.maxBudget);
  if (filters.sort === 'price_asc') q = q.order('price', { ascending: true, nullsFirst: false });
  else if (filters.sort === 'price_desc') q = q.order('price', { ascending: false, nullsFirst: false });
  else q = q.order('updated_at', { ascending: false });
  const from = (Math.max(page, 1) - 1) * PAGE_SIZE;
  const { data, count, error } = await q.range(from, from + PAGE_SIZE - 1);
  if (error) return empty;
  return { items: (data ?? []) as PublicProperty[], total: count ?? 0, pageSize: PAGE_SIZE };
}

export async function getPublicProperty(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const org = await getSiteOrgId();
  if (!org) return null;
  const supabase = await createClient();
  const { data } = await supabase.from('public_properties').select('*').eq('id', id).eq('org_id', org).maybeSingle();
  return (data as PublicProperty | null) ?? null;
}

export async function getPublicMedia(propertyId: string) {
  if (!isSupabaseConfigured) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('public_property_media')
    .select('id, storage_path, alt_text, position, is_cover')
    .eq('property_id', propertyId)
    .order('is_cover', { ascending: false })
    .order('position');
  return (data ?? []) as { id: string; storage_path: string; alt_text: string | null; is_cover: boolean }[];
}

export async function getSimilarProperties(p: PublicProperty, limit = 3) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('public_properties')
    .select('*')
    .eq('org_id', p.org_id)
    .eq('transaction_type', p.transaction_type)
    .neq('id', p.id)
    .or(`locality.eq."${p.locality.replace(/"/g, '')}",property_type.eq."${p.property_type.replace(/"/g, '')}"`)
    .limit(limit);
  return (data ?? []) as PublicProperty[];
}

export async function getPublicPropertiesByIds(ids: string[]) {
  const clean = ids.filter((i) => /^[0-9a-f-]{36}$/i.test(i)).slice(0, 50);
  const org = await getSiteOrgId();
  if (!org || clean.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase.from('public_properties').select('*').eq('org_id', org).in('id', clean);
  return (data ?? []) as PublicProperty[];
}
