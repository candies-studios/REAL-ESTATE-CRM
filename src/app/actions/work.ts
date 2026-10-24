'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireMembership } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import { fieldErrors, friendlyDbError } from '@/lib/validation';
import type { ActionResult } from './auth';

const uuid = z.string().uuid();

function refresh(leadId?: string | null) {
  revalidatePath('/dashboard/tasks');
  revalidatePath('/dashboard/site-visits');
  revalidatePath('/dashboard');
  if (leadId) revalidatePath(`/dashboard/leads/${leadId}`);
}

/** datetime-local value (in the org's IST wall time) → ISO instant. */
function istToIso(local: string) {
  const d = new Date(`${local.length === 16 ? `${local}:00` : local}+05:30`);
  if (Number.isNaN(d.getTime())) throw new Error('bad date');
  return d.toISOString();
}

// ---------------------------------------------------------------- tasks
const taskSchema = z.object({
  leadId: uuid.optional().or(z.literal('')),
  title: z.string().trim().min(2, 'Describe the task').max(200),
  due: z.string().min(10, 'Choose a due date and time'),
  assignedTo: uuid.optional().or(z.literal('')),
});

export async function createTask(input: unknown): Promise<ActionResult> {
  const { user, membership } = await requireMembership();
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const v = parsed.data;
  let due: string;
  try { due = istToIso(v.due); } catch { return { ok: false, errors: { due: 'Choose a valid date and time' } }; }
  const assignee = can(membership.role, 'leads.reassign') ? v.assignedTo || user.id : user.id;
  const supabase = await createClient();
  const { error } = await supabase.from('tasks').insert({
    org_id: membership.orgId, lead_id: v.leadId || null, assigned_to: assignee, title: v.title, due_at: due, created_by: user.id,
  });
  if (error) return { ok: false, message: friendlyDbError(error.message) };
  refresh(v.leadId);
  return { ok: true, message: 'Task added.' };
}

const taskActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('complete'), taskId: uuid }),
  z.object({ action: z.literal('reopen'), taskId: uuid }),
  z.object({ action: z.literal('cancel'), taskId: uuid }),
  z.object({ action: z.literal('snooze'), taskId: uuid, until: z.enum(['1h', '3h', 'tomorrow', 'next_week']) }),
  z.object({ action: z.literal('reassign'), taskId: uuid, userId: uuid }),
]);

function snoozeUntil(choice: '1h' | '3h' | 'tomorrow' | 'next_week'): string {
  const now = new Date();
  if (choice === '1h') return new Date(now.getTime() + 3_600_000).toISOString();
  if (choice === '3h') return new Date(now.getTime() + 3 * 3_600_000).toISOString();
  // 10:00 IST tomorrow / in 7 days
  const ist = new Date(now.getTime() + 5.5 * 3_600_000);
  const days = choice === 'tomorrow' ? 1 : 7;
  const target = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + days, 10, 0) - 5.5 * 3_600_000;
  return new Date(target).toISOString();
}

export async function updateTask(input: unknown): Promise<ActionResult> {
  const { membership } = await requireMembership();
  const parsed = taskActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Invalid request.' };
  const v = parsed.data;
  if (v.action === 'reassign' && !can(membership.role, 'leads.reassign')) {
    return { ok: false, message: 'Only owners and admins can reassign tasks.' };
  }
  const patch =
    v.action === 'complete' ? { status: 'done' } :
    v.action === 'reopen' ? { status: 'open', snoozed_until: null } :
    v.action === 'cancel' ? { status: 'cancelled' } :
    v.action === 'snooze' ? { status: 'snoozed', snoozed_until: snoozeUntil(v.until) } :
    { assigned_to: v.userId };
  const supabase = await createClient();
  const { data, error } = await supabase.from('tasks').update(patch).eq('id', v.taskId).select('lead_id');
  if (error) return { ok: false, message: friendlyDbError(error.message) };
  if (!data?.length) return { ok: false, message: 'You can only update your own tasks.' };
  refresh(data[0].lead_id as string | null);
  return { ok: true, message: v.action === 'complete' ? 'Done.' : v.action === 'snooze' ? 'Snoozed.' : 'Task updated.' };
}

