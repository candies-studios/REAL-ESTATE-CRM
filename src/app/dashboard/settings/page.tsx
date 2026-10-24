import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/dashboard/page-header';
import { AutomationRunner, OrgForm, SettingsForm, StageEditor } from '@/components/dashboard/settings-forms';
import { Card } from '@/components/ui/card';
import { requireMembership } from '@/lib/auth';
import { getStages } from '@/lib/crm';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const { membership } = await requireMembership();
  if (!can(membership.role, 'pipeline.configure')) redirect('/dashboard');
  const supabase = await createClient();
  const [{ data: org }, stages] = await Promise.all([
    supabase.from('organizations').select('name, settings, accepts_public_enquiries, timezone').eq('id', membership.orgId).single(),
    getStages(membership.orgId),
  ]);

  return (
    <>
      <PageHeader title="Settings" description={`Times use ${org?.timezone ?? 'Asia/Kolkata'}.`} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-xl">Brokerage</h2>
          <div className="mt-4"><OrgForm name={org?.name ?? ''} accepts={org?.accepts_public_enquiries ?? true} isOwner={membership.role === 'owner'} /></div>
        </Card>
        <Card className="p-6">
          <h2 className="text-xl">Automation</h2>
          <p className="mt-1 text-sm text-stone-600">
            Reminders, escalations and re-verification run on a schedule (see README for pg_cron or Vercel Cron).
            You can also run them now.
          </p>
          <div className="mt-4"><AutomationRunner /></div>
        </Card>
        <Card className="p-6 xl:col-span-2">
          <h2 className="text-xl">Scoring rules and follow-up timings</h2>
          <div className="mt-4"><SettingsForm settings={org?.settings ?? {}} /></div>
        </Card>
        <Card className="p-6 xl:col-span-2">
          <h2 className="text-xl">Pipeline stages</h2>
          <p className="mt-1 text-sm text-stone-600">Rename, reorder, hide or add stages. Automation keys off the built-in stages, so renaming is safe.</p>
          <div className="mt-4">
            <StageEditor stages={stages.map((s) => ({ id: s.id, key: s.key, name: s.name, active: s.is_active }))} />
          </div>
        </Card>
      </div>
    </>
  );
}
