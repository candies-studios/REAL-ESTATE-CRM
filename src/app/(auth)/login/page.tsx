import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginForm } from '@/components/auth/login-form';
import { FormAlert } from '@/components/ui/field';
import { isSupabaseConfigured } from '@/lib/supabase/env';

export const metadata: Metadata = { title: 'Broker sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <>
      <h1 className="text-3xl">Sign in</h1>
      <p className="mt-2 text-stone-600">Access your brokerage workspace.</p>
      <div className="mt-8 flex flex-col gap-5">
        {!isSupabaseConfigured && (
          <FormAlert tone="info">
            Supabase isn’t connected yet. Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to your environment (see README).
          </FormAlert>
        )}
        {sp.error === 'link' && <FormAlert>That link is invalid or has expired. Please sign in or request a new one.</FormAlert>}
        <LoginForm next={sp.next} />
      </div>
      <p className="mt-8 text-sm text-stone-600">
        New to the workspace? <Link href="/signup" className="font-semibold text-navy-800 underline">Create an account</Link>
      </p>
    </>
  );
}
