import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/dashboard/page-header';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { requireMembership } from '@/lib/auth';
import { getStages } from '@/lib/crm';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import { formatINR } from '@/lib/utils';

export const metadata = { title: 'Reports' };
export const dynamic = 'force-dynamic';

const IST = 5.5 * 3_600_000;
const istDate = (d: Date) => new Date(d.getTime() + IST).toISOString().slice(0, 10);

type Report = {
  new_leads: number;
  by_stage: { key: string; name: string; count: number }[];
  by_category: { hot: number; warm: number; cold: number; unscored: number };
  follow_ups_due_today: number; overdue_tasks: number; upcoming_visits: number;
  by_locality: { locality: string; count: number }[];
  by_property: { id: string; ref_code: string; title: string; count: number }[];
  by_source: { source: string; count: number }[];
  by_campaign: { name: string; count: number }[];
  qualified: { numerator: number; denominator: number };
  visit_conversion: { numerator: number; denominator: number };
  won: { count: number; recorded_revenue: number; deal_value: number };
  projected_revenue: number;
  brokers: { user_id: string; name: string; role: string; assigned: number; contacted: number; avg_first_response_min: number | null; visits_attended: number; won: number; revenue: number; overdue_tasks: number }[];
};

function pct(n: number, d: number) {
  return d === 0 ? '—' : `${Math.round((n / d) * 100)}%`;
}

