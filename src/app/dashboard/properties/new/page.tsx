import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/dashboard/page-header';
import { PropertyForm } from '@/components/dashboard/property-form';
import { requireMembership } from '@/lib/auth';
import { getMembers } from '@/lib/crm';
import { can } from '@/lib/permissions';

export const metadata = { title: 'New listing' };

export default async function NewPropertyPage() {
  const { membership } = await requireMembership();
  if (!can(membership.role, 'inventory.manage')) redirect('/dashboard/properties');
  const members = (await getMembers(membership.orgId)).filter((m) => m.role !== 'viewer').map((m) => ({ id: m.user_id, name: m.name }));
  return (
    <>
      <PageHeader title="New listing" description="Save as Draft first. Add photos, verify availability, then publish." />
      <PropertyForm members={members} />
    </>
  );
}
