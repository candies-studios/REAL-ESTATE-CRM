import { Download, Plus } from 'lucide-react';
import Link from 'next/link';
import { LeadTable, type LeadRow } from '@/components/dashboard/lead-table';
import { PageHeader } from '@/components/dashboard/page-header';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { requireMembership } from '@/lib/auth';
import { buildLeadQuery, getMembers, getStages, LEAD_PAGE_SIZE, parseLeadParams } from '@/lib/crm';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Leads' };
export const dynamic = 'force-dynamic';

const SOURCES = ['website', 'manual', 'walk_in', 'referral', 'portal', 'google', 'facebook', 'instagram'];

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { membership } = await requireMembership();
  const sp = await searchParams;
  const params = parseLeadParams(sp);
  const supabase = await createClient();
  const [stages, members] = await Promise.all([getStages(membership.orgId), getMembers(membership.orgId)]);

  const from = (params.page! - 1) * LEAD_PAGE_SIZE;
  const { data, count, error } = await buildLeadQuery(supabase, membership.orgId, params, { count: true })
    .range(from, from + LEAD_PAGE_SIZE - 1);
  const rows = (data ?? []) as unknown as LeadRow[];
  const pages = Math.max(1, Math.ceil((count ?? 0) / LEAD_PAGE_SIZE));
  const isManager = can(membership.role, 'leads.edit_all');

  const qs = (overrides: Record<string, string | number | undefined>) => {
    const u = new URLSearchParams();
    Object.entries({ ...params, ...overrides }).forEach(([k, v]) => { if (v !== undefined && v !== '' && !(k === 'page' && v === 1)) u.set(k, String(v)); });
    return u.toString();
  };
  const select = 'h-10 rounded-lg border border-stone-300 bg-white px-2 text-sm';

  return (
    <>
      <PageHeader
        title="Leads"
        description={membership.role === 'broker' ? 'Leads assigned to you.' : 'Every enquiry in your brokerage.'}
        actions={
          <div className="flex gap-2">
            {can(membership.role, 'export.csv') && (
              <a href={`/dashboard/leads/export?${qs({ page: undefined })}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                <Download className="h-4 w-4" aria-hidden="true" /> Export CSV
              </a>
            )}
            {membership.role !== 'viewer' && (
              <Link href="/dashboard/leads/new" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
                <Plus className="h-4 w-4" aria-hidden="true" /> New lead
              </Link>
            )}
          </div>
        }
      />

      <Card className="mb-5 p-4">
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8" aria-label="Filter leads">
          <label className="sr-only" htmlFor="f-q">Search</label>
          <input id="f-q" name="q" defaultValue={params.q} placeholder="Name, phone, email, locality, property"
            className="h-10 rounded-lg border border-stone-300 bg-white px-3 text-sm sm:col-span-2 lg:col-span-2" />
          <label className="sr-only" htmlFor="f-stage">Stage</label>
          <select id="f-stage" name="stage" defaultValue={params.stage ?? ''} className={select}>
            <option value="">All stages</option>
            {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {isManager || membership.role === 'viewer' ? (
            <>
              <label className="sr-only" htmlFor="f-broker">Broker</label>
              <select id="f-broker" name="broker" defaultValue={params.broker ?? ''} className={select}>
                <option value="">All brokers</option>
                <option value="unassigned">Unassigned</option>
                {members.filter((m) => m.role !== 'viewer').map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
              </select>
            </>
          ) : <input type="hidden" name="broker" value="" />}
          <label className="sr-only" htmlFor="f-cat">Score</label>
          <select id="f-cat" name="category" defaultValue={params.category ?? ''} className={select}>
            <option value="">Any score</option>
            <option value="hot">Hot</option><option value="warm">Warm</option><option value="cold">Cold</option><option value="unscored">Unscored</option>
          </select>
          <label className="sr-only" htmlFor="f-source">Source</label>
          <select id="f-source" name="source" defaultValue={params.source ?? ''} className={select}>
            <option value="">Any source</option>
            {SOURCES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-2">
            <label className="sr-only" htmlFor="f-from">Created from</label>
            <input id="f-from" type="date" name="from" defaultValue={params.from} className={`${select} min-w-0 flex-1`} />
            <label className="sr-only" htmlFor="f-to">Created to</label>
            <input id="f-to" type="date" name="to" defaultValue={params.to} className={`${select} min-w-0 flex-1`} />
          </div>
          <label className="sr-only" htmlFor="f-sort">Sort</label>
          <select id="f-sort" name="sort" defaultValue={params.sort ?? ''} className={select}>
            <option value="">Newest first</option><option value="oldest">Oldest first</option>
            <option value="score">Highest score</option><option value="follow_up">Next follow-up</option><option value="name">Name A–Z</option>
          </select>
          <div className="flex gap-2">
            <button type="submit" className={buttonVariants({ variant: 'primary', size: 'sm' })}>Apply</button>
            <Link href="/dashboard/leads" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Reset</Link>
          </div>
        </form>
      </Card>

      {error ? (
        <Card className="p-6 text-danger-700">Couldn’t load leads. Check that the database migrations have been run.</Card>
      ) : (
        <LeadTable
          rows={rows}
          canBulk={isManager}
          stages={stages.filter((s) => !s.is_won && !s.is_lost).map((s) => ({ id: s.id, name: s.name }))}
          members={members.filter((m) => m.role !== 'viewer').map((m) => ({ id: m.user_id, name: m.name }))}
        />
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-stone-600">
        <span>{count ?? 0} lead{count === 1 ? '' : 's'}</span>
        {pages > 1 && (
          <nav aria-label="Pagination" className="flex items-center gap-2">
            {params.page! > 1 && <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} href={`?${qs({ page: params.page! - 1 })}`}>Previous</Link>}
            <span>Page {params.page} of {pages}</span>
            {params.page! < pages && <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} href={`?${qs({ page: params.page! + 1 })}`}>Next</Link>}
          </nav>
        )}
      </div>
    </>
  );
}
