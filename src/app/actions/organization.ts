'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACTIVE_ORG_COOKIE, getMemberships, getUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fieldErrors, friendlyDbError, organizationSchema } from '@/lib/validation';
import type { ActionResult } from './auth';

const cookieOptions = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 365 };

export async function createOrganization(input: unknown): Promise<ActionResult> {
  const user = await getUser();
  if (!user) redirect('/login');

  const parsed = organizationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('create_organization', { p_name: parsed.data.name });
  if (error) return { ok: false, message: friendlyDbError(error.message) };

  (await cookies()).set(ACTIVE_ORG_COOKIE, data as string, cookieOptions);
  redirect('/dashboard');
}

export async function switchOrganization(orgId: string) {
  const memberships = await getMemberships();
  // Only accept organizations the user actually belongs to.
  if (memberships.some((m) => m.orgId === orgId)) {
    (await cookies()).set(ACTIVE_ORG_COOKIE, orgId, cookieOptions);
  }
  redirect('/dashboard');
}
