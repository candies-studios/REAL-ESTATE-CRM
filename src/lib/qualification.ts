/**
 * Qualification summary shown on each lead. Pure functions (unit tested).
 * Scores themselves are computed in the database (compute_lead_score) so the
 * same rules apply to every entry point; this file explains them and suggests
 * what to do next.
 */
export type Category = 'hot' | 'warm' | 'cold';

export type LeadForSummary = {
  intent: 'buyer' | 'seller' | 'landlord' | 'tenant' | 'investor';
  phone_normalized: string | null;
  email: string | null;
  category: Category | null;
  score_override: Category | null;
  first_contacted_at: string | null;
  do_not_contact: boolean;
  stage_key: string | null;
};

export type PrefsForSummary = {
  budget_min: number | null;
  budget_max: number | null;
  localities: string[];
  property_types: string[];
  configurations: string[];
  timeline_days: number | null;
  transaction_type: string | null;
} | null;

export function effectiveCategory(lead: Pick<LeadForSummary, 'category' | 'score_override'>): Category | null {
  return lead.score_override ?? lead.category;
}

/** Information worth asking for next. Only asks what's relevant to the intent. */
export function missingInformation(lead: LeadForSummary, prefs: PrefsForSummary): string[] {
  const missing: string[] = [];
  if (!lead.phone_normalized) missing.push('Mobile number');
  if (lead.intent === 'buyer' || lead.intent === 'tenant' || lead.intent === 'investor') {
    if (!prefs || prefs.budget_max == null) missing.push(lead.intent === 'tenant' ? 'Monthly rent budget' : 'Budget');
    if (!prefs || prefs.localities.length === 0) missing.push('Preferred localities');
    if (!prefs || prefs.property_types.length === 0) missing.push('Property type');
    if (!prefs || prefs.timeline_days == null) missing.push(lead.intent === 'tenant' ? 'Move-in date' : 'Purchase timeline');
    if (lead.intent !== 'investor' && (!prefs || prefs.configurations.length === 0)) missing.push('Configuration (BHK)');
  }
  return missing;
}

/** Recommended next action and how soon, based on stage, category and contact status. */
export function recommendedAction(lead: LeadForSummary, now = new Date()): { action: string; followUp: Date | null } {
  const add = (hours: number) => new Date(now.getTime() + hours * 3_600_000);
  const cat = effectiveCategory(lead);
  if (lead.do_not_contact) return { action: 'Do not contact — the person has opted out.', followUp: null };
  switch (lead.stage_key) {
    case 'won':
      return { action: 'Deal won. Record the brokerage amount if not done yet.', followUp: null };
    case 'lost':
      return { action: 'Closed as lost. No follow-up needed.', followUp: null };
    case 'nurture':
      return { action: 'Send occasional relevant listings (with consent) and check in.', followUp: add(24 * 30) };
    case 'negotiation':
    case 'booking':
      return { action: 'Keep negotiation moving: confirm terms and the next document or payment step.', followUp: add(48) };
    case 'visit_completed':
      return { action: 'Get feedback on the visit and propose the next step.', followUp: add(24) };
    case 'visit_scheduled':
      return { action: 'Confirm the visit time with the client a day before.', followUp: add(24) };
    case 'property_shared':
      return { action: 'Ask which shared properties they like and offer a site visit.', followUp: add(cat === 'hot' ? 24 : 72) };
    case 'qualified':
      return { action: 'Share the best matching properties.', followUp: add(cat === 'hot' ? 4 : 24) };
  }
  if (!lead.first_contacted_at) {
    return {
      action: cat === 'hot' ? 'Call now — high-intent enquiry not yet contacted.' : 'Make first contact and confirm the requirement.',
      followUp: add(cat === 'hot' ? 0.25 : cat === 'warm' ? 2 : 24),
    };
  }
  return { action: 'Complete the qualification and move to Qualified when ready.', followUp: add(cat === 'hot' ? 24 : 72) };
}

export const CATEGORY_LABEL: Record<Category, string> = { hot: 'Hot', warm: 'Warm', cold: 'Cold' };
export const INTENT_LABEL = { buyer: 'Buyer', seller: 'Seller', landlord: 'Landlord', tenant: 'Tenant', investor: 'Investor' } as const;
