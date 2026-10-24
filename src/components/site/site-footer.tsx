import Link from 'next/link';
import { Logo } from '@/components/ui/card';
import { brand, NAVI_MUMBAI_LOCALITIES } from '@/config/brand';

export function SiteFooter() {
  const { phone, email, officeAddress, reraAgentNumber } = brand.contact;
  return (
    <footer className="bg-navy-950 text-stone-300">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo name={brand.name} light />
          <p className="mt-4 max-w-md text-sm leading-relaxed text-stone-300">{brand.description}</p>
          {reraAgentNumber && (
            <p className="mt-4 text-xs text-stone-300">MahaRERA Agent Registration: {reraAgentNumber}</p>
          )}
        </div>
        <div>
          <h2 className="font-sans text-xs font-semibold uppercase tracking-[0.18em] text-gold-300">Localities</h2>
          <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {NAVI_MUMBAI_LOCALITIES.slice(0, 8).map((l) => (
              <li key={l}>
                <Link href={`/properties?locality=${encodeURIComponent(l)}`} className="hover:text-ivory">{l}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="font-sans text-xs font-semibold uppercase tracking-[0.18em] text-gold-300">Contact</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {phone && <li><a href={`tel:${phone.replace(/\s/g, '')}`} className="hover:text-ivory">{phone}</a></li>}
            {email && <li><a href={`mailto:${email}`} className="hover:text-ivory">{email}</a></li>}
            {officeAddress && <li className="text-stone-300">{officeAddress}</li>}
            <li><Link href="/contact" className="hover:text-ivory">Contact page</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-3 px-4 py-5 text-xs text-stone-300 sm:px-6">
          <p>© {new Date().getFullYear()} {brand.name}. Prices and availability are indicative and subject to verification.</p>
          <p className="flex gap-4">
            <Link href="/legal/privacy" className="hover:text-ivory">Privacy</Link>
            <Link href="/legal/terms" className="hover:text-ivory">Terms</Link>
            <Link href="/legal/disclaimer" className="hover:text-ivory">Property disclaimer</Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
