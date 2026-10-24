import { z } from 'zod';
import { normalizeIndianPhone } from './utils';

export const CONSENT_TEXT =
  'I agree to be contacted by phone, WhatsApp or email about this enquiry. I can ask to stop at any time.';

export const ENQUIRY_KINDS = ['property', 'buyer', 'tenant', 'seller', 'landlord', 'contact'] as const;
export type EnquiryKind = (typeof ENQUIRY_KINDS)[number];

export const TIMELINES = [
  { value: '30', label: 'Within 30 days' },
  { value: '90', label: '1–3 months' },
  { value: '180', label: '3–6 months' },
  { value: '365', label: 'More than 6 months' },
  { value: '', label: 'Just exploring' },
];

const optionalNumber = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : Number(String(v).replace(/[, ]/g, ''))),
  z.number().nonnegative('Enter a positive amount').max(10_000_000_000).optional(),
);

export const enquirySchema = z
  .object({
    kind: z.enum(ENQUIRY_KINDS),
    property_id: z.string().uuid().optional().or(z.literal('')),
    full_name: z.string().trim().min(2, 'Enter your full name').max(120),
    phone: z
      .string()
      .trim()
      .refine((v) => normalizeIndianPhone(v) !== null, 'Enter a valid 10-digit mobile number'),
    email: z.string().trim().toLowerCase().email('Enter a valid email address').optional().or(z.literal('')),
    preferred_contact: z.enum(['phone', 'whatsapp', 'email']).default('phone'),
    message: z.string().trim().max(2000, 'Keep the message under 2000 characters').optional(),
    wants_site_visit: z.boolean().optional(),
    preferred_visit_date: z.string().optional(),
    transaction_type: z.enum(['sale', 'rent', 'lease']).optional(),
    category: z.enum(['residential', 'commercial']).optional(),
    localities: z.array(z.string().max(60)).max(10).optional(),
    property_types: z.array(z.string().max(40)).max(10).optional(),
    configurations: z.array(z.string().max(20)).max(10).optional(),
    budget_min: optionalNumber,
    budget_max: optionalNumber,
    timeline_days: z.string().optional(),
    furnishing: z.enum(['unfurnished', 'semi_furnished', 'fully_furnished']).optional().or(z.literal('')),
    possession_pref: z.enum(['ready_to_move', 'under_construction']).optional().or(z.literal('')),
    needs_home_loan: z.enum(['yes', 'no', '']).optional(),
    // owners
    locality: z.string().max(60).optional(),
    property_type_single: z.string().max(40).optional(),
    configuration: z.string().max(20).optional(),
    expected_price: optionalNumber,
    carpet_area: optionalNumber,
    // consent + anti-spam
    consent: z.literal(true, { errorMap: () => ({ message: 'Please agree so we can respond to your enquiry' }) }),
    marketing_consent: z.boolean().optional(),
    company: z.string().max(0).optional(), // honeypot: must stay empty
  })
  .superRefine((v, ctx) => {
    if (v.preferred_contact === 'email' && !v.email) {
      ctx.addIssue({ code: 'custom', path: ['email'], message: 'Add an email address to be contacted by email' });
    }
    if (v.budget_min != null && v.budget_max != null && v.budget_min > v.budget_max) {
      ctx.addIssue({ code: 'custom', path: ['budget_max'], message: 'Maximum must be at least the minimum' });
    }
    if ((v.kind === 'seller' || v.kind === 'landlord') && !v.locality) {
      ctx.addIssue({ code: 'custom', path: ['locality'], message: 'Choose the property’s locality' });
    }
  });

export type EnquiryInput = z.input<typeof enquirySchema>;
export type EnquiryValues = z.output<typeof enquirySchema>;

/** Shapes validated form values into the submit_enquiry payload. */
export function toEnquiryPayload(v: EnquiryValues, extra: { org_id: string; landing_page?: string; ip_hash?: string; utm?: Record<string, string> }) {
  const channels = Array.from(new Set(['phone', v.preferred_contact, v.email ? 'email' : null].filter(Boolean)));
  return {
    org_id: extra.org_id,
    kind: v.kind,
    property_id: v.property_id || null,
    full_name: v.full_name,
    phone: v.phone,
    email: v.email || null,
    preferred_contact: v.preferred_contact,
    message: v.message || null,
    wants_site_visit: v.wants_site_visit ?? false,
    preferred_visit_date: v.preferred_visit_date || null,
    transaction_type: v.transaction_type ?? null,
    category: v.category ?? null,
    localities: v.localities ?? [],
    property_types: v.property_types ?? [],
    configurations: v.configurations ?? [],
    budget_min: v.budget_min ?? null,
    budget_max: v.budget_max ?? null,
    timeline_days: v.timeline_days ? Number(v.timeline_days) : null,
    furnishing: v.furnishing || null,
    possession_pref: v.possession_pref || null,
    needs_home_loan: v.needs_home_loan === 'yes' ? true : v.needs_home_loan === 'no' ? false : null,
    locality: v.locality || null,
    property_type_single: v.property_type_single || null,
    configuration: v.configuration || null,
    expected_price: v.expected_price ?? null,
    carpet_area: v.carpet_area ?? null,
    consent: true,
    consent_text: CONSENT_TEXT,
    marketing_consent: v.marketing_consent ?? false,
    channels,
    landing_page: extra.landing_page ?? null,
    ip_hash: extra.ip_hash ?? null,
    utm_source: extra.utm?.utm_source ?? null,
    utm_medium: extra.utm?.utm_medium ?? null,
    utm_campaign: extra.utm?.utm_campaign ?? null,
  };
}

export function friendlyEnquiryError(message?: string): string {
  const m = (message || '').toLowerCase();
  if (m.includes('too many')) return 'We’ve received several enquiries from you recently. Please try again in a little while, or call us.';
  if (m.includes('no longer available')) return 'Sorry, that property is no longer available. You can still share your requirement.';
  if (m.includes('mobile')) return 'Enter a valid 10-digit mobile number.';
  if (m.includes('consent')) return 'Please agree so we can respond to your enquiry.';
  if (m.includes('not accepted')) return 'Online enquiries are paused right now. Please call us instead.';
  return 'We couldn’t send your enquiry. Please try again, or contact us by phone.';
}
