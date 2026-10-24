import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { Logo } from '@/components/ui/card';
import { brand } from '@/config/brand';

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-svh flex-col items-center justify-center gap-6 px-4 text-center">
      <Logo name={brand.name} />
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold-600">404</p>
      <h1 className="text-3xl sm:text-4xl">This page could not be found.</h1>
      <p className="max-w-md text-stone-600">It may have moved, or you may not have access to it.</p>
      <div className="flex gap-3">
        <Link href="/" className={buttonVariants({ variant: 'outline' })}>Home</Link>
        <Link href="/dashboard" className={buttonVariants({ variant: 'primary' })}>Workspace</Link>
      </div>
    </main>
  );
}
