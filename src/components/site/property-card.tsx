import { Building2, MapPin, Ruler } from 'lucide-react';
import { Badge, Card } from '@/components/ui/card';
import type { PublicProperty } from '@/lib/listings';
import { formatINR } from '@/lib/utils';

const TX_LABEL = { sale: 'For sale', rent: 'For rent', lease: 'For lease' } as const;

export function PropertyCard({ p }: { p: PublicProperty }) {
  const price = p.price_on_request ? 'Price on request' : formatINR(p.price) + (p.transaction_type === 'sale' ? '' : ' / month');
  return (
    <Card className="group flex flex-col overflow-hidden transition-shadow hover:shadow-[var(--shadow-lift)]">
      <div className="relative flex aspect-[4/3] items-center justify-center bg-navy-50">
        {/* Photos are added with the property media manager in Phase 4. */}
        <Building2 className="h-10 w-10 text-navy-600/40" aria-hidden="true" />
        <div className="absolute left-3 top-3 flex gap-2">
          <Badge tone="navy">{TX_LABEL[p.transaction_type]}</Badge>
          {p.status === 'reserved' && <Badge tone="warning">Reserved</Badge>}
          {p.is_demo && <Badge tone="danger">Demo listing</Badge>}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <p className="font-display text-xl font-semibold text-navy-900">{price}</p>
        <h3 className="font-sans text-base font-semibold text-stone-900">{p.title}</h3>
        <p className="flex items-center gap-1.5 text-sm text-stone-600">
          <MapPin className="h-4 w-4" aria-hidden="true" />
          {[p.project_name, p.locality, p.city].filter(Boolean).join(', ')}
        </p>
        <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-3 text-sm text-stone-700">
          {p.configuration && <span>{p.configuration}</span>}
          <span className="capitalize">{p.property_type}</span>
          {p.carpet_area && (
            <span className="flex items-center gap-1">
              <Ruler className="h-4 w-4" aria-hidden="true" />
              {p.carpet_area} {p.area_unit === 'sq_ft' ? 'sq ft' : 'sq m'} carpet
            </span>
          )}
        </div>
        {p.rera_number && <p className="text-xs text-stone-500">MahaRERA: {p.rera_number}</p>}
      </div>
    </Card>
  );
}
