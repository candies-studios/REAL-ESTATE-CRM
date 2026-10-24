import { ArrowLeft, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fmtDate } from '@/components/dashboard/format';
import { PageHeader } from '@/components/dashboard/page-header';
import { MediaManager, PropertyForm, PublishControls } from '@/components/dashboard/property-form';
import { Badge, Card } from '@/components/ui/card';
import { FormAlert } from '@/components/ui/field';
import { requireMembership } from '@/lib/auth';
import { getMembers } from '@/lib/crm';
import { mediaUrl } from '@/lib/media';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function PropertyAdminPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sp = await searchParams;
  const { membership } = await requireMembership();
  const supabase = await createClient();
  const { data: p } = await supabase.from('properties').select('*').eq('id', id).eq('org_id', membership.orgId).maybeSingle();
  if (!p) notFound();
  const [members, { data: media }, { data: matches }, { data: enquiries }, { data: org }] = await Promise.all([
    getMembers(membership.orgId),
    supabase.from('property_media').select('id, storage_path, alt_text, is_cover, position').eq('property_id', id).order('is_cover', { ascending: false }).order('position'),
    supabase.from('lead_property_matches').select('score, leads ( id, full_name )').eq('property_id', id).order('score', { ascending: false }).limit(15),
    supabase.from('property_enquiries').select('id, created_at, wants_site_visit, leads ( id, full_name )').eq('property_id', id).order('created_at', { ascending: false }).limit(15),
    supabase.from('organizations').select('settings').eq('id', membership.orgId).single(),
  ]);
  const manage = can(membership.role, 'inventory.manage');
  const staleDays = Number(org?.settings?.automation?.stale_listing_days ?? 30);
  const stale = !p.last_verified_at || Date.parse(p.last_verified_at) < Date.now() - staleDays * 86_400_000;

  return (
    <>
      <Link href="/dashboard/properties" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-stone-600 hover:text-navy-900">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Properties
      </Link>
      <PageHeader
        title={p.title}
        description={`${p.ref_code} · ${p.locality} · ${p.status}${p.listing_source === 'owner_submission' ? ' · submitted by owner — review before publishing' : ''}`}
        actions={p.is_published && (
          <Link href={`/properties/${p.id}`} target="_blank" className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy-800 underline">
            View on website <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
      />
      {sp.created && <div className="mb-5"><FormAlert tone="success">Listing created. Add photos, verify availability, then publish.</FormAlert></div>}

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-5">
          {manage ? <PropertyForm members={members.filter((m) => m.role !== 'viewer').map((m) => ({ id: m.user_id, name: m.name }))} property={p} />
            : <Card className="p-6 text-sm text-stone-700">{p.description ?? 'No description.'}</Card>}
        </div>
        <div className="flex flex-col gap-5">
          <Card className="p-5">
            <h2 className="font-sans text-base font-semibold text-navy-900">Website</h2>
            <p className="mt-2 text-sm text-stone-700">
              {p.is_published ? <Badge tone="success">Live</Badge> : <Badge tone="neutral">Hidden</Badge>}{' '}
              Last verified: {p.last_verified_at ? fmtDate(p.last_verified_at) : 'never'} {stale && <Badge tone="danger">Re-verify</Badge>}
            </p>
            {manage && <PublishControls id={p.id} published={p.is_published} status={p.status} verified={Boolean(p.last_verified_at)} />}
          </Card>
          <Card className="p-5">
            <h2 className="font-sans text-base font-semibold text-navy-900">Photos</h2>
            {manage ? (
              <MediaManager orgId={membership.orgId} propertyId={p.id}
                media={(media ?? []).map((m) => ({ id: m.id, url: mediaUrl(m.storage_path) ?? '', alt: m.alt_text ?? '', isCover: m.is_cover }))} />
            ) : <p className="mt-2 text-sm text-stone-600">{(media ?? []).length} photos.</p>}
          </Card>
          <Card className="p-5">
            <h2 className="font-sans text-base font-semibold text-navy-900">Interested leads</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {(enquiries ?? []).map((e) => {
                const l = (Array.isArray(e.leads) ? e.leads[0] : e.leads) as { id: string; full_name: string } | null;
                return l && <li key={e.id}><Link className="font-medium text-navy-900 hover:underline" href={`/dashboard/leads/${l.id}`}>{l.full_name}</Link> <span className="text-stone-500">enquired {fmtDate(e.created_at)}{e.wants_site_visit ? ', wants a visit' : ''}</span></li>;
              })}
              {(matches ?? []).map((m, i) => {
                const l = (Array.isArray(m.leads) ? m.leads[0] : m.leads) as { id: string; full_name: string } | null;
                return l && <li key={`m${i}`}><Link className="font-medium text-navy-900 hover:underline" href={`/dashboard/leads/${l.id}`}>{l.full_name}</Link> <span className="text-stone-500">{m.score}% requirement match</span></li>;
              })}
              {!(enquiries ?? []).length && !(matches ?? []).length && <li className="text-stone-600">No enquiries or matching leads yet.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
