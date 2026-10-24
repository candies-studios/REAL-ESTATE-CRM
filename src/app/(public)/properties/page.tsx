import type { Metadata } from 'next';
import Link from 'next/link';
import { PropertyCard } from '@/components/site/property-card';
import { SearchBar } from '@/components/site/search-bar';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getPublicProperties } from '@/lib/listings';

export const metadata: Metadata = {
  title: 'Properties in Navi Mumbai',
  description: 'Browse verified residential and commercial properties for sale and rent across Navi Mumbai.',
};

type Search = Promise<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function PropertiesPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const filters = {
    locality: one(sp.locality) || undefined,
    category: one(sp.category) || undefined,
    transaction: one(sp.transaction) || undefined,
    type: one(sp.type) || undefined,
    maxBudget: Number(one(sp.maxBudget)) || undefined,
  };
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const { items, total, pageSize } = await getPublicProperties(filters, page);
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const qs = (p: number) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && params.set(k, String(v)));
    params.set('page', String(p));
    return `/properties?${params.toString()}`;
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 md:py-14">
      <h1 className="text-3xl sm:text-4xl">
        Properties{filters.locality ? ` in ${filters.locality}` : ' in Navi Mumbai'}
      </h1>
      <p className="mt-2 text-stone-600">
        {total > 0 ? `${total} listing${total === 1 ? '' : 's'} match your search.` : 'Search by locality, type and budget.'}
      </p>
      <div className="mt-6">
        <SearchBar defaults={{ ...filters, maxBudget: filters.maxBudget ? String(filters.maxBudget) : undefined }} />
      </div>

      {items.length > 0 ? (
        <>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((p) => <PropertyCard key={p.id} p={p} />)}
          </div>
          {pages > 1 && (
            <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-3">
              {page > 1 && <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} href={qs(page - 1)}>Previous</Link>}
              <span className="text-sm text-stone-600">Page {page} of {pages}</span>
              {page < pages && <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} href={qs(page + 1)}>Next</Link>}
            </nav>
          )}
        </>
      ) : (
        <Card className="mt-8 p-8 text-center">
          <p className="font-display text-xl text-navy-900">No listings match these filters yet.</p>
          <p className="mx-auto mt-2 max-w-md text-stone-600">
            Try a wider budget or another locality, or share your requirement and we’ll contact you when something suitable is verified.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <Link href="/properties" className={buttonVariants({ variant: 'outline' })}>Clear filters</Link>
            <Link href="/contact?topic=buy" className={buttonVariants({ variant: 'primary' })}>Share your requirement</Link>
          </div>
        </Card>
      )}
      <p className="mt-10 text-xs text-stone-500">
        Prices, areas and availability are indicative and subject to verification and change. Listings marked “Demo listing” are samples, not real offers.
      </p>
    </div>
  );
}
