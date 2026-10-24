import type { Metadata } from 'next';
import { ShortlistView } from '@/components/site/shortlist-view';

export const metadata: Metadata = { title: 'Your shortlist', robots: { index: false } };

export default function ShortlistPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <h1 className="text-4xl">Your shortlist</h1>
      <p className="mt-2 text-stone-600">Saved on this device only. Share it with a broker when you enquire.</p>
      <ShortlistView />
    </div>
  );
}
