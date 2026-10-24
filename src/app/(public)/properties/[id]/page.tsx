import { Building2, CalendarCheck, CheckCircle2, MapPin } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { EnquiryForm } from '@/components/site/enquiry-form';
import { priceLabel, PropertyCard, TX_LABEL } from '@/components/site/property-card';
import { ShareButton, ShortlistButton } from '@/components/site/property-actions';
import { Badge, Card } from '@/components/ui/card';
import { getPublicMedia, getPublicProperty, getSimilarProperties } from '@/lib/listings';
import { mediaUrl } from '@/lib/media';

type Params = Promise<{ id: string }>;

const FURNISHING: Record<string, string> = { unfurnished: 'Unfurnished', semi_furnished: 'Semi-furnished', fully_furnished: 'Fully furnished' };
const POSSESSION: Record<string, string> = { ready_to_move: 'Ready to move', under_construction: 'Under construction' };

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const p = await getPublicProperty((await params).id);
  if (!p) return { title: 'Property not found' };
  return {
    title: `${p.title}, ${p.locality}`,
    description: `${TX_LABEL[p.transaction_type]}: ${p.title} in ${p.locality}, ${p.city}. ${priceLabel(p)}.`,
    openGraph: { images: p.cover_path ? [mediaUrl(p.cover_path)!] : [] },
  };
}

export default async function PropertyPage({ params }: { params: Params }) {
  const p = await getPublicProperty((await params).id);
  if (!p) notFound();
  const [media, similar] = await Promise.all([getPublicMedia(p.id), getSimilarProperties(p)]);

  const facts = [
    ['Price', priceLabel(p)],
    ['Type', p.property_type],
    ['Configuration', p.configuration],
    ['Carpet area', p.carpet_area ? `${p.carpet_area} ${p.area_unit === 'sq_ft' ? 'sq ft' : 'sq m'}` : null],
    ['Furnishing', p.furnishing ? FURNISHING[p.furnishing] : null],
    ['Possession', p.possession_status ? POSSESSION[p.possession_status] : null],
    ['Possession date', p.possession_date ? new Date(p.possession_date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : null],
    ['Project', p.project_name],
    ['Listing ID', p.ref_code],
  ].filter(([, v]) => v) as [string, string][];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 md:py-12">
      {/* Gallery */}
      {media.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediaUrl(media[0].storage_path)!} alt={media[0].alt_text ?? p.title}
            className="aspect-[16/10] w-full rounded-2xl object-cover" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
            {media.slice(1, 3).map((m) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={m.id} src={mediaUrl(m.storage_path)!} alt={m.alt_text ?? ''} loading="lazy"
                className="aspect-[16/10] w-full rounded-2xl object-cover" />
            ))}
          </div>
          {media.length > 3 && (
            <div className="flex gap-3 overflow-x-auto md:col-span-2">
              {media.slice(3).map((m) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={m.id} src={mediaUrl(m.storage_path)!} alt={m.alt_text ?? ''} loading="lazy"
                  className="h-28 w-44 shrink-0 rounded-xl object-cover" />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex aspect-[21/9] items-center justify-center rounded-2xl bg-navy-50">
          <Building2 className="h-14 w-14 text-navy-600/40" aria-hidden="true" />
          <span className="sr-only">Photos coming soon</span>
        </div>
      )}

      <div className="mt-8 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="navy">{TX_LABEL[p.transaction_type]}</Badge>
            <Badge tone="neutral" className="capitalize">{p.category}</Badge>
            {p.status === 'reserved' && <Badge tone="warning">Reserved</Badge>}
            {p.is_demo && <Badge tone="danger">Demo listing — not a real offer</Badge>}
          </div>
          <h1 className="mt-4 text-3xl sm:text-4xl">{p.title}</h1>
          <p className="mt-2 flex items-center gap-1.5 text-stone-600">
            <MapPin className="h-4 w-4" aria-hidden="true" />
            {[p.public_location, p.locality, p.city].filter(Boolean).join(', ')}
          </p>
          <p className="mt-5 font-display text-3xl text-navy-900">{priceLabel(p)}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <ShortlistButton id={p.id} />
            <ShareButton title={p.title} />
          </div>

          <Card className="mt-8 p-6">
            <h2 className="text-xl">Key details</h2>
            <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {facts.map(([k, v]) => (
                <div key={k} className="border-b border-stone-200 pb-3">
                  <dt className="text-xs font-semibold uppercase tracking-wider text-stone-500">{k}</dt>
                  <dd className="mt-1 font-medium text-stone-900">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>

          {p.description && (
            <section className="mt-8">
              <h2 className="text-xl">About this property</h2>
              <p className="mt-3 whitespace-pre-line leading-relaxed text-stone-700">{p.description}</p>
            </section>
          )}

          {p.amenities.length > 0 && (
            <section className="mt-8">
              <h2 className="text-xl">Amenities</h2>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {p.amenities.map((a) => (
                  <li key={a} className="flex items-center gap-2 text-stone-700">
                    <CheckCircle2 className="h-4 w-4 text-gold-600" aria-hidden="true" /> {a}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(p.rera_number || p.rera_project_name) && (
            <section className="mt-8 rounded-xl border border-stone-200 bg-white p-5 text-sm">
              <h2 className="font-sans text-sm font-semibold uppercase tracking-wider text-stone-600">MahaRERA</h2>
              {p.rera_project_name && <p className="mt-2">Project: {p.rera_project_name}</p>}
              {p.rera_number && <p className="mt-1">Registration no.: {p.rera_number}</p>}
              <p className="mt-2 text-stone-500">Verify registration details on the MahaRERA website.</p>
            </section>
          )}

          <p className="mt-8 text-xs leading-relaxed text-stone-500">
            Price, area and availability are indicative and subject to verification.
            {p.last_verified_at && ` Availability last verified ${new Date(p.last_verified_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.`}
          </p>
        </div>

        <aside id="enquire" className="lg:sticky lg:top-24 lg:self-start">
          <Card className="p-6">
            <h2 className="flex items-center gap-2 text-2xl"><CalendarCheck className="h-6 w-6 text-gold-600" aria-hidden="true" /> Enquire or book a visit</h2>
            <p className="mt-1 text-sm text-stone-600">A broker will confirm details and timing with you.</p>
            <div className="mt-5">
              <Suspense>
                <EnquiryForm variant="property" propertyId={p.id} submitLabel="Send enquiry" />
              </Suspense>
            </div>
          </Card>
        </aside>
      </div>

      {similar.length > 0 && (
        <section className="mt-16" aria-labelledby="similar-h">
          <h2 id="similar-h" className="text-2xl">Similar properties</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {similar.map((s) => <PropertyCard key={s.id} p={s} />)}
          </div>
        </section>
      )}
    </div>
  );
}
