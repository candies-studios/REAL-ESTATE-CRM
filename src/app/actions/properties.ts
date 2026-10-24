'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireMembership } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import { fieldErrors, friendlyDbError } from '@/lib/validation';
import type { ActionResult } from './auth';

const uuid = z.string().uuid();
const optNum = z.preprocess((v) => (v === '' || v == null ? null : Number(String(v).replace(/[, ]/g, ''))), z.number().nonnegative().nullable());
const optText = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);
const optEnum = <T extends [string, ...string[]]>(vals: T) => z.enum(vals).nullable().or(z.literal('').transform(() => null));

const propertySchema = z.object({
  id: uuid.optional(),
  ref_code: z.string().trim().min(2, 'Enter a listing ID').max(30).regex(/^[A-Za-z0-9-_]+$/, 'Letters, numbers and dashes only'),
  title: z.string().trim().min(3, 'Enter a title').max(160),
  transaction_type: z.enum(['sale', 'rent', 'lease']),
  category: z.enum(['residential', 'commercial']),
  property_type: z.string().trim().min(2).max(40),
  configuration: optText(20),
  locality: z.string().trim().min(2, 'Choose a locality').max(60),
  project_name: optText(120),
  address_private: optText(300),
  public_location: optText(160),
  price: optNum,
  price_on_request: z.boolean().default(false),
  carpet_area: optNum,
  area_unit: z.enum(['sq_ft', 'sq_m']).default('sq_ft'),
  furnishing: optEnum(['unfurnished', 'semi_furnished', 'fully_furnished']),
  possession_status: optEnum(['ready_to_move', 'under_construction']),
  possession_date: z.string().optional().transform((v) => v || null),
  amenities: z.array(z.string().trim().min(1).max(40)).max(40).default([]),
  description: optText(5000),
  status: z.enum(['draft', 'available', 'reserved', 'sold', 'rented', 'inactive']),
  is_demo: z.boolean().default(false),
  assigned_broker: uuid.optional().or(z.literal('')).transform((v) => v || null),
  listing_source: optText(60),
  rera_number: optText(60),
  rera_project_name: optText(160),
  internal_notes: optText(5000),
}).refine((v) => v.price_on_request || v.price != null || v.status === 'draft', { path: ['price'], message: 'Enter a price or tick “Price on request”' });

export async function saveProperty(input: unknown): Promise<ActionResult> {
  const { user, membership } = await requireMembership();
  if (!can(membership.role, 'inventory.manage')) return { ok: false, message: 'Only owners and admins can manage inventory.' };
  const parsed = propertySchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error), message: 'Check the highlighted fields.' };
  const { id, ...v } = parsed.data;
  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from('properties').update(v).eq('id', id).eq('org_id', membership.orgId);
    if (error) return { ok: false, message: friendlyDbError(error.message) };
    revalidatePath(`/dashboard/properties/${id}`);
    revalidatePath('/dashboard/properties');
    revalidatePath('/properties');
    return { ok: true, message: 'Listing saved.' };
  }
  const { data, error } = await supabase.from('properties').insert({ ...v, org_id: membership.orgId, created_by: user.id }).select('id').single();
  if (error) return { ok: false, message: friendlyDbError(error.message) };
  revalidatePath('/dashboard/properties');
  redirect(`/dashboard/properties/${data.id}?created=1`);
}

const opSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('verify'), id: uuid }),
  z.object({ op: z.literal('publish'), id: uuid, published: z.boolean() }),
  z.object({ op: z.literal('add_media'), id: uuid, path: z.string().min(5).max(300), alt: z.string().max(200).optional() }),
  z.object({ op: z.literal('cover'), id: uuid, mediaId: uuid }),
  z.object({ op: z.literal('remove_media'), id: uuid, mediaId: uuid }),
  z.object({ op: z.literal('alt'), id: uuid, mediaId: uuid, alt: z.string().max(200) }),
]);

export async function propertyOperation(input: unknown): Promise<ActionResult> {
  const { membership } = await requireMembership();
  if (!can(membership.role, 'inventory.manage')) return { ok: false, message: 'Only owners and admins can manage inventory.' };
  const parsed = opSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Invalid request.' };
  const v = parsed.data;
  const org = membership.orgId;
  const supabase = await createClient();
  let error;
  let message = 'Saved.';
  switch (v.op) {
    case 'verify':
      ({ error } = await supabase.from('properties').update({ last_verified_at: new Date().toISOString() }).eq('id', v.id).eq('org_id', org));
      // Close any open re-verification task for this listing.
      await supabase.from('tasks').update({ status: 'done' }).eq('org_id', org).eq('type', 'reverify_listing').like('dedupe_key', `reverify:${v.id}:%`).eq('status', 'open');
      message = 'Marked as verified today.';
      break;
    case 'publish':
      ({ error } = await supabase.from('properties').update({ is_published: v.published }).eq('id', v.id).eq('org_id', org));
      message = v.published ? 'Published on the website.' : 'Removed from the website.';
      break;
    case 'add_media': {
      if (!v.path.startsWith(`${org}/${v.id}/`)) return { ok: false, message: 'Invalid upload path.' };
      const { count } = await supabase.from('property_media').select('id', { count: 'exact', head: true }).eq('property_id', v.id);
      ({ error } = await supabase.from('property_media').insert({
        org_id: org, property_id: v.id, storage_path: v.path, alt_text: v.alt || null, position: count ?? 0, is_cover: (count ?? 0) === 0,
      }));
      message = 'Photo added.';
      break;
    }
    case 'cover':
      await supabase.from('property_media').update({ is_cover: false }).eq('property_id', v.id).eq('org_id', org);
      ({ error } = await supabase.from('property_media').update({ is_cover: true }).eq('id', v.mediaId).eq('org_id', org));
      message = 'Cover photo set.';
      break;
    case 'alt':
      ({ error } = await supabase.from('property_media').update({ alt_text: v.alt || null }).eq('id', v.mediaId).eq('org_id', org));
      message = 'Description saved.';
      break;
    case 'remove_media': {
      const { data: m } = await supabase.from('property_media').select('storage_path').eq('id', v.mediaId).eq('org_id', org).single();
      ({ error } = await supabase.from('property_media').delete().eq('id', v.mediaId).eq('org_id', org));
      if (!error && m) await supabase.storage.from('property-media').remove([m.storage_path]);
      message = 'Photo removed.';
      break;
    }
  }
  if (error) return { ok: false, message: friendlyDbError(error.message) };
  revalidatePath(`/dashboard/properties/${v.id}`);
  revalidatePath('/dashboard/properties');
  revalidatePath('/properties');
  revalidatePath(`/properties/${v.id}`);
  return { ok: true, message };
}
