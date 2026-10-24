import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { signOut } from '@/app/actions/auth';
import { OnboardingForm } from '@/components/auth/onboarding-form';
import { getMemberships, getUser } from '@/lib/auth';

export const metadata: Metadata = { title: 'Set up your brokerage' };

export default async function OnboardingPage() {
  const user = await getUser();
  if (!user) redirect('/login');
  if ((await getMemberships()).length > 0) redirect('/dashboard');

  return (
    <>
      <h1 className="text-3xl">Set up your brokerage</h1>
      <p className="mt-2 text-stone-600">
        You’ll be the owner. Your pipeline starts with 12 standard stages, which admins can adjust later.
      </p>
      <div className="mt-8"><OnboardingForm /></div>
      <div className="mt-10 rounded-xl border border-stone-200 bg-white p-5 text-sm text-stone-600">
        <p className="font-semibold text-navy-900">Joining an existing brokerage?</p>
        <p className="mt-1">
          Ask its owner or admin to add <strong className="text-stone-900">{user.email}</strong> from their Team page,
          then sign in again.
        </p>
        <form action={signOut} className="mt-3">
          <button className="font-semibold text-navy-800 underline" type="submit">Sign out</button>
        </form>
      </div>
    </>
  );
}
