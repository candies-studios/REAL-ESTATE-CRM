import { PageHeader } from '@/components/dashboard/page-header';
import { AddMemberForm, MemberRow } from '@/components/dashboard/team-forms';
import { Card } from '@/components/ui/card';
import { requireMembership } from '@/lib/auth';
import { can, canManageMember, grantableRoles, ROLE_LABELS, type Role } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Team' };
export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const { user, membership } = await requireMembership();
  const supabase = await createClient();

  const { data: roles } = await supabase
    .from('user_roles')
    .select('user_id, role, created_at')
    .eq('org_id', membership.orgId)
    .order('created_at');
  const ids = (roles ?? []).map((r) => r.user_id as string);
  const { data: profiles } = ids.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', ids)
    : { data: [] };
  const byId = new Map((profiles ?? []).map((p) => [p.id as string, p]));

  const manage = can(membership.role, 'team.manage');
  const order: Role[] = ['owner', 'admin', 'broker', 'viewer'];
  const members = (roles ?? [])
    .map((r) => ({
      userId: r.user_id as string,
      role: r.role as Role,
      name: (byId.get(r.user_id)?.full_name as string | null) ?? null,
      email: (byId.get(r.user_id)?.email as string | null) ?? null,
    }))
    .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));

  return (
    <>
      <PageHeader
        title="Team"
        description={manage
          ? 'Add brokers after they create an account. Owners manage owners and admins; admins manage brokers and read-only managers.'
          : 'People in your brokerage.'}
      />

      {manage && (
        <Card className="mb-8 p-6">
          <h2 className="text-xl">Add a team member</h2>
          <p className="mt-1 text-sm text-stone-600">They must sign up first at <code>/signup</code> with this email.</p>
          <div className="mt-5">
            <AddMemberForm roles={grantableRoles(membership.role).map((r) => ({ value: r, label: ROLE_LABELS[r] }))} />
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">Team members</caption>
            <thead className="border-b border-stone-200 bg-stone-100/70 text-xs uppercase tracking-wider text-stone-600">
              <tr>
                <th scope="col" className="px-5 py-3 font-semibold">Name</th>
                <th scope="col" className="px-5 py-3 font-semibold">Email</th>
                <th scope="col" className="px-5 py-3 font-semibold">Role</th>
                <th scope="col" className="px-5 py-3 font-semibold"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {members.map((m) => (
                <MemberRow
                  key={m.userId}
                  member={m}
                  isSelf={m.userId === user.id}
                  editable={manage && canManageMember(membership.role, m.role) && m.userId !== user.id}
                  roleOptions={grantableRoles(membership.role).map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
                  roleLabel={ROLE_LABELS[m.role]}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
