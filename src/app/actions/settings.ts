'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireMembership } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import { fieldErrors, friendlyDbError } from '@/lib/validation';
import type { ActionResult } from './auth';

async function guard() {
  const ctx = await requireMembership();
  if (!can(ctx.membership.role, 'pipeline.configure')) throw new Error('forbidden');
  return ctx;
}

const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');

const settingsSchema = z.object({
  scoring: z.object({
    budget_match: int(0, 100), locality_match: int(0, 100), timeline_30d: int(0, 100), valid_contact: int(0, 100),
    specific_property: int(0, 100), site_visit_request: int(0, 100), hot_min: int(1, 100), warm_min: int(0, 99),
  }),
  automation: z.object({
    first_contact_minutes: int(1, 1440), follow_up_days: int(1, 60), overdue_escalation_hours: int(1, 336),
    visit_reminder_hours: int(1, 168), negotiation_follow_up_days: int(1, 30), post_visit_follow_up_days: int(0, 30),
    stale_listing_days: int(1, 365), work_start: time, work_end: time, auto_assign: z.boolean(),
  }),
});

export async function saveSettings(input: unknown): Promise<ActionResult> {
  let ctx;
  try { ctx = await guard(); } catch { return { ok: false, message: 'Only owners and admins can change settings.' }; }
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error), message: 'Check the highlighted values.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('update_org_settings', { p_org: ctx.membership.orgId, p_settings: parsed.data });
  if (error) return { ok: false, message: friendlyDbError(error.message) };
  revalidatePath('/dashboard/settings');
  return { ok: true, message: 'Settings saved. New scores apply as leads are updated; use “Recalculate” on a lead to refresh it now.' };
}

export async function saveOrganization(input: unknown): Promise<ActionResult> {
  const { membership } = await requireMembership();
  if (membership.role !== 'owner') return { ok: false, message: 'Only owners can change organization details.' };
  const parsed = z.object({ name: z.string().trim().min(2).max(120), accepts_public_enquiries: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.from('organizations').update(parsed.data).eq('id', membership.orgId);
  if (error) return { ok: false, message: friendlyDbError(error.message) };
  revalidatePath('/dashboard', 'layout');
  return { ok: true, message: 'Organization updated.' };
}

const stageOp = z.discriminatedUnion('op', [
  z.object({ op: z.literal('rename'), id: z.string().uuid(), name: z.string().trim().min(1).max(60) }),
  z.object({ op: z.literal('toggle'), id: z.string().uuid(), active: z.boolean() }),
  z.object({ op: z.literal('move'), id: z.string().uuid(), dir: z.enum(['up', 'down']) }),
  z.object({ op: z.literal('add'), name: z.string().trim().min(1).max(60) }),
]);

export async function updateStage(input: unknown): Promise<ActionResult> {
  let ctx;
  try { ctx = await guard(); } catch { return { ok: false, message: 'Only owners and admins can configure the pipeline.' }; }
  const parsed = stageOp.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Enter a stage name.' };
  const v = parsed.data;
  const org = ctx.membership.orgId;
  const supabase = await createClient();
  const { data: stages } = await supabase.from('pipeline_stages').select('id, key, position').eq('org_id', org).order('position');
  const list = stages ?? [];
  let error;
  if (v.op === 'rename') ({ error } = await supabase.from('pipeline_stages').update({ name: v.name }).eq('id', v.id).eq('org_id', org));
  if (v.op === 'toggle') {
    const s = list.find((x) => x.id === v.id);
    if (s && ['new_enquiry', 'won', 'lost'].includes(s.key) && !v.active) return { ok: false, message: 'New Enquiry, Won and Lost are always needed.' };
    ({ error } = await supabase.from('pipeline_stages').update({ is_active: v.active }).eq('id', v.id).eq('org_id', org));
  }
  if (v.op === 'move') {
    const i = list.findIndex((x) => x.id === v.id);
    const j = v.dir === 'up' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= list.length) return { ok: true };
    // Swap positions (temporary value avoids clashing if positions were unique).
    const a = list[i], b = list[j];
    ({ error } = await supabase.from('pipeline_stages').update({ position: b.position }).eq('id', a.id));
    if (!error) ({ error } = await supabase.from('pipeline_stages').update({ position: a.position }).eq('id', b.id));
  }
  if (v.op === 'add') {
    const key = `custom_${v.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'stage'}_${Date.now().toString(36).slice(-4)}`;
    const lost = list.find((x) => x.key === 'won');
    const position = lost ? lost.position : (list.at(-1)?.position ?? 0) + 1;
    // Insert before Won by shifting later stages down.
    for (const s of [...list].reverse()) {
      if (s.position >= position) await supabase.from('pipeline_stages').update({ position: s.position + 1 }).eq('id', s.id);
    }
    ({ error } = await supabase.from('pipeline_stages').insert({ org_id: org, key, name: v.name, position }));
  }
  if (error) return { ok: false, message: friendlyDbError(error.message) };
  revalidatePath('/dashboard/settings');
  revalidatePath('/dashboard/pipeline');
  return { ok: true, message: 'Pipeline updated.' };
}

export async function runAutomationNow(): Promise<ActionResult> {
  let ctx;
  try { ctx = await guard(); } catch { return { ok: false, message: 'Only owners and admins can run automation.' }; }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('run_my_automation', { p_org: ctx.membership.orgId });
  if (error) return { ok: false, message: friendlyDbError(error.message) };
  const r = data as Record<string, number>;
  revalidatePath('/dashboard', 'layout');
  return {
    ok: true,
    message: `Done: ${r.due_today_reminders} due-today reminders, ${r.escalated} escalations, ${r.no_contact_reminders} no-contact reminders, ${r.visit_outcome_tasks} visit-outcome tasks, ${r.reverify_tasks} re-verification tasks, ${r.reopened} snoozed tasks reopened.`,
  };
}
