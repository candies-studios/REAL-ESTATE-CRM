import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import type { Role } from './permissions';
import { createClient } from './supabase/server';

export const ACTIVE_ORG_COOKIE = 'active_org';

export type Membership = {
  orgId: string;
  orgName: string;
  timezone: string;
  role: Role;
};

/** The signed-in user (validated with Supabase Auth), or null. Cached per request. */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/** All organizations the user belongs to, with their role in each. */
export const getMemberships = cache(async (): Promise<Membership[]> => {
  const user = await getUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('user_roles')
    .select('role, org_id, organizations ( name, timezone )')
    .eq('user_id', user.id)
    .order('created_at');
  if (error || !data) return [];
  return data.map((row) => {
    const org = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
    return {
      orgId: row.org_id as string,
      orgName: (org?.name as string) ?? 'Organization',
      timezone: (org?.timezone as string) ?? 'Asia/Kolkata',
      role: row.role as Role,
    };
  });
});

/**
 * The organization the user is working in. Uses the active_org cookie when it
 * points at one of their memberships, otherwise their first organization.
 * The cookie is only a preference: membership is always re-checked here and
 * every query is still filtered by RLS.
 */
export const getActiveMembership = cache(async (): Promise<Membership | null> => {
  const memberships = await getMemberships();
  if (memberships.length === 0) return null;
  const preferred = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value;
  return memberships.find((m) => m.orgId === preferred) ?? memberships[0];
});

/** For private pages: signed in AND a member of an organization. */
export async function requireMembership() {
  const user = await getUser();
  if (!user) redirect('/login');
  const membership = await getActiveMembership();
  if (!membership) redirect('/onboarding');
  return { user, membership };
}
