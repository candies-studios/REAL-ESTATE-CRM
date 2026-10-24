import { describe, expect, it } from 'vitest';
import { enquirySchema, toEnquiryPayload } from '@/lib/enquiry';
import { effectiveCategory, missingInformation, recommendedAction, type LeadForSummary } from '@/lib/qualification';
import { sanitizeSearch } from '@/lib/crm-search';

const base: LeadForSummary = {
  intent: 'buyer', phone_normalized: '+919820011111', email: null, category: 'warm', score_override: null,
  first_contacted_at: null, do_not_contact: false, stage_key: 'new_enquiry',
};
const fullPrefs = {
  budget_min: 5_000_000, budget_max: 9_000_000, localities: ['Kharghar'], property_types: ['Apartment'],
  configurations: ['2 BHK'], timeline_days: 30, transaction_type: 'sale',
};

describe('qualification summary', () => {
  it('override wins over computed category', () => {
    expect(effectiveCategory({ category: 'cold', score_override: 'hot' })).toBe('hot');
    expect(effectiveCategory({ category: 'warm', score_override: null })).toBe('warm');
  });

  it('lists missing buyer information', () => {
    expect(missingInformation(base, null)).toEqual(['Budget', 'Preferred localities', 'Property type', 'Purchase timeline', 'Configuration (BHK)']);
    expect(missingInformation(base, fullPrefs)).toEqual([]);
  });

  it('only asks relevant questions for sellers and tenants', () => {
    expect(missingInformation({ ...base, intent: 'seller' }, null)).toEqual([]);
    expect(missingInformation({ ...base, intent: 'tenant' }, null)).toContain('Monthly rent budget');
    expect(missingInformation({ ...base, intent: 'tenant' }, null)).toContain('Move-in date');
  });

  it('recommends calling hot uncontacted leads within 15 minutes', () => {
    const now = new Date('2026-10-24T10:00:00Z');
    const r = recommendedAction({ ...base, category: 'hot' }, now);
    expect(r.action).toMatch(/Call now/);
    expect(r.followUp?.toISOString()).toBe('2026-10-24T10:15:00.000Z');
  });

  it('stops follow-ups for opted-out, won and lost leads', () => {
    expect(recommendedAction({ ...base, do_not_contact: true }).followUp).toBeNull();
    expect(recommendedAction({ ...base, stage_key: 'won' }).followUp).toBeNull();
    expect(recommendedAction({ ...base, stage_key: 'lost' }).followUp).toBeNull();
  });
});

describe('enquiry validation', () => {
  const valid = { kind: 'buyer', full_name: 'Test Buyer', phone: '98200 11111', consent: true };

  it('accepts a minimal valid enquiry', () => {
    expect(enquirySchema.safeParse(valid).success).toBe(true);
  });

  it('requires consent, a valid mobile and an email when email is preferred', () => {
    expect(enquirySchema.safeParse({ ...valid, consent: false }).success).toBe(false);
    expect(enquirySchema.safeParse({ ...valid, phone: '12345' }).success).toBe(false);
    expect(enquirySchema.safeParse({ ...valid, preferred_contact: 'email' }).success).toBe(false);
  });

  it('rejects a filled honeypot and an inverted budget', () => {
    expect(enquirySchema.safeParse({ ...valid, company: 'Bot Inc' }).success).toBe(false);
    expect(enquirySchema.safeParse({ ...valid, budget_min: '9000000', budget_max: '5000000' }).success).toBe(false);
  });

  it('requires a locality for owner submissions', () => {
    expect(enquirySchema.safeParse({ ...valid, kind: 'seller' }).success).toBe(false);
    expect(enquirySchema.safeParse({ ...valid, kind: 'seller', locality: 'Nerul' }).success).toBe(true);
  });

  it('builds the database payload with consent wording and channels', () => {
    const v = enquirySchema.parse({ ...valid, email: 'a@example.test', preferred_contact: 'whatsapp', budget_max: '9,000,000', timeline_days: '30' });
    const p = toEnquiryPayload(v, { org_id: '00000000-0000-0000-0000-000000000001' });
    expect(p.budget_max).toBe(9_000_000);
    expect(p.timeline_days).toBe(30);
    expect(p.channels).toEqual(['phone', 'whatsapp', 'email']);
    expect(p.consent_text).toMatch(/agree to be contacted/);
  });
});

describe('search sanitising', () => {
  it('strips PostgREST filter syntax', () => {
    expect(sanitizeSearch('a,b(c)"d\'e*f%g')).toBe('a b c  d e f g');
    expect(sanitizeSearch('x'.repeat(100))).toHaveLength(60);
  });
});