// ---------------------------------------------------------------- site visits
const visitSchema = z.object({
  leadId: uuid,
  propertyId: uuid.optional().or(z.literal('')),
  brokerId: uuid.optional().or(z.literal('')),
  startsAt: z.string().min(10, 'Choose a date and time'),
  durationMin: z.coerce.number().int().min(15).max(480).default(60),
  meetingPoint: z.string().trim().max(200).optional(),
  buyerConfirmed: z.boolean().optional(),
});

export async function scheduleVisit(input: unknown): Promise<ActionResult> {
  const { user, membership } = await requireMembership();
  const parsed = visitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const v = parsed.data;
  let startsAt: string;
  try { startsAt = istToIso(v.startsAt); } catch { return { ok: false, errors: { startsAt: 'Choose a valid date and time' } }; }
  if (Date.parse(startsAt) < Date.now() - 5 * 60_000) return { ok: false, errors: { startsAt: 'Choose a time in the future' } };
  const broker = can(membership.role, 'leads.reassign') ? v.brokerId || user.id : user.id;
  const supabase = await createClient();
  const { error } = await supabase.from('site_visits').insert({
    org_id: membership.orgId, lead_id: v.leadId, property_id: v.propertyId || null, broker_id: broker,
    starts_at: startsAt, duration_min: v.durationMin, meeting_point: v.meetingPoint || null,
    buyer_confirmed: v.buyerConfirmed ?? false, created_by: user.id,
  });
  if (error) return { ok: false, message: friendlyDbError(error.message) };
  refresh(v.leadId);
  revalidatePath('/dashboard/pipeline');
  return { ok: true, message: 'Visit scheduled. Confirmation and reminder tasks were created.' };
}

const visitUpdateSchema = z.object({
  visitId: uuid,
  status: z.enum(['scheduled', 'confirmed', 'attended', 'rescheduled', 'cancelled', 'no_show']).optional(),
  buyerConfirmed: z.boolean().optional(),
  outcomeNotes: z.string().trim().max(2000).optional(),
  startsAt: z.string().optional(),
});

export async function updateVisit(input: unknown): Promise<ActionResult> {
  await requireMembership();
  const parsed = visitUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Invalid request.' };
  const v = parsed.data;
  if ((v.status === 'attended' || v.status === 'no_show') && !v.outcomeNotes) {
    return { ok: false, errors: { outcomeNotes: 'Record what happened at the visit' } };
  }
  const patch: Record<string, unknown> = {};
  if (v.status) patch.status = v.status;
  if (v.buyerConfirmed !== undefined) { patch.buyer_confirmed = v.buyerConfirmed; if (v.buyerConfirmed && !v.status) patch.status = 'confirmed'; }
  if (v.outcomeNotes !== undefined) patch.outcome_notes = v.outcomeNotes;
  if (v.startsAt) {
    try { patch.starts_at = istToIso(v.startsAt); patch.status = 'rescheduled'; } catch { return { ok: false, errors: { startsAt: 'Choose a valid date and time' } }; }
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from('site_visits').update(patch).eq('id', v.visitId).select('lead_id');
  if (error) return { ok: false, message: friendlyDbError(error.message) };
  if (!data?.length) return { ok: false, message: 'You don’t have permission to update this visit.' };
  refresh(data[0].lead_id as string);
  revalidatePath('/dashboard/pipeline');
  return { ok: true, message: 'Visit updated.' };
}

// ---------------------------------------------------------------- notifications
export async function markNotificationsRead(ids: string[] | 'all'): Promise<ActionResult> {
  const { user } = await requireMembership();
  const supabase = await createClient();
  let q = supabase.from('notification_logs').update({ read_at: new Date().toISOString() })
    .eq('recipient_id', user.id).eq('channel', 'in_app').is('read_at', null);
  if (ids !== 'all') q = q.in('id', ids.filter((i) => uuid.safeParse(i).success));
  const { error } = await q;
  if (error) return { ok: false, message: friendlyDbError(error.message) };
  revalidatePath('/dashboard', 'layout');
  return { ok: true };
}
