'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { signIn } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Field, FormAlert, Input } from '@/components/ui/field';
import { signInSchema } from '@/lib/validation';

type Values = z.infer<typeof signInSchema>;

export function LoginForm({ next }: { next?: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string>();
  const { register, handleSubmit, setError, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(signInSchema),
  });

  const onSubmit = (values: Values) =>
    start(async () => {
      setMessage(undefined);
      const res = await signIn(values, next);
      if (res && !res.ok) {
        setMessage(res.message);
        Object.entries(res.errors ?? {}).forEach(([k, v]) => setError(k as keyof Values, { message: v }));
      }
    });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      {message && <FormAlert>{message}</FormAlert>}
      <Field label="Email" error={errors.email?.message}>
        {(a) => <Input {...a} type="email" autoComplete="email" {...register('email')} />}
      </Field>
      <Field label="Password" error={errors.password?.message}>
        {(a) => <Input {...a} type="password" autoComplete="current-password" {...register('password')} />}
      </Field>
      <Button type="submit" size="lg" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</Button>
    </form>
  );
}
