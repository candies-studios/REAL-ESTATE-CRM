'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { createOrganization } from '@/app/actions/organization';
import { Button } from '@/components/ui/button';
import { Field, FormAlert, Input } from '@/components/ui/field';
import { organizationSchema } from '@/lib/validation';

type Values = z.infer<typeof organizationSchema>;

export function OnboardingForm() {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string>();
  const { register, handleSubmit, formState: { errors } } = useForm<Values>({ resolver: zodResolver(organizationSchema) });

  const onSubmit = (values: Values) =>
    start(async () => {
      setMessage(undefined);
      const res = await createOrganization(values);
      if (res && !res.ok) setMessage(res.message ?? res.errors?.name);
    });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      {message && <FormAlert>{message}</FormAlert>}
      <Field label="Brokerage name" hint="Shown to your team. You can change it later." error={errors.name?.message}>
        {(a) => <Input {...a} autoComplete="organization" {...register('name')} />}
      </Field>
      <Button type="submit" size="lg" disabled={pending}>{pending ? 'Setting up…' : 'Create brokerage'}</Button>
    </form>
  );
}
