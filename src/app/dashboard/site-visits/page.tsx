import Link from 'next/link';
import { fmtDateTime } from '@/components/dashboard/format';
import { VisitList, type VisitItem } from '@/components/dashboard/lead-panels';
import { PageHeader } from '@/components/dashboard/page-header';
import { buttonVariants } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { requireMembership } from '@/lib/auth';
import { getMembers } from '@/lib/crm';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Site visits' };
export const dynamic = 'force-dynamic';

const IST = 5.5 * 3_600_000;

/** Monday 00:00 IST of the week containing `now + offset weeks`, as a UTC Date. */
function weekStart(offset: number) {
  const ist = new Date(Date.now() + IST);
  const day = (ist.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - day + offset * 7) - IST);
}

export default async function SiteVisitsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { user, membership } = await requireMembership();
  const sp = await searchParams;
  const offset = Math.max(-52, Math.min(52, Number(sp.week) || 0));
  const start = weekStart(offset);
  const end = new Date(start.getTime() + 7 * 86_400_000);
  const supabase = await createClient();
  const members = await getMembers(membership.orgId);
  const names = new Map(members.map((m) => [m.user_id, m.name]));
  const isManager = can(membership.role, 'leads.edit_all') || membership.role === 'viewer';
  const brokerFilter = sp.broker ?? (membership.role === 'broker' ? user.id : '');

  const select = 'id, lead_id, starts_at, duration_min, status, meeting_point, buyer_confirmed, outcome_notes, broker_id, properties ( title ), leads ( full_name )';
  let weekQ = supabase.from('site_visits').select(select).eq('org_id', membership.orgId)
    .gte('starts_at', start.toISOString()).lt('starts_at', end.toISOString()).order('starts_at');
  if (brokerFilter) weekQ = weekQ.eq('broker_id', brokerFilter);
  let pendingQ = supabase.from('site_visits').select(select).eq('org_id', membership.orgId)
    .in('status', ['scheduled', 'confirmed', 'rescheduled']).lt('starts_at', new Date().toISOString()).order('starts_at').limit(30);
  if (brokerFilter) pendingQ = pendingQ.eq('broker_id', brokerFilter);
  const [{ data: week }, { data: pendingOutcome }] = await Promise.all([weekQ, pendingQ]);

  const toItem = (v: NonNullable<typeof week>[number]): VisitItem => ({
    id: v.id, lead_id: v.lead_id, starts_at: v.starts_at, duration_min: v.duration_min, status: v.status, meeting_point: v.meeting_point,
    buyer_confirmed: v.buyer_confirmed, outcome_notes: v.outcome_notes,
    property: ((Array.isArray(v.properties) ? v.properties[0] : v.properties) as { title: string } | null)?.title ?? null,
    lead: ((Array.isArray(v.leads) ? v.leads[0] : v.leads) as { full_name: string } | null)?.full_name ?? null,
    broker: v.broker_id ? names.get(v.broker_id) ?? null : null,
  });

  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * 86_400_000));
  const dayKey = (d: Date) => new Date(d.getTime() + IST).toISOString().slice(0, 10);
  const byDay = new Map<string, VisitItem[]>();
  (week ?? []).forEach((v) => {
    const k = dayKey(new Date(v.starts_at));
    byDay.set(k, [...(byDay.get(k) ?? []), toItem(v)]);
  });
  const todayKey = dayKey(new Date());
  const label = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' });
  const dayName = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short' });
  const time = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' });
  const qs = (o: Record<string, string | number>) => `?${new URLSearchParams({ ...(brokerFilter ? { broker: brokerFilter } : {}), ...Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v)])) })}`;

  return (
    <>
      <PageHeader title="Site visits" description="Schedule visits from a lead’s page. Overlapping visits for the same broker are blocked." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} href={qs({ week: offset - 1 })}>← Previous</Link>
        <Link className={buttonVariants({ variant: 'ghost', size: 'sm' })} href={qs({ week: 0 })}>This week</Link>
        <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} href={qs({ week: offset + 1 })}>Next →</Link>
        <span className="ml-2 font-semibold text-navy-900">{label.format(days[0])} – {label.format(days[6])}</span>
        {isManager && (
          <form method="get" className="ml-auto flex gap-2">
            <input type="hidden" name="week" value={offset} />
            <label className="sr-only" htmlFor="vb">Broker</label>
            <select id="vb" name="broker" defaultValue={brokerFilter} className="h-9 rounded-lg border border-stone-300 bg-white px-2 text-sm">
              <option value="">All brokers</option>
              {members.filter((m) => m.role !== 'viewer').map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
            </select>
            <button className={buttonVariants({ variant: 'outline', size: 'sm' })} type="submit">Filter</button>
          </form>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-7">
        {days.map((d) => {
          const k = dayKey(d);
          const items = byDay.get(k) ?? [];
          return (
            <Card key={k} className={`min-h-36 p-3 ${k === todayKey ? 'ring-2 ring-gold-500' : ''}`}>
              <h2 className="font-sans text-xs font-semibold uppercase tracking-wider text-stone-600">{dayName.format(d)} <span className="text-navy-900">{label.format(d)}</span></h2>
              <ul className="mt-2 space-y-2">
                {items.length === 0 && <li className="text-xs text-stone-400">No visits</li>}
                {items.map((v) => (
                  <li key={v.id} className="rounded-md bg-navy-50 p-2 text-xs">
                    <p className="font-semibold text-navy-900">{time.format(new Date(v.starts_at))} · {v.lead}</p>
                    <p className="truncate text-stone-600">{v.property ?? v.meeting_point ?? '—'}</p>
                    <p className="text-stone-500">{v.broker ?? 'No broker'} · <Badge tone={v.status === 'attended' ? 'success' : v.status === 'cancelled' || v.status === 'no_show' ? 'neutral' : 'navy'} className="px-1.5 py-0 text-[10px]">{v.status.replace('_', '-')}</Badge></p>
                    {v.lead_id && <Link href={`/dashboard/leads/${v.lead_id}`} className="font-semibold text-navy-800 underline">Open lead</Link>}
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>

      <Card className="mt-8 p-5">
        <h2 className="font-sans text-base font-semibold text-navy-900">Visits waiting for an outcome</h2>
        <p className="mt-1 text-sm text-stone-600">Past visits still marked scheduled or confirmed. Record what happened so the next follow-up is created.</p>
        <div className="mt-3">
          <VisitList visits={(pendingOutcome ?? []).map(toItem)} canEdit={membership.role !== 'viewer'} />
        </div>
        {(pendingOutcome ?? []).length > 0 && <p className="mt-2 text-xs text-stone-500">Oldest: {fmtDateTime(pendingOutcome![0].starts_at)}</p>}
      </Card>
    </>
  );
}
