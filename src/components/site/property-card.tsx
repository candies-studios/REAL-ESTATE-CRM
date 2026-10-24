import { Building2, MapPin, Ruler } from 'lucide-react';
import Link from 'next/link';
import { Badge, Card } from '@/components/ui/card';
import type { PublicProperty } from '@/lib/listings';
import { mediaUrl } from '@/lib/media';
import { formatINR } from '@/lib/utils';

export const TX_LABEL = { sale: 'For sale', rent: 'For rent', lease: 'For lease' } as const;

export function priceLabel(p: Pick<PublicProperty, 'price' | 'price_on_request' | 'transaction_type'>) {
  if (p.price_on_request || p.price == null) return 'Price on request';
  return formatINR(p.price) + (p.transaction_type === 'sale' ? '' : ' / month');
}

export function PropertyCard({ p }: { p: PublicProperty }) {
  const cover = mediaUrl(p.cover_path);
  return (
    <Card className="group relative flex flex-col overflow-hidden transition-shadow hover:shadow-[var(--shadow-lift)]">
      <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-navy-50">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
        ) : (
          <Building2 className="h-10 w-10 text-navy-600/40" aria-hidden="true" />
        )}
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <Badge tone="navy">{TX_LABEL[p.transaction_type]}</Badge>
          {p.status === 'reserved' && <Badge tone="warning">Reserved</Badge>}
          {p.is_demo && <Badge tone="danger">Demo listing</Badge>}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <p className="font-display text-xl font-semibold text-navy-900">{priceLabel(p)}</p>
        <h3 className="font-sans text-base font-semibold text-stone-900">
          <Link href={`/properties/${p.id}`} className="after:absolute after:inset-0 focus:outline-none">
            {p.title}
          </Link>
        </h3>
        <p className="flex items-center gap-1.5 text-sm text-stone-600">
          <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
          {[p.project_name, p.locality, p.city].filter(Boolean).join(', ')}
        </p>
        <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-3 text-sm text-stone-700">
          {p.configuration && <span>{p.configuration}</span>}
          <span>{p.property_type}</span>
          {p.carpet_area && (
            <span className="flex items-center gap-1">
              <Ruler className="h-4 w-4" aria-hidden="true" />
              {p.carpet_area} {p.area_unit === 'sq_ft' ? 'sq ft' : 'sq m'}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
