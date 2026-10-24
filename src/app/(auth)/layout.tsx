import Link from 'next/link';
import { Logo } from '@/components/ui/card';
import { brand } from '@/config/brand';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden overflow-hidden bg-navy-900 p-12 text-ivory lg:flex lg:flex-col">
        <div aria-hidden="true" className="absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
        <Link href="/" className="relative"><Logo name={brand.name} light /></Link>
        <div className="relative mt-auto max-w-md">
          <p className="font-display text-4xl leading-tight text-ivory">Every enquiry captured. Every follow-up on time.</p>
          <p className="mt-4 text-stone-300">The broker workspace for leads, inventory, site visits and reminders.</p>
        </div>
      </aside>
      <main id="main" className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-10 inline-block lg:hidden"><Logo name={brand.name} /></Link>
          {children}
        </div>
      </main>
    </div>
  );
}
