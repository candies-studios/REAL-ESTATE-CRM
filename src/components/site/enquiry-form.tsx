'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { submitEnquiry, type EnquiryResult } from '@/app/actions/enquiry';
import { Button } from '@/components/ui/button';
import { Field, FormAlert, Input, Label, Select } from '@/components/ui/field';
import { NAVI_MUMBAI_LOCALITIES, PROPERTY_TYPES } from '@/config/brand';
import { CONSENT_TEXT, enquirySchema, TIMELINES, type EnquiryInput, type EnquiryKind } from '@/lib/enquiry';
import { cn } from '@/lib/utils';

export type FormVariant = 'property' | 'buyer' | 'tenant' | 'owner' | 'contact';

const CONFIGS = ['Studio', '1 BHK', '2 BHK', '3 BHK', '4 BHK', '5+ BHK'];

function ChipGroup({ legend, options, value, onChange, max = 10 }: {
  legend: string; options: readonly string[]; value: string[] | undefined; onChange: (v: string[]) => void; max?: number;
}) {
  const selected = value ?? [];
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-navy-900">{legend} <span className="font-normal text-stone-500">(optional)</span></legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => {
          const on = selected.includes(o);
          return (
            <button
              key={o}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? selected.filter((x) => x !== o) : selected.length < max ? [...selected, o] : selected)}
              className={cn(
                'min-h-10 rounded-full border px-3.5 text-sm font-medium transition-colors',
                on ? 'border-navy-900 bg-navy-900 text-ivory' : 'border-stone-300 bg-white text-navy-900 hover:border-navy-700',
              )}
            >
              {o}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function EnquiryForm({
  variant,
  propertyId,
  defaultLocality,
  defaultTopic,
  submitLabel = 'Send enquiry',
}: {
  variant: FormVariant;
  propertyId?: string;
  defaultLocality?: string;
  defaultTopic?: string;
  submitLabel?: string;
}) {
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<EnquiryResult>();
  const [ownerKind, setOwnerKind] = useState<'seller' | 'landlord'>(defaultTopic === 'landlord' ? 'landlord' : 'seller');

  const kind: EnquiryKind =
    variant === 'owner' ? ownerKind : variant === 'tenant' ? 'tenant' : variant === 'buyer' ? 'buyer' : variant === 'property' ? 'property' : 'contact';

  const { register, handleSubmit, control, setError, watch, formState: { errors } } = useForm<EnquiryInput>({
    resolver: zodResolver(enquirySchema),
    defaultValues: {
      kind,
      property_id: propertyId ?? '',
      preferred_contact: 'phone',
      localities: defaultLocality ? [defaultLocality] : [],
      wants_site_visit: defaultTopic === 'visit',
      transaction_type: variant === 'tenant' ? 'rent' : variant === 'buyer' ? 'sale' : undefined,
      marketing_consent: false,
    },
  });
  const wantsVisit = watch('wants_site_visit');

  const onSubmit = (values: EnquiryInput) =>
    start(async () => {
      setResult(undefined);
      const utm: Record<string, string> = {};
      ['utm_source', 'utm_medium', 'utm_campaign'].forEach((k) => { const v = params.get(k); if (v) utm[k] = v; });
      const res = await submitEnquiry({ ...values, kind }, { landingPage: window.location.pathname, utm });
      setResult(res);
      Object.entries(res.errors ?? {}).forEach(([k, v]) => setError(k as keyof EnquiryInput, { message: v }));
    });

  if (result?.ok) {
    return (
      <div role="status" className="rounded-2xl border border-success-700/20 bg-success-100 p-6">
        <CheckCircle2 className="h-7 w-7 text-success-700" aria-hidden="true" />
        <p className="mt-3 font-display text-2xl text-navy-900">Thank you, we’ve received your enquiry.</p>
        <p className="mt-2 text-stone-700">
          Your reference is <strong className="font-semibold">{result.reference}</strong>. A broker will contact you using your
          preferred method. An enquiry is not a booking or a reservation.
        </p>
      </div>
    );
  }

  const isBuyerLike = variant === 'buyer' || variant === 'tenant' || variant === 'property';
  const budgetLabel = variant === 'tenant' ? 'monthly rent' : 'budget';

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      {result?.message && <FormAlert>{result.message}</FormAlert>}

      {variant === 'owner' && (
        <fieldset>
          <legend className="text-sm font-semibold text-navy-900">I want to</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(['seller', 'landlord'] as const).map((k) => (
              <button key={k} type="button" aria-pressed={ownerKind === k} onClick={() => setOwnerKind(k)}
                className={cn('min-h-11 rounded-lg border text-sm font-semibold',
                  ownerKind === k ? 'border-navy-900 bg-navy-900 text-ivory' : 'border-stone-300 bg-white text-navy-900')}>
                {k === 'seller' ? 'Sell my property' : 'Rent out my property'}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" error={errors.full_name?.message}>
          {(a) => <Input {...a} autoComplete="name" {...register('full_name')} />}
        </Field>
        <Field label="Mobile number" error={errors.phone?.message}>
          {(a) => <Input {...a} type="tel" inputMode="tel" autoComplete="tel" placeholder="98XXXXXXXX" {...register('phone')} />}
        </Field>
        <Field label="Email" optional error={errors.email?.message}>
          {(a) => <Input {...a} type="email" autoComplete="email" {...register('email')} />}
        </Field>
        <Field label="Preferred contact" error={errors.preferred_contact?.message}>
          {(a) => (
            <Select {...a} {...register('preferred_contact')}>
              <option value="phone">Phone call</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
            </Select>
          )}
        </Field>
      </div>

      {isBuyerLike && variant !== 'property' && (
        <>
          <Controller control={control} name="localities" render={({ field }) => (
            <ChipGroup legend="Preferred localities" options={NAVI_MUMBAI_LOCALITIES} value={field.value} onChange={field.onChange} max={5} />
          )} />
          <Controller control={control} name="property_types" render={({ field }) => (
            <ChipGroup legend="Property type" options={[...PROPERTY_TYPES.residential, ...PROPERTY_TYPES.commercial]} value={field.value} onChange={field.onChange} />
          )} />
          <Controller control={control} name="configurations" render={({ field }) => (
            <ChipGroup legend="Configuration" options={CONFIGS} value={field.value} onChange={field.onChange} />
          )} />
        </>
      )}

      {isBuyerLike && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={`Minimum ${budgetLabel} (₹)`} optional error={errors.budget_min?.message}>
            {(a) => <Input {...a} inputMode="numeric" placeholder={variant === 'tenant' ? '20000' : '5000000'} {...register('budget_min')} />}
          </Field>
          <Field label={`Maximum ${budgetLabel} (₹)`} optional error={errors.budget_max?.message}>
            {(a) => <Input {...a} inputMode="numeric" placeholder={variant === 'tenant' ? '40000' : '9000000'} {...register('budget_max')} />}
          </Field>
          <Field label={variant === 'tenant' ? 'Move-in' : 'Timeline'} optional>
            {(a) => (
              <Select {...a} {...register('timeline_days')}>
                {TIMELINES.map((t) => <option key={t.label} value={t.value}>{t.label}</option>)}
              </Select>
            )}
          </Field>
        </div>
      )}

      {variant === 'tenant' && (
        <Field label="Furnishing" optional>
          {(a) => (
            <Select {...a} {...register('furnishing')}>
              <option value="">No preference</option>
              <option value="unfurnished">Unfurnished</option>
              <option value="semi_furnished">Semi-furnished</option>
              <option value="fully_furnished">Fully furnished</option>
            </Select>
          )}
        </Field>
      )}

      {variant === 'buyer' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ready or under construction" optional>
            {(a) => (
              <Select {...a} {...register('possession_pref')}>
                <option value="">Either</option>
                <option value="ready_to_move">Ready to move</option>
                <option value="under_construction">Under construction</option>
              </Select>
            )}
          </Field>
          <Field label="Need home-loan assistance?" optional hint="Only if you’d like help; it doesn’t affect your enquiry.">
            {(a) => (
              <Select {...a} {...register('needs_home_loan')}>
                <option value="">Prefer not to say</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </Select>
            )}
          </Field>
        </div>
      )}

      {variant === 'owner' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Locality" error={errors.locality?.message}>
            {(a) => (
              <Select {...a} {...register('locality')}>
                <option value="">Choose locality</option>
                {NAVI_MUMBAI_LOCALITIES.map((l) => <option key={l} value={l}>{l}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Property type" optional>
            {(a) => (
              <Select {...a} {...register('property_type_single')}>
                {[...PROPERTY_TYPES.residential, ...PROPERTY_TYPES.commercial].map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Configuration" optional>
            {(a) => (
              <Select {...a} {...register('configuration')}>
                <option value="">Not applicable</option>
                {CONFIGS.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Carpet area (sq ft)" optional error={errors.carpet_area?.message}>
            {(a) => <Input {...a} inputMode="numeric" {...register('carpet_area')} />}
          </Field>
          <Field label={ownerKind === 'landlord' ? 'Expected monthly rent (₹)' : 'Expected price (₹)'} optional error={errors.expected_price?.message}>
            {(a) => <Input {...a} inputMode="numeric" {...register('expected_price')} />}
          </Field>
        </div>
      )}

      {variant === 'property' && (
        <div className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-ivory p-4">
          <label className="flex items-center gap-3 text-sm font-semibold text-navy-900">
            <input type="checkbox" className="h-5 w-5 accent-navy-900" {...register('wants_site_visit')} />
            I’d like to schedule a site visit
          </label>
          {wantsVisit && (
            <Field label="Preferred date" optional hint="We’ll confirm a time that suits you.">
              {(a) => <Input {...a} type="date" min={new Date().toISOString().slice(0, 10)} {...register('preferred_visit_date')} />}
            </Field>
          )}
        </div>
      )}

      <Field label={variant === 'owner' ? 'About the property' : 'Message'} optional error={errors.message?.message}>
        {(a) => (
          <textarea {...a} rows={3} {...register('message')}
            className="w-full rounded-lg border border-stone-300 bg-white px-3.5 py-2.5 text-[15px] focus:border-navy-700 focus:outline-none focus:ring-2 focus:ring-gold-300" />
        )}
      </Field>

      {/* Honeypot: hidden from people, tempting for bots */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <Label htmlFor="company">Company</Label>
        <input id="company" tabIndex={-1} autoComplete="off" {...register('company')} />
      </div>

      <div className="flex flex-col gap-2.5">
        <label className="flex items-start gap-3 text-sm text-stone-700">
          <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-navy-900" aria-invalid={errors.consent ? true : undefined} {...register('consent')} />
          <span>{CONSENT_TEXT} See our <Link href="/legal/privacy" className="underline">privacy policy</Link>.</span>
        </label>
        {errors.consent && <p className="text-xs font-medium text-danger-700">{errors.consent.message}</p>}
        <label className="flex items-start gap-3 text-sm text-stone-700">
          <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-navy-900" {...register('marketing_consent')} />
          <span>Also send me new matching properties and updates (optional).</span>
        </label>
      </div>

      <Button type="submit" size="lg" disabled={pending}>{pending ? 'Sending…' : submitLabel}</Button>
    </form>
  );
}
