'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireMembership } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import { normalizeIndianPhone } from '@/lib/utils';
import { fieldErrors, friendlyDbError } from '@/lib/validation';
import type { ActionResult } from './auth';

const uuid = z.string().uuid();
const optNum = z.preprocess((v) => (v === '' || v == null ? null : Number(String(v).replace(/[, ]/g, ''))), z.number().nonnegative().nullable());
const strArr = z.array(z.string().trim().min(1).max(60)).max(20);

function refresh(leadId?: string) {
  revalidatePath('/dashboard/leads');
  revalidatePath('/dashboard/pipeline');
  revalidatePath('/dashboard');
  if (leadId) revalidatePath(`/dashboard/leads/${leadId}`);
}

// ---------------------------------------------------------------------------
const newLeadSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter the name').max(120),
  phone: z.string().trim().refine((v) => normalizeIndianPhone(v) !== null, 'Enter a valid mobile number'),
  email: z.string().trim().toLowerCase().email('Enter a valid email').optional().or(z.literal('')),
  intent: z.enum(['buyer', 'seller', 'landlord', 'tenant', 'investor']),
  source: z.string().trim().max(40).default('manual'),
  preferred_contact: z.enum(['phone', 'whatsapp', 'email']).default('phone'),
  assigned_to: uuid.optional().or(z.literal('')),
  note: z.string().trim().max(2000).optional(),
  consent: z.literal(true, { errorMap: () => ({ message: 'Confirm the person agreed to be contacted' }) }),
});

export async function createLead(input: unknown): Promise<ActionResult & { id?: string }> {
  const { user, membership } = await requireMembership();
  const parsed = newLeadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const v = parsed.data;
  // Brokers can only create leads for themselves (also enforced by RLS).
  const assignee = can(membership.role, 'leads.reassign') ? v.assigned_to || user.id : user.id;
  const phoneNorm = normalizeIndianPhone(v.phone)!;

  const supabase = await createClient();
  const { data: dup } = await supabase.from('leads').select('id, full_name').eq('org_id', membership.orgId)
    .eq('phone_normalized', phoneNorm).is('duplicate_of', null).limit(1).maybeSingle();
  if (dup) return { ok: false, message: `A lead with this mobile already exists: ${dup.full_name}. Open it instead of creating a duplicate.`, id: dup.id };

  const { data, error } = await supabase.from('leads').insert({
    org_id: membership.orgId, full_name: v.full_name, phone: v.phone, phone_normalized: phoneNorm,
    email: v.email || null, intent: v.intent, source: v.source || 'manual', preferred_contact: v.preferred_contact,
    assigned_to: assignee, created_by: user.id,
  }).select('id').single();
  if (error) return { ok: false, message: friendlyDbError(error.message) };

  await supabase.from('consent_records').insert({
    org_id: membership.orgId, lead_id: data.id, purpose: 'enquiry_response',
    channels: Array.from(new Set(['phone', v.preferred_contact])), granted: true,
    consent_text: 'Verbal or written consent recorded by broker', source: 'manual_entry',
  });
  if (v.note) {
    await supabase.from('lead_activities').insert({ org_id: membership.orgId, lead_id: data.id, actor_id: user.id, type: 'note', body: v.note });
  }
  refresh();
  redirect(`/dashboard/leads/${data.id}`);
}

// ---------------------------------------------------------------------------
const contactSchema = z.object({
  leadId: uuid,
  full_name: z.string().trim().min(2).max(120),
  phone: z.string().trim().refine((v) => normalizeIndianPhone(v) !== null, 'Enter a valid mobile number'),
  email: z.string().trim().toLowerCase().email('Enter a valid email').optional().or(z.literal('')),
  preferred_contact: z.enum(['phone', 'whatsapp', 'email']),
  do_not_contact: z.boolean(),
});

export async function updateLeadContact(input: unknown): Promise<ActionResult> {
  await requireMembership();
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const supabase = await createClient();
  const { error, count } = await supabase.from('leads').update({
    full_name: v.full_name, phone: v.phone, phone_normalized: normalizeIndianPhone(v.phone), email: v.email || null,
    preferred_contact: v.preferred_contact, do_not_contact: v.do_not_contact,
  }, { count: 'exact' }).eq('id', v.leadId);
  if (error) return { ok: false, message: friendlyDbError(error.message) };
  if (!count) return { ok: false, message: 'You don’t have permission to edit this lead.' };
  refresh(v.leadId);
  return { ok: true, message: 'Contact details saved.' };
}

