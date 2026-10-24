import { CheckCircle2, Circle } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/dashboard/page-header';
import { Card } from '@/components/ui/card';
import { requireMembership } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Start of "today" in the organization's timezone, as an ISO instant. */
function startOfTodayIn(timeZone: string) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  const d = parts.find((p) => p.type === 'day')!.value;
  // Asia/Kolkata has no DST, so a fixed offset is exact for the default zone.
  const offset = timeZone === 'Asia/Kolkata' ? '+05:30' : 'Z';
  return new Date(`${y}-${m}-${d}T00:00:00${offset}`);
}

export default async function OverviewPage() {
  const { user, membership } = await requireMembership();
  const supabase = await createClient();
  const org = membership.orgId;
  const isBroker = membership.role === 'broker';

  const todayStart = startOfTodayIn(membership.timezone);
  const tomorrowStart = new Date(todayStart.getTime() + 86_400_000);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const weekAhead = new Date(Date.now() + 7 * 86_400_000);

  // RLS already limits brokers to their own leads; counts reflect what this user may see.
  let tasksQ = supabase.from('tasks').select('id', { count: 'exact', head: true })
    .eq('org_id', org).eq('status', 'open').lt('due_at', tomorrowStart.toISOString());
  if (isBroker) tasksQ = tasksQ.eq('assigned_to', user.id);

  const [leads, newLeads, tasksDue, visits, available, team] = await Promise.all([
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('org_id', org),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('org_id', org).gte('created_at', weekAgo.toISOString()),
    tasksQ,
    supabase.from('site_visits').select('id', { count: 'exact', head: true }).eq('org_id', org)
      .in('status', ['scheduled', 'confirmed']).gte('starts_at', new Date().toISOString()).lt('starts_at', weekAhead.toISOString()),
    supabase.from('properties').select('id', { count: 'exact', head: true }).eq('org_id', org).eq('status', 'available'),
    supabase.from('user_roles').select('id', { count: 'exact', head: true }).eq('org_id', org),
  ]);

  const stats = [
    { label: isBroker ? 'Your leads' : 'Total leads', value: leads.count, note: isBroker ? 'Leads assigned to you' : 'All leads in this brokerage' },
    { label: 'New this week', value: newLeads.count, note: 'Leads created in the last 7 days' },
    { label: 'Follow-ups due', value: tasksDue.count, note: isBroker ? 'Your open tasks due today or overdue' : 'Open tasks due today or overdue' },
    { label: 'Site visits', value: visits.count, note: 'Scheduled or confirmed, next 7 days' },
    { label: 'Available listings', value: available.count, note: 'Properties with status “available”' },
  ];

  const firstName = ((user.user_metadata?.full_name as string | undefined) ?? '').split(' ')[0];
  const showSetup = can(membership.role, 'team.manage');
  const checklist = [
    { done: true, label: 'Create your brokerage', href: null },
    { done: (team.count ?? 0) > 1, label: 'Add your brokers and admins', href: '/dashboard/team' },
    { done: (available.count ?? 0) > 0, label: 'Add your first verified listing (property manager arrives in Phase 4)', href: null },
    { done: (leads.count ?? 0) > 0, label: 'Receive your first enquiry (public enquiry forms arrive in Phase 2)', href: null },
  ];

  return (
    <>
      <PageHeader
        title={firstName ? `Good to see you, ${firstName}` : 'Overview'}
        description={`${membership.orgName} · times shown in ${membership.timezone}`}
      />

      <section aria-label="Key numbers" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {stats.map((s) => (
          <Card key={s.label} className="p-5">
            <p className="text-sm font-medium text-stone-600">{s.label}</p>
            <p className="mt-2 font-display text-4xl text-navy-900">{s.value ?? '—'}</p>
            <p className="mt-2 text-xs text-stone-500">{s.note}</p>
          </Card>
        ))}
      </section>

      {showSetup && (
        <Card className="mt-8 p-6">
          <h2 className="text-xl">Setup checklist</h2>
          <ul className="mt-4 space-y-3">
            {checklist.map((c) => (
              <li key={c.label} className="flex items-start gap-3 text-sm">
                {c.done
                  ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success-700" aria-label="Done" />
                  : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-stone-300" aria-label="Not done" />}
                {c.href && !c.done
                  ? <Link href={c.href} className="font-medium text-navy-800 underline">{c.label}</Link>
                  : <span className={c.done ? 'text-stone-500 line-through' : 'text-stone-800'}>{c.label}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
