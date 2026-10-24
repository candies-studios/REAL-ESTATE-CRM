import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { brand } from '@/config/brand';

/*
 * Starting-point legal text describing what this software actually does.
 * It is NOT legal advice: have a lawyer review it against the Digital Personal
 * Data Protection Act 2023, MahaRERA rules and consumer law before launch.
 */
const PAGES: Record<string, { title: string; body: string[] }> = {
  privacy: {
    title: 'Privacy policy',
    body: [
      `${brand.name} collects the details you choose to share with us — such as your name, phone number, email address and property requirements — to respond to your enquiry, suggest suitable properties and arrange site visits.`,
      'We record when and how you agreed to be contacted, and the channels you allowed. You can ask us to stop contacting you at any time.',
      'Your details are visible only to our team members who work on your enquiry. We do not sell personal data.',
      'You may ask to see, correct or delete the personal data we hold about you by contacting us using the details on our contact page.',
      'We keep enquiry records only for as long as needed for these purposes and to meet legal obligations.',
    ],
  },
  terms: {
    title: 'Terms of use',
    body: [
      `This website is operated by ${brand.name}. Information on it is provided for general guidance about properties in Navi Mumbai.`,
      'Listings may change, be withdrawn or be sold or let at any time. Nothing on this website is an offer or a binding commitment.',
      'You agree to provide accurate information in any enquiry and not to misuse the website or its forms.',
    ],
  },
  disclaimer: {
    title: 'Property information disclaimer',
    body: [
      'Prices, carpet areas, possession dates, amenities and availability are indicative, are based on information from owners, developers or public sources, and are subject to verification.',
      'Please verify all details, approvals and MahaRERA registration (where applicable) independently before making any decision or payment.',
      'Listings labelled “Demo listing” are samples used while the website is being set up and are not real offers.',
    ],
  },
};

export function generateStaticParams() {
  return Object.keys(PAGES).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const page = PAGES[(await params).slug];
  return page ? { title: page.title } : {};
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const page = PAGES[(await params).slug];
  if (!page) notFound();
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 md:py-16">
      <h1 className="text-4xl">{page.title}</h1>
      <div className="mt-8 space-y-4 text-[17px] leading-relaxed text-stone-700">
        {page.body.map((p) => <p key={p}>{p}</p>)}
      </div>
    </article>
  );
}
