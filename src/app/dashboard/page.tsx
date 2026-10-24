import { CheckCircle2, Circle } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/dashboard/page-header';
import { Card } from '@/components/ui/card';
import { requireMembership } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import { fmtDateTime } from '@/components/dashboard/format';

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

  let myTasksQ = supabase.from('tasks').select('id, title, due_at, lead_id').eq('org_id', org).eq('status', 'open')
    .lt('due_at', tomorrowStart.toISOString()).order('due_at').limit(8);
  if (membership.role !== 'viewer') myTasksQ = myTasksQ.eq('assigned_to', user.id);
  const [leads, newLeads, tasksDue, visits, available, team, myTasks, nextVisits, hotLeads] = await Promise.all([
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('org_id', org),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('org_id', org).gte('created_at', weekAgo.toISOString()),
    tasksQ,
    supabase.from('site_visits').select('id', { count: 'exact', head: true }).eq('org_id', org)
      .in('status', ['scheduled', 'confirmed']).gte('starts_at', new Date().toISOString()).lt('starts_at', weekAhead.toISOString()),
    supabase.from('properties').select('id', { count: 'exact', head: true }).eq('org_id', org).eq('status', 'available'),
    supabase.from('user_roles').select('id', { count: 'exact', head: true }).eq('org_id', org),
    myTasksQ,
    supabase.from('site_visits').select('id, starts_at, lead_id, leads ( full_name ), properties ( title )').eq('org_id', org)
      .in('status', ['scheduled', 'confirmed', 'rescheduled']).gte('starts_at', new Date().toISOString()).order('starts_at').limit(5),
    supabase.from('lead_list').select('id, full_name, localities_text, created_at').eq('org_id', org).eq('effective_category', 'hot')
      .is('duplicate_of', null).is('last_contacted_at', null).eq('is_won', false).eq('is_lost', false).order('created_at', { ascending: false }).limit(5),
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
    { done: (available.count ?? 0) > 0, label: 'Add and publish your first verified listing', href: '/dashboard/properties/new' },
    { done: (leads.count ?? 0) > 0, label: 'Receive your first enquiry (try the form on your website)', href: '/enquire/buy' },
    { done: false, label: 'Review scoring rules, follow-up timings and working hours', href: '/dashboard/settings' },
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

      <div className="mt-8 grid gap-5 lg:grid-cols-3">
        <Card className="p-5">
          <h2 className="font-sans text-base font-semibold text-navy-900">{membership.role === 'viewer' ? 'Tasks due today' : 'Your tasks for today'}</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {(myTasks.data ?? []).length === 0 && <li className="text-stone-500">Nothing due. </li>}
            {(myTasks.data ?? []).map((t) => (
              <li key={t.id} className="flex justify-between gap-3">
                <Link href={t.lead_id ? `/dashboard/leads/${t.lead_id}` : '/dashboard/tasks'} className="truncate text-navy-900 hover:underline">{t.title}</Link>
                <span className={Date.parse(t.due_at) < Date.now() ? 'shrink-0 font-semibold text-danger-700' : 'shrink-0 text-stone-500'}>{fmtDateTime(t.due_at)}</span>
              </li>
            ))}
          </ul>
          <Link href="/dashboard/tasks" className="mt-3 inline-block text-sm font-semibold text-navy-800 underline">All tasks</Link>
        </Card>
        <Card className="p-5">
          <h2 className="font-sans text-base font-semibold text-navy-900">Upcoming site visits</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {(nextVisits.data ?? []).length === 0 && <li className="text-stone-500">No visits scheduled.</li>}
            {(nextVisits.data ?? []).map((v) => {
              const l = (Array.isArray(v.leads) ? v.leads[0] : v.leads) as { full_name: string } | null;
              const p = (Array.isArray(v.properties) ? v.properties[0] : v.properties) as { title: string } | null;
              return (
                <li key={v.id}>
                  <Link href={`/dashboard/leads/${v.lead_id}`} className="font-medium text-navy-900 hover:underline">{l?.full_name}</Link>
                  <span className="block text-xs text-stone-500">{fmtDateTime(v.starts_at)}{p ? ` · ${p.title}` : ''}</span>
                </li>
              );
            })}
          </ul>
          <Link href="/dashboard/site-visits" className="mt-3 inline-block text-sm font-semibold text-navy-800 underline">Calendar</Link>
        </Card>
        <Card className="p-5">
          <h2 className="font-sans text-base font-semibold text-navy-900">Hot leads not yet contacted</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {(hotLeads.data ?? []).length === 0 && <li className="text-stone-500">None waiting.</li>}
            {(hotLeads.data ?? []).map((l) => (
              <li key={l.id}>
                <Link href={`/dashboard/leads/${l.id}`} className="font-medium text-navy-900 hover:underline">{l.full_name}</Link>
                <span className="block text-xs text-stone-500">{l.localities_text || 'No locality'} · {fmtDateTime(l.created_at)}</span>
              </li>
            ))}
          </ul>
          <Link href="/dashboard/leads?category=hot&sort=follow_up" className="mt-3 inline-block text-sm font-semibold text-navy-800 underline">All hot leads</Link>
        </Card>
      </div>

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
