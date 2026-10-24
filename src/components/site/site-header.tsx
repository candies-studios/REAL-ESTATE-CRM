import Link from 'next/link';
import { Logo } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { brand } from '@/config/brand';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/properties', label: 'Properties' },
  { href: '/properties?category=residential', label: 'Residential' },
  { href: '/properties?category=commercial', label: 'Commercial' },
  { href: '/enquire/sell', label: 'Sell / Rent out' },
  { href: '/shortlist', label: 'Shortlist' },
  { href: '/contact', label: 'Contact' },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-ivory/95 backdrop-blur">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:rounded focus:bg-navy-900 focus:px-3 focus:py-2 focus:text-ivory">
        Skip to content
      </a>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-8 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" aria-label={`${brand.name} home`}>
          <Logo name={brand.name} />
        </Link>
        <nav aria-label="Main" className="order-3 flex w-full gap-5 overflow-x-auto text-sm font-medium text-stone-700 md:order-none md:w-auto">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="whitespace-nowrap py-2 hover:text-navy-900">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'hidden sm:inline-flex')}>
            Broker sign in
          </Link>
          <Link href="/enquire/buy" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
            Enquire now
          </Link>
        </div>
      </div>
    </header>
  );
}
