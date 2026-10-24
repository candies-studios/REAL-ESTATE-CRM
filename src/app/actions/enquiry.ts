'use server';

import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { getPublicPropertiesByIds, getSiteOrgId } from '@/lib/listings';
import { enquirySchema, friendlyEnquiryError, toEnquiryPayload } from '@/lib/enquiry';
import { createClient } from '@/lib/supabase/server';
import { fieldErrors } from '@/lib/validation';

export type EnquiryResult = { ok: boolean; reference?: string; message?: string; errors?: Record<string, string> };

export async function submitEnquiry(input: unknown, context: { landingPage?: string; utm?: Record<string, string> } = {}): Promise<EnquiryResult> {
  const parsed = enquirySchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error), message: 'Please check the highlighted fields.' };

  // Honeypot filled in: pretend success so bots learn nothing, store nothing.
  if (parsed.data.company) return { ok: true, reference: 'RECEIVED' };

  const org = await getSiteOrgId();
  if (!org) return { ok: false, message: 'Online enquiries aren’t set up yet. Please call us instead.' };

  const h = await headers();
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || '';
  const salt = process.env.ENQUIRY_IP_SALT || 'navi-estates';
  // Only a salted hash is stored, used for rate limiting.
  const ipHash = ip ? createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32) : undefined;

  const utm = Object.fromEntries(
    Object.entries(context.utm ?? {})
      .filter(([k, v]) => ['utm_source', 'utm_medium', 'utm_campaign'].includes(k) && typeof v === 'string')
      .map(([k, v]) => [k, v.slice(0, 80)]),
  );

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('submit_enquiry', {
    p: toEnquiryPayload(parsed.data, { org_id: org, landing_page: context.landingPage?.slice(0, 300), ip_hash: ipHash, utm }),
  });
  if (error) return { ok: false, message: friendlyEnquiryError(error.message) };
  return { ok: true, reference: (data as { reference?: string })?.reference };
}

/** For the visitor's shortlist (stored in their browser). */
export async function getShortlist(ids: string[]) {
  return getPublicPropertiesByIds(Array.isArray(ids) ? ids.map(String) : []);
}
