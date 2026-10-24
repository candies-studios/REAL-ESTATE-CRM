'use server';

import { redirect } from 'next/navigation';
import { siteUrl } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';
import { fieldErrors, signInSchema, signUpSchema } from '@/lib/validation';

export type ActionResult = { ok: boolean; message?: string; errors?: Record<string, string> };

/** Only allow redirects to paths inside this app (prevents open redirects). */
function safeNext(next: unknown): string {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
}

export async function signIn(input: unknown, next?: string): Promise<ActionResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // Same message for wrong email or password, so accounts can't be probed.
    const unconfirmed = error.message.toLowerCase().includes('not confirmed');
    return {
      ok: false,
      message: unconfirmed
        ? 'Please confirm your email first. Check your inbox for the link.'
        : 'Email or password is incorrect.',
    };
  }
  redirect(safeNext(next));
}

export async function signUp(input: unknown): Promise<ActionResult> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${siteUrl}/auth/callback?next=/onboarding`,
    },
  });
  if (error) {
    const rateLimited = error.status === 429;
    return {
      ok: false,
      message: rateLimited ? 'Too many attempts. Please wait a minute and try again.' : 'Could not create the account. Please try again.',
    };
  }
  // If email confirmation is off in Supabase, a session exists already.
  if (data.session) redirect('/onboarding');
  return {
    ok: true,
    message: 'Check your email for a confirmation link. After confirming, you can set up your brokerage.',
  };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
