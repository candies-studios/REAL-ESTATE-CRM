'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getShortlist } from '@/app/actions/enquiry';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { PublicProperty } from '@/lib/listings';
import { mediaUrl } from '@/lib/media';
import { priceLabel } from './property-card';
import { readShortlist, ShortlistButton } from './property-actions';

export function ShortlistView() {
  const [items, setItems] = useState<PublicProperty[] | null>(null);

  useEffect(() => {
    const load = async () => setItems(await getShortlist(readShortlist()));
    load();
    window.addEventListener('shortlist-change', load);
    return () => window.removeEventListener('shortlist-change', load);
  }, []);

  if (items === null) return <p className="mt-8 text-stone-600">Loading…</p>;
  if (items.length === 0) {
    return (
      <Card className="mt-8 p-8 text-center">
        <p className="font-display text-xl text-navy-900">Nothing saved yet.</p>
        <p className="mt-2 text-stone-600">Tap “Shortlist” on any property to keep it here.</p>
        <Link href="/properties" className={`${buttonVariants({ variant: 'primary' })} mt-5`}>Browse properties</Link>
      </Card>
    );
  }
  return (
    <ul className="mt-8 grid gap-4">
      {items.map((p) => (
        <li key={p.id}>
          <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
            {p.cover_path ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaUrl(p.cover_path)!} alt="" className="h-24 w-full rounded-lg object-cover sm:w-36" />
            ) : <div className="h-24 w-full rounded-lg bg-navy-50 sm:w-36" />}
            <div className="flex-1">
              <Link href={`/properties/${p.id}`} className="font-semibold text-navy-900 hover:underline">{p.title}</Link>
              <p className="text-sm text-stone-600">{p.locality} · {priceLabel(p)}</p>
            </div>
            <div className="flex gap-2">
              <Link href={`/properties/${p.id}#enquire`} className={buttonVariants({ variant: 'primary', size: 'sm' })}>Enquire</Link>
              <ShortlistButton id={p.id} />
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
