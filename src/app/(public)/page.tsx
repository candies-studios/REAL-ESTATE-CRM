import { ArrowRight, Building, CalendarCheck, ClipboardCheck, Home, KeyRound, ShieldCheck, Store, Users } from 'lucide-react';
import Link from 'next/link';
import { PropertyCard } from '@/components/site/property-card';
import { SearchBar } from '@/components/site/search-bar';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { brand, NAVI_MUMBAI_LOCALITIES } from '@/config/brand';
import { getPublicProperties } from '@/lib/listings';
import { cn } from '@/lib/utils';

export const revalidate = 300;

const SERVICES = [
  { icon: Home, title: 'Buyers', body: 'Tell us your budget, preferred localities and timeline. We shortlist options that fit and arrange site visits.', cta: 'Start your search', href: '/properties?transaction=sale' },
  { icon: Building, title: 'Sellers', body: 'Share your property details. We review them, verify documents and market the listing to qualified buyers.', cta: 'List your property', href: '/contact?topic=sell' },
  { icon: KeyRound, title: 'Landlords', body: 'Find tenants for your flat, office or shop, with screening and visits handled for you.', cta: 'Rent out a property', href: '/contact?topic=landlord' },
  { icon: Users, title: 'Tenants', body: 'Share your move-in date, budget and furnishing needs and see rentals that match.', cta: 'Find a rental', href: '/properties?transaction=rent' },
];

const PROCESS = [
  { icon: ClipboardCheck, title: 'Your requirement, understood', body: 'A short qualification captures budget, location, configuration and timeline, so you only see relevant options.' },
  { icon: ShieldCheck, title: 'Listings checked before they’re shown', body: 'Each listing records when its availability was last verified, and stale listings are flagged for re-checking.' },
  { icon: CalendarCheck, title: 'Visits that are organised', body: 'Site visits are scheduled, confirmed and followed up by your assigned broker, with nothing left to memory.' },
];

export default async function HomePage() {
  const { items: featured } = await getPublicProperties({}, 1);

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-navy-900 text-ivory">
        <div aria-hidden="true" className="absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '56px 56px' }} />
        <div aria-hidden="true" className="absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-gold-500/15 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-16 sm:px-6 md:pb-24 md:pt-24">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold-300">{brand.tagline}</p>
          <h1 className="mt-5 max-w-3xl text-4xl font-medium leading-[1.05] text-ivory sm:text-6xl">
            Find the right address in <em className="font-normal text-gold-300">Navi Mumbai</em>.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-stone-200">
            Homes, offices and shops to buy or rent, from Vashi to Ulwe, with a broker who qualifies your
            requirement and organises every site visit.
          </p>
          <div className="mt-10 max-w-5xl text-stone-900">
            <SearchBar />
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/contact?topic=visit" className={buttonVariants({ variant: 'gold', size: 'lg' })}>Book a site visit</Link>
            <Link href="/properties" className={buttonVariants({ variant: 'light', size: 'lg' })}>Browse properties</Link>
          </div>
        </div>
      </section>

      {/* Featured */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 md:py-20" aria-labelledby="featured-h">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-600">Featured</p>
            <h2 id="featured-h" className="mt-2 text-3xl sm:text-4xl">Properties available now</h2>
          </div>
          <Link href="/properties" className="inline-flex items-center gap-1.5 font-semibold text-navy-800 hover:text-gold-700">
            View all <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        {featured.length > 0 ? (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featured.slice(0, 6).map((p) => <PropertyCard key={p.id} p={p} />)}
          </div>
        ) : (
          <Card className="mt-8 flex flex-col items-start gap-3 p-8 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-display text-xl text-navy-900">New listings are being verified.</p>
              <p className="mt-1 text-stone-600">Tell us what you’re looking for and we’ll share options that fit as soon as they’re confirmed.</p>
            </div>
            <Link href="/contact?topic=buy" className={buttonVariants({ variant: 'primary' })}>Share your requirement</Link>
          </Card>
        )}
      </section>

      {/* Categories */}
      <section className="bg-ivory-200/60" aria-labelledby="cat-h">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <h2 id="cat-h" className="text-3xl">Residential and commercial</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {[
              { icon: Home, title: 'Residential', body: 'Apartments, villas, row houses and plots.', href: '/properties?category=residential' },
              { icon: Store, title: 'Commercial', body: 'Offices, shops, showrooms and warehouses.', href: '/properties?category=commercial' },
            ].map(({ icon: Icon, title, body, href }) => (
              <Link key={title} href={href} className="group">
                <Card className="flex items-center gap-5 p-6 transition-shadow group-hover:shadow-[var(--shadow-lift)]">
                  <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-navy-900 text-gold-300">
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block font-display text-2xl text-navy-900">{title}</span>
                    <span className="text-stone-600">{body}</span>
                  </span>
                  <ArrowRight className="ml-auto h-5 w-5 text-stone-500 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Localities */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6" aria-labelledby="loc-h">
        <h2 id="loc-h" className="text-3xl">Popular Navi Mumbai localities</h2>
        <ul className="mt-6 flex flex-wrap gap-2.5">
          {NAVI_MUMBAI_LOCALITIES.map((l) => (
            <li key={l}>
              <Link href={`/properties?locality=${encodeURIComponent(l)}`}
                className="inline-flex rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-navy-900 hover:border-navy-700 hover:bg-navy-50">
                {l}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Services */}
      <section className="bg-navy-950 text-ivory" aria-labelledby="svc-h">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 md:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-300">Services</p>
          <h2 id="svc-h" className="mt-2 text-3xl text-ivory sm:text-4xl">However you’re moving, we can help</h2>
          <div className="mt-10 grid gap-px overflow-hidden rounded-2xl bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
            {SERVICES.map(({ icon: Icon, title, body, cta, href }) => (
              <div key={title} className="flex flex-col gap-3 bg-navy-950 p-7">
                <Icon className="h-7 w-7 text-gold-300" aria-hidden="true" />
                <h3 className="text-2xl text-ivory">{title}</h3>
                <p className="flex-1 text-sm leading-relaxed text-stone-300">{body}</p>
                <Link href={href} className="inline-flex items-center gap-1.5 text-sm font-semibold text-gold-300 hover:text-gold-100">
                  {cta} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How we work */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 md:py-20" aria-labelledby="why-h">
        <h2 id="why-h" className="text-3xl sm:text-4xl">How we work</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {PROCESS.map(({ icon: Icon, title, body }) => (
            <Card key={title} className="p-7">
              <Icon className="h-7 w-7 text-gold-600" aria-hidden="true" />
              <h3 className="mt-4 text-xl">{title}</h3>
              <p className="mt-2 text-stone-600">{body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 pb-20 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-6 rounded-3xl bg-gold-100 px-8 py-12 md:flex-row md:items-center md:justify-between md:px-14">
          <div>
            <h2 className="text-3xl">Ready to see a property in person?</h2>
            <p className="mt-2 max-w-xl text-stone-700">Share a few details and your broker will confirm a visit time that suits you.</p>
          </div>
          <Link href="/contact?topic=visit" className={cn(buttonVariants({ variant: 'primary', size: 'lg' }))}>Book a site visit</Link>
        </div>
      </section>
    </>
  );
}
