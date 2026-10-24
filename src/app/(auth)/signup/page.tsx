import type { Metadata } from 'next';
import Link from 'next/link';
import { SignupForm } from '@/components/auth/signup-form';

export const metadata: Metadata = { title: 'Create account' };

export default function SignupPage() {
  return (
    <>
      <h1 className="text-3xl">Create your account</h1>
      <p className="mt-2 text-stone-600">
        Owners set up their brokerage after signing up. Brokers sign up here, then an owner or admin adds them to the team.
      </p>
      <div className="mt-8"><SignupForm /></div>
      <p className="mt-8 text-sm text-stone-600">
        Already have an account? <Link href="/login" className="font-semibold text-navy-800 underline">Sign in</Link>
      </p>
    </>
  );
}
