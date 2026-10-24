import Link from 'next/link';
import { TaskRow, type TaskItem } from '@/components/dashboard/lead-panels';
import { NewTaskForm } from '@/components/dashboard/new-task-form';
import { PageHeader } from '@/components/dashboard/page-header';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { requireMembership } from '@/lib/auth';
import { getMembers } from '@/lib/crm';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Tasks' };
export const dynamic = 'force-dynamic';

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { user, membership } = await requireMembership();
  const sp = await searchParams;
  const isManager = can(membership.role, 'leads.reassign');
  const scope = sp.scope ?? (isManager || membership.role === 'viewer' ? 'all' : 'mine');
  const supabase = await createClient();
  const members = await getMembers(membership.orgId);
  const names = new Map(members.map((m) => [m.user_id, m.name]));

  let q = supabase.from('tasks').select('id, title, type, due_at, status, assigned_to, escalated_at, lead_id, leads ( full_name )')
    .eq('org_id', membership.orgId).in('status', ['open', 'snoozed']).order('due_at').limit(300);
  if (scope === 'mine') q = q.eq('assigned_to', user.id);
  else if (scope === 'unassigned') q = q.is('assigned_to', null);
  else if (scope !== 'all') q = q.eq('assigned_to', scope);
  const { data } = await q;

  const IST = 5.5 * 3_600_000;
  const todayEnd = (() => { const n = new Date(Date.now() + IST); return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1) - IST; })();
  const now = Date.now();
  const tasks = (data ?? []).map((t) => ({
    ...t,
    assignee: t.assigned_to ? names.get(t.assigned_to) ?? null : null,
    leadName: ((Array.isArray(t.leads) ? t.leads[0] : t.leads) as { full_name: string } | null)?.full_name ?? null,
  }));
  const groups: [string, typeof tasks][] = [
    ['Overdue', tasks.filter((t) => t.status === 'open' && Date.parse(t.due_at) < now)],
    ['Due today', tasks.filter((t) => t.status === 'open' && Date.parse(t.due_at) >= now && Date.parse(t.due_at) < todayEnd)],
    ['Upcoming', tasks.filter((t) => t.status === 'open' && Date.parse(t.due_at) >= todayEnd)],
    ['Snoozed', tasks.filter((t) => t.status === 'snoozed')],
  ];
  const tabs: [string, string][] = [['mine', 'My tasks'], ...(isManager || membership.role === 'viewer' ? [['all', 'Everyone'], ['unassigned', 'Unassigned']] as [string, string][] : [])];
  const memberOpts = members.filter((m) => m.role !== 'viewer').map((m) => ({ id: m.user_id, name: m.name }));

  return (
    <>
      <PageHeader title="Tasks" description="Follow-ups created automatically and by your team. Overdue tasks are escalated to owners and admins." />
      <div className="mb-5 flex flex-wrap gap-2">
        {tabs.map(([k, l]) => (
          <Link key={k} href={`?scope=${k}`} className={buttonVariants({ variant: scope === k ? 'primary' : 'outline', size: 'sm' })}>{l}</Link>
        ))}
      </div>
      {membership.role !== 'viewer' && <Card className="mb-6 p-4"><NewTaskForm members={isManager ? memberOpts : []} /></Card>}
      <div className="grid gap-5 lg:grid-cols-2">
        {groups.map(([title, list]) => (
          <Card key={title} className="p-5">
            <h2 className={`font-sans text-base font-semibold ${title === 'Overdue' && list.length ? 'text-danger-700' : 'text-navy-900'}`}>{title} <span className="text-stone-500">({list.length})</span></h2>
            {list.length === 0 ? <p className="mt-2 text-sm text-stone-500">Nothing here.</p> : (
              <ul className="mt-2 divide-y divide-stone-200">
                {list.map((t) => (
                  <li key={t.id}>
                    {t.lead_id && <Link href={`/dashboard/leads/${t.lead_id}`} className="block pt-2 text-xs font-semibold text-navy-800 hover:underline">{t.leadName}</Link>}
                    <ul><TaskRow task={t as TaskItem} mine={t.assigned_to === user.id} isManager={isManager} members={isManager ? memberOpts : undefined} /></ul>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