// ---------------------------------------------------------------------------
const prefsSchema = z.object({
  leadId: uuid,
  transaction_type: z.enum(['sale', 'rent', 'lease']).nullable().or(z.literal('').transform(() => null)),
  category: z.enum(['residential', 'commercial']).nullable().or(z.literal('').transform(() => null)),
  localities: strArr, property_types: strArr, configurations: strArr, must_have_amenities: strArr,
  budget_min: optNum, budget_max: optNum,
  timeline_days: optNum,
  furnishing: z.enum(['unfurnished', 'semi_furnished', 'fully_furnished']).nullable().or(z.literal('').transform(() => null)),
  possession_pref: z.enum(['ready_to_move', 'under_construction']).nullable().or(z.literal('').transform(() => null)),
}).refine((v) => v.budget_min == null || v.budget_max == null || v.budget_min <= v.budget_max, {
  path: ['budget_max'], message: 'Maximum must be at least the minimum',
});

export async function updatePreferences(input: unknown): Promise<ActionResult> {
  const { membership } = await requireMembership();
  const parsed = prefsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const { leadId, ...v } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from('lead_preferences').upsert({
    lead_id: leadId, org_id: membership.orgId, ...v,
    timeline_days: v.timeline_days == null ? null : Math.round(v.timeline_days),
  }, { onConflict: 'lead_id' });
  if (error) return { ok: false, message: friendlyDbError(error.message) };
  refresh(leadId);
  return { ok: true, message: 'Requirements saved. Score and matches updated.' };
}

// ---------------------------------------------------------------------------
const moveSchema = z.object({
  leadId: uuid,
  stageId: uuid,
  lostReason: z.string().trim().max(300).optional(),
  dealValue: optNum.optional(),
  brokerageAmount: optNum.optional(),
  expectedBrokerage: optNum.optional(),
});

export async function moveLeadStage(input: unknown): Promise<ActionResult> {
  await requireMembership();
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Invalid request.' };
  const v = parsed.data;
  const supabase = await createClient();
  const patch: Record<string, unknown> = { stage_id: v.stageId };
  if (v.lostReason !== undefined) patch.lost_reason = v.lostReason || null;
  if (v.dealValue !== undefined) patch.deal_value = v.dealValue;
  if (v.brokerageAmount !== undefined) patch.brokerage_amount = v.brokerageAmount;
  if (v.expectedBrokerage !== undefined) patch.expected_brokerage = v.expectedBrokerage;
  // Server-side validation lives in the database (leads_before_write): lost needs a reason, etc.
  const { error, count } = await supabase.from('leads').update(patch, { count: 'exact' }).eq('id', v.leadId);
  if (error) return { ok: false, message: friendlyDbError(error.message) };
  if (!count) return { ok: false, message: 'You don’t have permission to move this lead.' };
  refresh(v.leadId);
  return { ok: true, message: 'Stage updated.' };
}

