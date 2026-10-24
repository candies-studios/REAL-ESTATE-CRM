import { NewLeadForm } from '@/components/dashboard/new-lead-form';
import { PageHeader } from '@/components/dashboard/page-header';
import { Card } from '@/components/ui/card';
import { requireMembership } from '@/lib/auth';
import { getMembers } from '@/lib/crm';
import { can } from '@/lib/permissions';
import { redirect } from 'next/navigation';

export const metadata = { title: 'New lead' };

export default async function NewLeadPage() {
  const { membership } = await requireMembership();
  if (membership.role === 'viewer') redirect('/dashboard/leads');
  const members = can(membership.role, 'leads.reassign')
    ? (await getMembers(membership.orgId)).filter((m) => m.role !== 'viewer').map((m) => ({ id: m.user_id, name: m.name }))
    : [];
  return (
    <>
      <PageHeader title="New lead" description="For walk-ins, calls and referrals. Website enquiries arrive automatically." />
      <Card className="max-w-3xl p-6"><NewLeadForm members={members} /></Card>
    </>
  );
}