function Bars({ rows, href }: { rows: { label: string; count: number; key: string }[]; href: (key: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (rows.length === 0) return <p className="text-sm text-stone-500">No data for this period.</p>;
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.key}>
          <Link href={href(r.key)} className="group grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm">
            <span className="truncate text-stone-700 group-hover:text-navy-900 group-hover:underline">{r.label}</span>
            <span className="h-2.5 rounded-full bg-stone-100"><span className="block h-full rounded-full bg-navy-700" style={{ width: `${(r.count / max) * 100}%` }} /></span>
            <span className="w-8 text-right font-semibold tabular-nums">{r.count}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { membership } = await requireMembership();
  if (!can(membership.role, 'reports.view')) redirect('/dashboard');
  const sp = await searchParams;

  const now = new Date();
  const istNow = new Date(now.getTime() + IST);
  const monthStart = istDate(new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), 1) - IST + 1));
  const from = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : monthStart;
  const to = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : istDate(now);
  const fromIso = new Date(`${from}T00:00:00+05:30`).toISOString();
  const toIso = new Date(new Date(`${to}T00:00:00+05:30`).getTime() + 86_400_000).toISOString();

  const supabase = await createClient();
  const [{ data, error }, stages] = await Promise.all([
    supabase.rpc('report_summary', { p_org: membership.orgId, p_from: fromIso, p_to: toIso }),
    getStages(membership.orgId),
  ]);
  const r = data as Report | null;
  const stageId = new Map(stages.map((s) => [s.key, s.id]));
  const range = `from=${from}&to=${to}`;
  const presets: [string, string, string][] = [
    ['This month', monthStart, istDate(now)],
    ['Last 30 days', istDate(new Date(now.getTime() - 29 * 86_400_000)), istDate(now)],
    ['Last 90 days', istDate(new Date(now.getTime() - 89 * 86_400_000)), istDate(now)],
  ];

  return (
    <>
      <PageHeader title="Reports" description={`${from} to ${to} (IST). Click any row to see the leads behind it.`} />
      <Card className="mb-6 flex flex-wrap items-end gap-3 p-4">
        {presets.map(([l, f, t]) => (
          <Link key={l} href={`?from=${f}&to=${t}`} className={buttonVariants({ variant: from === f && to === t ? 'primary' : 'outline', size: 'sm' })}>{l}</Link>
        ))}
        <form method="get" className="ml-auto flex flex-wrap items-end gap-2">
          <label className="text-xs font-semibold text-stone-600">From<input type="date" name="from" defaultValue={from} className="mt-1 block h-9 rounded-lg border border-stone-300 px-2 text-sm" /></label>
          <label className="text-xs font-semibold text-stone-600">To<input type="date" name="to" defaultValue={to} className="mt-1 block h-9 rounded-lg border border-stone-300 px-2 text-sm" /></label>
          <button className={buttonVariants({ size: 'sm' })} type="submit">Apply</button>
        </form>
      </Card>

      {error || !r ? (
        <Card className="p-6 text-danger-700">Couldn’t load the report. Check the database migrations have been run.</Card>
      ) : (
        <>
          <section aria-label="Headline numbers" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'New leads', value: r.new_leads, note: 'Leads created in the period (merged duplicates excluded)', href: `/dashboard/leads?${range}` },
              { label: 'Qualified-lead rate', value: pct(r.qualified.numerator, r.qualified.denominator), note: `${r.qualified.numerator} of ${r.qualified.denominator} new leads have reached Qualified or later` },
              { label: 'Site-visit conversion', value: pct(r.visit_conversion.numerator, r.visit_conversion.denominator), note: `${r.visit_conversion.numerator} of ${r.visit_conversion.denominator} leads with an attended visit in the period are now Won` },
              { label: 'Won deals', value: r.won.count, note: `Marked Won in the period · deal value ${formatINR(Number(r.won.deal_value))}`, href: stageId.get('won') ? `/dashboard/leads?stage=${stageId.get('won')}` : undefined },
              { label: 'Recorded brokerage', value: formatINR(Number(r.won.recorded_revenue)), note: 'Brokerage entered on deals won in the period (received, not projected)' },
              { label: 'Projected brokerage', value: formatINR(Number(r.projected_revenue)), note: 'Expected brokerage on leads now in Negotiation or Booking. Not revenue.' },
              { label: 'Follow-ups due today', value: r.follow_ups_due_today, note: 'Open tasks due today (now, not the period)', href: '/dashboard/tasks?scope=all' },
              { label: 'Overdue tasks', value: r.overdue_tasks, note: 'Open tasks past their due time (now)', href: '/dashboard/tasks?scope=all' },
            ].map((s) => (
              <Card key={s.label} className="p-5">
                <p className="text-sm font-medium text-stone-600">{s.label}</p>
                <p className="mt-2 font-display text-3xl text-navy-900">{s.href ? <Link href={s.href} className="hover:underline">{s.value}</Link> : s.value}</p>
                <p className="mt-2 text-xs text-stone-500">{s.note}</p>
              </Card>
            ))}
          </section>

          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="font-sans text-base font-semibold text-navy-900">Pipeline now</h2>
              <p className="mb-3 text-xs text-stone-500">All current leads by stage (not limited to the period)</p>
              <Bars rows={r.by_stage.map((s) => ({ key: s.key, label: s.name, count: Number(s.count) }))} href={(k) => `/dashboard/leads?stage=${stageId.get(k) ?? ''}`} />
            </Card>
            <Card className="p-5">
              <h2 className="font-sans text-base font-semibold text-navy-900">Lead quality</h2>
              <p className="mb-3 text-xs text-stone-500">New leads in the period by effective category (overrides included)</p>
              <Bars rows={(['hot', 'warm', 'cold', 'unscored'] as const).map((k) => ({ key: k, label: k[0].toUpperCase() + k.slice(1), count: Number(r.by_category[k]) }))}
                href={(k) => `/dashboard/leads?category=${k}&${range}`} />
              <p className="mt-4 text-xs text-stone-500">Upcoming site visits (next 7 days): <strong>{r.upcoming_visits}</strong></p>
            </Card>
            <Card className="p-5">
              <h2 className="font-sans text-base font-semibold text-navy-900">Enquiries by locality</h2>
              <p className="mb-3 text-xs text-stone-500">Enquiries received in the period</p>
              <Bars rows={r.by_locality.map((x) => ({ key: x.locality, label: x.locality, count: Number(x.count) }))} href={(k) => `/dashboard/leads?q=${encodeURIComponent(k)}&${range}`} />
            </Card>
            <Card className="p-5">
              <h2 className="font-sans text-base font-semibold text-navy-900">Enquiries by property</h2>
              <p className="mb-3 text-xs text-stone-500">Property-specific enquiries in the period</p>
              <Bars rows={r.by_property.map((x) => ({ key: x.id, label: `${x.ref_code} · ${x.title}`, count: Number(x.count) }))} href={(k) => `/dashboard/properties/${k}`} />
            </Card>
            <Card className="p-5">
              <h2 className="font-sans text-base font-semibold text-navy-900">Leads by source</h2>
              <p className="mb-3 text-xs text-stone-500">New leads in the period</p>
              <Bars rows={r.by_source.map((x) => ({ key: x.source, label: x.source.replace('_', ' '), count: Number(x.count) }))} href={(k) => `/dashboard/leads?source=${encodeURIComponent(k)}&${range}`} />
            </Card>
            <Card className="p-5">
              <h2 className="font-sans text-base font-semibold text-navy-900">Leads by campaign</h2>
              <p className="mb-3 text-xs text-stone-500">New leads linked to a campaign via its utm_campaign</p>
              <Bars rows={r.by_campaign.map((x) => ({ key: x.name, label: x.name, count: Number(x.count) }))} href={() => `/dashboard/leads?${range}`} />
            </Card>
          </div>

          <Card className="mt-6 overflow-hidden">
            <div className="p-5 pb-0">
              <h2 className="font-sans text-base font-semibold text-navy-900">Broker activity</h2>
              <p className="text-xs text-stone-500">Assigned, contacted and response time cover leads created in the period. Overdue tasks are as of now.</p>
            </div>
            <div className="relative overflow-x-auto p-5">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-stone-200 text-xs uppercase tracking-wider text-stone-600">
                  <tr><th className="py-2">Broker</th><th>Assigned</th><th>Contacted</th><th>Avg first response</th><th>Visits attended</th><th>Won</th><th>Brokerage</th><th>Overdue tasks</th></tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {r.brokers.map((b) => (
                    <tr key={b.user_id}>
                      <td className="py-2.5 font-medium"><Link className="hover:underline" href={`/dashboard/leads?broker=${b.user_id}&${range}`}>{b.name}</Link></td>
                      <td>{b.assigned}</td>
                      <td>{b.contacted} <span className="text-xs text-stone-500">({pct(b.contacted, b.assigned)})</span></td>
                      <td>{b.avg_first_response_min == null ? '—' : b.avg_first_response_min < 60 ? `${b.avg_first_response_min} min` : `${Math.round(b.avg_first_response_min / 60)} h`}</td>
                      <td>{b.visits_attended}</td>
                      <td>{b.won}</td>
                      <td>{formatINR(Number(b.revenue))}</td>
                      <td className={b.overdue_tasks > 0 ? 'font-semibold text-danger-700' : ''}>{b.overdue_tasks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
