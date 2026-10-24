'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { createLead } from '@/app/actions/leads';
import { Button } from '@/components/ui/button';
import { Field, FormAlert, Input, Select } from '@/components/ui/field';

type Values = {
  full_name: string; phone: string; email: string; intent: string; source: string;
  preferred_contact: string; assigned_to: string; note: string; consent: boolean;
};

export function NewLeadForm({ members }: { members: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message?: string; id?: string }>();
  const { register, handleSubmit, setError, formState: { errors } } = useForm<Values>({
    defaultValues: { intent: 'buyer', source: 'walk_in', preferred_contact: 'phone', consent: false },
  });

  const onSubmit = (v: Values) =>
    start(async () => {
      const res = await createLead(v);
      if (res) {
        setResult(res);
        Object.entries(res.errors ?? {}).forEach(([k, m]) => setError(k as keyof Values, { message: m }));
      }
    });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-5">
      {result?.message && (
        <FormAlert>
          {result.message} {result.id && <Link className="font-semibold underline" href={`/dashboard/leads/${result.id}`}>Open lead</Link>}
        </FormAlert>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" error={errors.full_name?.message}>{(a) => <Input {...a} {...register('full_name')} />}</Field>
        <Field label="Mobile number" error={errors.phone?.message}>{(a) => <Input {...a} type="tel" {...register('phone')} />}</Field>
        <Field label="Email" optional error={errors.email?.message}>{(a) => <Input {...a} type="email" {...register('email')} />}</Field>
        <Field label="Looking to">
          {(a) => (
            <Select {...a} {...register('intent')}>
              <option value="buyer">Buy</option><option value="tenant">Rent</option><option value="seller">Sell</option>
              <option value="landlord">Rent out</option><option value="investor">Invest</option>
            </Select>
          )}
        </Field>
        <Field label="Source">
          {(a) => (
            <Select {...a} {...register('source')}>
              <option value="walk_in">Walk-in</option><option value="manual">Phone call</option><option value="referral">Referral</option>
              <option value="portal">Property portal</option><option value="google">Google</option><option value="facebook">Facebook</option><option value="instagram">Instagram</option>
            </Select>
          )}
        </Field>
        <Field label="Preferred contact">
          {(a) => (
            <Select {...a} {...register('preferred_contact')}>
              <option value="phone">Phone</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option>
            </Select>
          )}
        </Field>
        {members.length > 0 && (
          <Field label="Assign to" optional hint="Leave empty to assign to yourself.">
            {(a) => (
              <Select {...a} {...register('assigned_to')}>
                <option value="">Me</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            )}
          </Field>
        )}
      </div>
      <Field label="Note" optional>
        {(a) => <textarea {...a} rows={3} {...register('note')} className="w-full rounded-lg border border-stone-300 px-3.5 py-2.5" />}
      </Field>
      <label className="flex items-start gap-3 text-sm text-stone-700">
        <input type="checkbox" className="mt-0.5 h-5 w-5 accent-navy-900" {...register('consent')} />
        The person agreed to be contacted about their requirement.
      </label>
      {errors.consent && <p className="-mt-3 text-xs font-medium text-danger-700">{errors.consent.message}</p>}
      <div><Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Create lead'}</Button></div>
    </form>
  );
}
