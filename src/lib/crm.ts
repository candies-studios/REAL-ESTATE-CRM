import 'server-only';
import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Role } from './permissions';
import { sanitizeSearch } from './crm-search';
import { createClient } from './supabase/server';

export type Stage = { id: string; key: string; name: string; position: number; is_won: boolean; is_lost: boolean; is_active: boolean };
export type Member = { user_id: string; role: Role; name: string };

export const getStages = cache(async (org: string): Promise<Stage[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from('pipeline_stages').select('id, key, name, position, is_won, is_lost, is_active')
    .eq('org_id', org).order('position');
  return (data ?? []) as Stage[];
});

export const getMembers = cache(async (org: string): Promise<Member[]> => {
  const supabase = await createClient();
  const { data: roles } = await supabase.from('user_roles').select('user_id, role').eq('org_id', org);
  const ids = (roles ?? []).map((r) => r.user_id as string);
  const { data: profiles } = ids.length ? await supabase.from('profiles').select('id, full_name, email').in('id', ids) : { data: [] };
  const byId = new Map((profiles ?? []).map((p) => [p.id as string, (p.full_name || p.email || 'Team member') as string]));
  return (roles ?? []).map((r) => ({ user_id: r.user_id as string, role: r.role as Role, name: byId.get(r.user_id) ?? 'Team member' }))
    .sort((a, b) => a.name.localeCompare(b.name));
});

export type LeadListParams = {
  q?: string; stage?: string; broker?: string; source?: string; category?: string;
  from?: string; to?: string; sort?: string; page?: number; intent?: string; due?: string;
};

export const LEAD_PAGE_SIZE = 25;


export function buildLeadQuery(supabase: SupabaseClient, org: string, p: LeadListParams, opts: { count?: boolean; select?: string } = {}) {
  let q = supabase.from('lead_list').select(opts.select ?? '*', opts.count ? { count: 'exact' } : undefined)
    .eq('org_id', org).is('duplicate_of', null);
  const term = p.q ? sanitizeSearch(p.q) : '';
  if (term) {
    const t = `%${term}%`;
    q = q.or(`full_name.ilike.${t},phone.ilike.${t},phone_normalized.ilike.${t},email.ilike.${t},localities_text.ilike.${t},properties_text.ilike.${t}`);
  }
  if (p.stage) q = q.eq('stage_id', p.stage);
  if (p.broker === 'unassigned') q = q.is('assigned_to', null);
  else if (p.broker) q = q.eq('assigned_to', p.broker);
  if (p.source) q = q.eq('source', p.source);
  if (p.intent) q = q.eq('intent', p.intent);
  if (p.category === 'unscored') q = q.is('effective_category', null);
  else if (p.category) q = q.eq('effective_category', p.category);
  if (p.from) q = q.gte('created_at', new Date(`${p.from}T00:00:00+05:30`).toISOString());
  if (p.to) q = q.lt('created_at', new Date(new Date(`${p.to}T00:00:00+05:30`).getTime() + 86_400_000).toISOString());
  if (p.due === 'overdue') q = q.lt('next_follow_up_at', new Date().toISOString());
  switch (p.sort) {
    case 'score': q = q.order('score', { ascending: false, nullsFirst: false }); break;
    case 'follow_up': q = q.order('next_follow_up_at', { ascending: true, nullsFirst: false }); break;
    case 'name': q = q.order('full_name', { ascending: true }); break;
    case 'oldest': q = q.order('created_at', { ascending: true }); break;
    default: q = q.order('created_at', { ascending: false });
  }
  return q;
}

export function parseLeadParams(sp: Record<string, string | string[] | undefined>): LeadListParams {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
  return {
    q: one(sp.q), stage: one(sp.stage), broker: one(sp.broker), source: one(sp.source), category: one(sp.category),
    from: one(sp.from), to: one(sp.to), sort: one(sp.sort), intent: one(sp.intent), due: one(sp.due),
    page: Math.max(1, Number(one(sp.page)) || 1),
  };
}

export async function supabaseServer() {
  return createClient();
}
