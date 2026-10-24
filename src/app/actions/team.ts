'use server';

import { revalidatePath } from 'next/cache';
import { requireMembership } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import {
  addMemberSchema,
  changeRoleSchema,
  fieldErrors,
  friendlyDbError,
  removeMemberSchema,
} from '@/lib/validation';
import type { ActionResult } from './auth';

// The database functions re-check every permission; these early checks just
// give a clear message without a round trip.

export async function addMember(input: unknown): Promise<ActionResult> {
  const { membership } = await requireMembership();
  if (!can(membership.role, 'team.manage')) return { ok: false, message: 'Only owners and admins can manage the team.' };

  const parsed = addMemberSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc('add_member_by_email', {
    p_org: membership.orgId,
    p_email: parsed.data.email,
    p_role: parsed.data.role,
  });
  if (error) return { ok: false, message: friendlyDbError(error.message) };
  revalidatePath('/dashboard/team');
  return { ok: true, message: `${parsed.data.email} has been added.` };
}

export async function changeMemberRole(input: unknown): Promise<ActionResult> {
  const { membership } = await requireMembership();
  const parsed = changeRoleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Invalid request.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('set_member_role', {
    p_org: membership.orgId,
    p_user: parsed.data.userId,
    p_role: parsed.data.role,
  });
  if (error) return { ok: false, message: friendlyDbError(error.message) };
  revalidatePath('/dashboard/team');
  return { ok: true, message: 'Role updated.' };
}

export async function removeMember(input: unknown): Promise<ActionResult> {
  const { membership } = await requireMembership();
  const parsed = removeMemberSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Invalid request.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('remove_member', {
    p_org: membership.orgId,
    p_user: parsed.data.userId,
  });
  if (error) return { ok: false, message: friendlyDbError(error.message) };
  revalidatePath('/dashboard/team');
  return { ok: true, message: 'Member removed.' };
}
