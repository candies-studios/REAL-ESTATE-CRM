import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { EnquiryForm, type FormVariant } from '@/components/site/enquiry-form';
import { Card } from '@/components/ui/card';

const PAGES: Record<string, { variant: FormVariant; title: string; intro: string; points: string[] }> = {
  buy: {
    variant: 'buyer',
    title: 'Tell us what you’d like to buy',
    intro: 'Share your budget, preferred localities and timeline. We’ll shortlist options that fit and arrange visits.',
    points: ['Only relevant options, based on your requirement', 'Site visits scheduled around your time', 'One broker as your point of contact'],
  },
  rent: {
    variant: 'tenant',
    title: 'Find a home or office to rent',
    intro: 'Tell us your monthly budget, move-in date and furnishing preference.',
    points: ['Rentals matched to your budget and move-in date', 'Visits arranged with owners', 'Help with the agreement process'],
  },
  sell: {
    variant: 'owner',
    title: 'Sell or rent out your property',
    intro: 'Share a few details. A broker reviews every submission before anything is listed.',
    points: ['Nothing is published without your approval and verification', 'Enquiries qualified before visits', 'Regular updates on interest'],
  },
};

export function generateStaticParams() {
  return Object.keys(PAGES).map((type) => ({ type }));
}

export async function generateMetadata({ params }: { params: Promise<{ type: string }> }): Promise<Metadata> {
  const page = PAGES[(await params).type];
  return page ? { title: page.title } : {};
}

export default async function EnquirePage({ params, searchParams }: {
  params: Promise<{ type: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const page = PAGES[(await params).type];
  if (!page) notFound();
  const sp = await searchParams;
  return (
    <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:py-16 lg:grid-cols-[1fr_1.3fr]">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-600">Enquiry</p>
        <h1 className="mt-2 text-4xl">{page.title}</h1>
        <p className="mt-4 text-lg text-stone-600">{page.intro}</p>
        <ul className="mt-8 space-y-3">
          {page.points.map((pt) => (
            <li key={pt} className="flex gap-3 text-stone-700"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" />{pt}</li>
          ))}
        </ul>
      </div>
      <Card className="p-6 sm:p-8">
        <Suspense>
          <EnquiryForm variant={page.variant} defaultLocality={sp.locality} defaultTopic={sp.topic} />
        </Suspense>
      </Card>
    </div>
  );
}
