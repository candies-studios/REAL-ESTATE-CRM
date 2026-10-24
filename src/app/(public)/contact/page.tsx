import { Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import type { Metadata } from 'next';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { brand, NAVI_MUMBAI_LOCALITIES } from '@/config/brand';

export const metadata: Metadata = { title: 'Contact', description: `Contact ${brand.name} about buying, selling or renting in Navi Mumbai.` };

export default function ContactPage() {
  const { phone, email, whatsapp, officeAddress } = brand.contact;
  const hasContact = Boolean(phone || email || whatsapp || officeAddress);
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 md:py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-600">Contact</p>
      <h1 className="mt-2 text-4xl">Talk to a broker</h1>
      <p className="mt-3 max-w-2xl text-lg text-stone-600">
        For buying, selling, renting or a site visit, reach us directly. Online enquiry forms with requirement matching are being added next.
      </p>

      <div className="mt-10 grid gap-6 md:grid-cols-[1.2fr_1fr]">
        <Card className="p-7">
          <h2 className="text-2xl">Reach us</h2>
          {hasContact ? (
            <ul className="mt-5 space-y-4">
              {phone && (
                <li className="flex items-center gap-3">
                  <Phone className="h-5 w-5 text-gold-600" aria-hidden="true" />
                  <a className="font-semibold text-navy-900 hover:underline" href={`tel:${phone.replace(/\s/g, '')}`}>{phone}</a>
                </li>
              )}
              {email && (
                <li className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-gold-600" aria-hidden="true" />
                  <a className="font-semibold text-navy-900 hover:underline" href={`mailto:${email}`}>{email}</a>
                </li>
              )}
              {officeAddress && (
                <li className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-5 w-5 text-gold-600" aria-hidden="true" />
                  <span>{officeAddress}</span>
                </li>
              )}
              {whatsapp && (
                <li>
                  <a className={buttonVariants({ variant: 'primary' })} href={`https://wa.me/${whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="h-4 w-4" aria-hidden="true" /> Message on WhatsApp
                  </a>
                </li>
              )}
            </ul>
          ) : (
            <p className="mt-4 text-stone-600">Contact details will appear here once the brokerage adds them.</p>
          )}
        </Card>
        <Card className="p-7">
          <h2 className="text-2xl">Areas we cover</h2>
          <p className="mt-3 text-stone-600">Across {brand.primaryCity}, including:</p>
          <p className="mt-3 text-sm leading-7 text-stone-700">{NAVI_MUMBAI_LOCALITIES.join(' · ')}</p>
        </Card>
      </div>
    </div>
  );
}