export async function assignLead(input: unknown): Promise<ActionResult> {
  const { membership } = await requireMembership();
  if (!can(membership.role, 'leads.reassign')) return { ok: false, message: 'Only owners and admins can reassign leads.' };
  const parsed = z.object({ leadId: uuid, userId: uuid.nullable() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Invalid request.' };
  const supabase = await createClient();
  const { error } = await supabase.from('leads').update({ assigned_to: parsed.data.userId }).eq('id', parsed.data.leadId);
  if (error) return { ok: false, message: friendlyDbError(error.message) };
  refresh(parsed.data.leadId);
  return { ok: true, message: 'Lead reassigned.' };
}

const bulkSchema = z.object({
  leadIds: z.array(uuid).min(1, 'Select at least one lead').max(100, 'Select at most 100 leads at a time'),
  action: z.enum(['assign', 'stage']),
  value: uuid.nullable(),
});

/** Bulk assign or move (owners/admins). Lost/won require per-lead details, so they're excluded here. */
export async function bulkUpdateLeads(input: unknown): Promise<ActionResult> {
  const { membership } = await requireMembership();
  if (!can(membership.role, 'leads.edit_all')) return { ok: false, message: 'Only owners and admins can use bulk actions.' };
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid request.' };
  const { leadIds, action, value } = parsed.data;
  const supabase = await createClient();
  if (action === 'stage') {
    const { data: stage } = await supabase.from('pipeline_stages').select('is_won, is_lost').eq('id', value!).single();
    if (!stage || stage.is_won || stage.is_lost) return { ok: false, message: 'Mark leads as Won or Lost one at a time so the details are recorded.' };
  }
  const patch = action === 'assign' ? { assigned_to: value } : { stage_id: value };
  const { error, count } = await supabase.from('leads').update(patch, { count: 'exact' }).in('id', leadIds).eq('org_id', membership.orgId);
  if (error) return { ok: false, message: friendlyDbError(error.message) };
  refresh();
  return { ok: true, message: `${count ?? 0} lead${count === 1 ? '' : 's'} updated.` };
}

// ---------------------------------------------------------------------------
const activitySchema = z.object({
  leadId: uuid,
  type: z.enum(['note', 'call', 'whatsapp', 'email', 'meeting']),
  body: z.string().trim().max(5000).optional(),
});

export async function logActivity(input: unknown): Promise<ActionResult> {
  const { user, membership } = await requireMembership();
  const parsed = activitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  if (parsed.data.type === 'note' && !parsed.data.body) return { ok: false, errors: { body: 'Write a note' } };
  const supabase = await createClient();
  const { error } = await supabase.from('lead_activities').insert({
    org_id: membership.orgId, lead_id: parsed.data.leadId, actor_id: user.id, type: parsed.data.type, body: parsed.data.body || null,
  });
  if (error) return { ok: false, message: friendlyDbError(error.message) };
  refresh(parsed.data.leadId);
  return { ok: true, message: parsed.data.type === 'note' ? 'Note added.' : 'Contact logged. A follow-up task was scheduled if none was open.' };
}

export async function overrideScore(input: unknown): Promise<ActionResult> {
  const { membership } = await requireMembership();
  if (!can(membership.role, 'leads.override_score')) return { ok: false, message: 'Only owners and admins can override scores.' };
  const parsed = z.object({
    leadId: uuid,
    category: z.enum(['hot', 'warm', 'cold']).nullable(),
    reason: z.string().trim().max(300).optional(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Invalid request.' };
  const { leadId, category, reason } = parsed.data;
  if (category && !reason) return { ok: false, errors: { reason: 'Give a reason for the override' } };
  const supabase = await createClient();
  const { error } = await supabase.from('leads').update({ score_override: category, override_reason: category ? reason : null }).eq('id', leadId);
  if (error) return { ok: false, message: friendlyDbError(error.message) };
  refresh(leadId);
  return { ok: true, message: category ? 'Override saved.' : 'Override removed.' };
}

export async function recalculateLead(leadId: string): Promise<ActionResult> {
  await requireMembership();
  if (!uuid.safeParse(leadId).success) return { ok: false, message: 'Invalid request.' };
  const supabase = await createClient();
  const a = await supabase.rpc('compute_lead_score', { p_lead: leadId });
  const b = await supabase.rpc('compute_matches', { p_lead: leadId });
  const err = a.error ?? b.error;
  if (err) return { ok: false, message: friendlyDbError(err.message) };
  refresh(leadId);
  return { ok: true, message: `Score and matches recalculated (${b.data ?? 0} matching properties).` };
}

export async function markPropertyShared(input: unknown): Promise<ActionResult> {
  const { user, membership } = await requireMembership();
  const parsed = z.object({ leadId: uuid, propertyId: uuid, title: z.string().max(200) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Invalid request.' };
  const { leadId, propertyId, title } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from('lead_activities').insert({
    org_id: membership.orgId, lead_id: leadId, actor_id: user.id, type: 'property_shared', body: `Shared: ${title}`, meta: { property_id: propertyId },
  });
  if (error) return { ok: false, message: friendlyDbError(error.message) };
  // Move forward to "Property Shared" if the lead is earlier in the pipeline.
  const [{ data: lead }, { data: stages }] = await Promise.all([
    supabase.from('lead_list').select('stage_position, is_won, is_lost').eq('id', leadId).single(),
    supabase.from('pipeline_stages').select('id, position').eq('org_id', membership.orgId).eq('key', 'property_shared').single(),
  ]);
  if (lead && stages && !lead.is_won && !lead.is_lost && (lead.stage_position ?? 0) < stages.position) {
    await supabase.from('leads').update({ stage_id: stages.id }).eq('id', leadId);
  }
  refresh(leadId);
  return { ok: true, message: 'Recorded as shared.' };
}

export async function mergeLeads(input: unknown): Promise<ActionResult> {
  const { membership } = await requireMembership();
  if (!can(membership.role, 'leads.edit_all')) return { ok: false, message: 'Only owners and admins can merge leads.' };
  const parsed = z.object({ keepId: uuid, mergeId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Invalid request.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('merge_leads', { p_keep: parsed.data.keepId, p_merge: parsed.data.mergeId });
  if (error) return { ok: false, message: friendlyDbError(error.message) };
  refresh(parsed.data.keepId);
  return { ok: true, message: 'Leads merged. History, tasks and visits now sit on this lead.' };
}

export async function deleteLead(leadId: string): Promise<ActionResult> {
  const { membership } = await requireMembership();
  if (!can(membership.role, 'leads.edit_all')) return { ok: false, message: 'Only owners and admins can delete leads.' };
  const supabase = await createClient();
  const { error } = await supabase.from('leads').delete().eq('id', leadId).eq('org_id', membership.orgId);
  if (error) return { ok: false, message: friendlyDbError(error.message) };
  refresh();
  redirect('/dashboard/leads');
}
