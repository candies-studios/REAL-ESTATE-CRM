'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { signUp } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Field, FormAlert, Input } from '@/components/ui/field';
import { signUpSchema } from '@/lib/validation';

type Values = z.infer<typeof signUpSchema>;

export function SignupForm() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message?: string }>();
  const { register, handleSubmit, setError, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(signUpSchema),
  });

  const onSubmit = (values: Values) =>
    start(async () => {
      setResult(undefined);
      const res = await signUp(values);
      if (res) {
        setResult(res);
        Object.entries(res.errors ?? {}).forEach(([k, v]) => setError(k as keyof Values, { message: v }));
      }
    });

  if (result?.ok) return <FormAlert tone="success">{result.message}</FormAlert>;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      {result?.message && <FormAlert>{result.message}</FormAlert>}
      <Field label="Full name" error={errors.fullName?.message}>
        {(a) => <Input {...a} autoComplete="name" {...register('fullName')} />}
      </Field>
      <Field label="Work email" error={errors.email?.message}>
        {(a) => <Input {...a} type="email" autoComplete="email" {...register('email')} />}
      </Field>
      <Field label="Password" hint="At least 10 characters, with a letter and a number." error={errors.password?.message}>
        {(a) => <Input {...a} type="password" autoComplete="new-password" {...register('password')} />}
      </Field>
      <Button type="submit" size="lg" disabled={pending}>{pending ? 'Creating account…' : 'Create account'}</Button>
    </form>
  );
}
