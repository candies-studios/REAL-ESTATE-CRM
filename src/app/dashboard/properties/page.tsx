import { Plus } from 'lucide-react';
import Link from 'next/link';
import { fmtDate } from '@/components/dashboard/format';
import { PageHeader } from '@/components/dashboard/page-header';
import { buttonVariants } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { NAVI_MUMBAI_LOCALITIES } from '@/config/brand';
import { requireMembership } from '@/lib/auth';
import { getMembers } from '@/lib/crm';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import { formatINR } from '@/lib/utils';

export const metadata = { title: 'Properties' };
export const dynamic = 'force-dynamic';

const STATUS_TONE = { draft: 'neutral', available: 'success', reserved: 'warning', sold: 'navy', rented: 'navy', inactive: 'neutral' } as const;

export default async function PropertiesAdminPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { membership } = await requireMembership();
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: settings }, members] = await Promise.all([
    supabase.from('organizations').select('settings').eq('id', membership.orgId).single(),
    getMembers(membership.orgId),
  ]);
  const staleDays = Number(settings?.settings?.automation?.stale_listing_days ?? 30);
  const staleBefore = new Date(Date.now() - staleDays * 86_400_000).toISOString();
  const page = Math.max(1, Number(sp.page) || 1);
  const size = 25;

  let q = supabase.from('properties').select('id, ref_code, title, locality, price, price_on_request, transaction_type, status, is_published, is_demo, last_verified_at, assigned_broker, listing_source, updated_at', { count: 'exact' })
    .eq('org_id', membership.orgId);
  if (sp.status) q = q.eq('status', sp.status);
  if (sp.locality) q = q.eq('locality', sp.locality);
  if (sp.q) q = q.or(`title.ilike.%${sp.q.replace(/[,()"'%*]/g, ' ').slice(0, 60)}%,ref_code.ilike.%${sp.q.replace(/[,()"'%*]/g, ' ').slice(0, 60)}%`);
  if (sp.stale === '1') q = q.in('status', ['available', 'reserved']).or(`last_verified_at.is.null,last_verified_at.lt.${staleBefore}`);
  if (sp.source === 'owner_submission') q = q.eq('listing_source', 'owner_submission');
  const { data, count } = await q.order('updated_at', { ascending: false }).range((page - 1) * size, page * size - 1);
  const names = new Map(members.map((m) => [m.user_id, m.name]));
  const pages = Math.max(1, Math.ceil((count ?? 0) / size));
  const sel = 'h-10 rounded-lg border border-stone-300 bg-white px-2 text-sm';

  return (
    <>
      <PageHeader
        title="Properties"
        description={`Inventory. Listings not verified in ${staleDays} days are flagged for re-verification.`}
        actions={can(membership.role, 'inventory.manage') && (
          <Link href="/dashboard/properties/new" className={buttonVariants({ size: 'sm' })}><Plus className="h-4 w-4" aria-hidden="true" /> New listing</Link>
        )}
      />
      <Card className="mb-5 p-4">
        <form method="get" className="flex flex-wrap gap-3" aria-label="Filter properties">
          <label className="sr-only" htmlFor="pq">Search</label>
          <input id="pq" name="q" defaultValue={sp.q} placeholder="Title or listing ID" className={`${sel} min-w-52 flex-1 px-3`} />
          <label className="sr-only" htmlFor="ps">Status</label>
          <select id="ps" name="status" defaultValue={sp.status ?? ''} className={sel}>
            <option value="">Any status</option>
            {['draft', 'available', 'reserved', 'sold', 'rented', 'inactive'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <label className="sr-only" htmlFor="pl">Locality</label>
          <select id="pl" name="locality" defaultValue={sp.locality ?? ''} className={sel}>
            <option value="">Any locality</option>
            {NAVI_MUMBAI_LOCALITIES.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="stale" value="1" defaultChecked={sp.stale === '1'} className="h-4 w-4 accent-navy-900" /> Needs re-verification</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="source" value="owner_submission" defaultChecked={sp.source === 'owner_submission'} className="h-4 w-4 accent-navy-900" /> Owner submissions</label>
          <button className={buttonVariants({ size: 'sm' })} type="submit">Apply</button>
          <Link href="/dashboard/properties" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Reset</Link>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <caption className="sr-only">Properties</caption>
            <thead className="border-b border-stone-200 bg-stone-100/70 text-xs uppercase tracking-wider text-stone-600">
              <tr>
                <th scope="col" className="px-4 py-3">Listing</th><th scope="col" className="px-4 py-3">Price</th>
                <th scope="col" className="px-4 py-3">Status</th><th scope="col" className="px-4 py-3">Website</th>
                <th scope="col" className="px-4 py-3">Verified</th><th scope="col" className="px-4 py-3">Broker</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {(data ?? []).length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-stone-600">No listings yet.</td></tr>
              )}
              {(data ?? []).map((p) => {
                const stale = ['available', 'reserved'].includes(p.status) && (!p.last_verified_at || p.last_verified_at < staleBefore);
                return (
                  <tr key={p.id} className="hover:bg-stone-100/50">
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/properties/${p.id}`} className="font-semibold text-navy-900 hover:underline">{p.title}</Link>
                      <div className="text-xs text-stone-600">{p.ref_code} · {p.locality}{p.listing_source === 'owner_submission' && ' · owner submission'}{p.is_demo && ' · demo'}</div>
                    </td>
                    <td className="px-4 py-3">{p.price_on_request ? 'On request' : formatINR(p.price)}{p.transaction_type !== 'sale' && p.price ? '/mo' : ''}</td>
                    <td className="px-4 py-3"><Badge tone={STATUS_TONE[p.status as keyof typeof STATUS_TONE]}>{p.status}</Badge></td>
                    <td className="px-4 py-3">{p.is_published ? <Badge tone="success">Live</Badge> : <span className="text-stone-500">Hidden</span>}</td>
                    <td className="px-4 py-3">{stale ? <Badge tone="danger">Re-verify</Badge> : fmtDate(p.last_verified_at)}</td>
                    <td className="px-4 py-3">{p.assigned_broker ? names.get(p.assigned_broker) ?? '—' : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      {pages > 1 && (
        <nav aria-label="Pagination" className="mt-4 flex justify-end gap-2 text-sm">
          {page > 1 && <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} href={`?${new URLSearchParams({ ...sp, page: String(page - 1) } as Record<string, string>)}`}>Previous</Link>}
          <span className="self-center">Page {page} of {pages}</span>
          {page < pages && <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} href={`?${new URLSearchParams({ ...sp, page: String(page + 1) } as Record<string, string>)}`}>Next</Link>}
        </nav>
      )}
    </>
  );
}
