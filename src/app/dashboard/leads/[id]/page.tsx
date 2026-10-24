import { ArrowLeft, Mail, MessageCircle, Phone } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fmtDate, fmtDateTime, relative, CATEGORY_TONE } from '@/components/dashboard/format';
import {
  ActivityForm, AssignControl, ContactEditor, DeleteLeadButton, DuplicatesPanel, MatchRecalc, MatchShare, PreferencesEditor,
  QualificationControls, StageControl, TaskList, VisitList, VisitScheduler,
} from '@/components/dashboard/lead-panels';
import { Badge, Card } from '@/components/ui/card';
import { requireMembership } from '@/lib/auth';
import { getMembers, getStages } from '@/lib/crm';
import { can } from '@/lib/permissions';
import { CATEGORY_LABEL, effectiveCategory, INTENT_LABEL, missingInformation, recommendedAction } from '@/lib/qualification';
import { createClient } from '@/lib/supabase/server';
import { formatINR } from '@/lib/utils';
import { whatsappLink } from '@/lib/notify/whatsapp';

export const dynamic = 'force-dynamic';

const ACTIVITY_LABEL: Record<string, string> = {
  enquiry: 'Website enquiry', repeat_enquiry: 'Repeat enquiry', note: 'Note', call: 'Call', whatsapp: 'WhatsApp',
  email: 'Email', meeting: 'Meeting', stage_change: 'Stage changed', assignment: 'Reassigned', merge: 'Merged',
  property_shared: 'Property shared', visit_scheduled: 'Visit scheduled', visit_attended: 'Visit attended',
  visit_cancelled: 'Visit cancelled', visit_no_show: 'No-show', visit_confirmed: 'Visit confirmed', visit_rescheduled: 'Visit rescheduled',
};

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-sans text-base font-semibold text-navy-900">{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { user, membership } = await requireMembership();
  const supabase = await createClient();

  const { data: lead } = await supabase.from('leads').select('*').eq('id', id).eq('org_id', membership.orgId).maybeSingle();
  if (!lead) notFound();

  const [stages, members, prefsRes, matchesRes, tasksRes, visitsRes, enquiriesRes, consentRes, activitiesRes, dupRes, propsRes] = await Promise.all([
    getStages(membership.orgId),
    getMembers(membership.orgId),
    supabase.from('lead_preferences').select('*').eq('lead_id', id).maybeSingle(),
    supabase.from('lead_property_matches').select('property_id, score, reasons, properties ( id, title, ref_code, price, locality, transaction_type, status, last_verified_at )')
      .eq('lead_id', id).order('score', { ascending: false }).limit(10),
    supabase.from('tasks').select('id, title, type, due_at, status, assigned_to, escalated_at').eq('lead_id', id)
      .in('status', ['open', 'snoozed']).order('due_at'),
    supabase.from('site_visits').select('id, starts_at, duration_min, status, meeting_point, buyer_confirmed, outcome_notes, broker_id, properties ( title )')
      .eq('lead_id', id).order('starts_at', { ascending: false }),
    supabase.from('property_enquiries').select('id, kind, message, wants_site_visit, preferred_visit_date, created_at, properties ( id, title )')
      .eq('lead_id', id).order('created_at', { ascending: false }),
    supabase.from('consent_records').select('purpose, channels, granted, consent_text, created_at').eq('lead_id', id).order('created_at', { ascending: false }),
    supabase.from('lead_activities').select('id, type, body, actor_id, created_at').eq('lead_id', id).order('created_at', { ascending: false }).limit(100),
    supabase.rpc('find_duplicate_leads', { p_lead: id }),
    supabase.from('properties').select('id, title, ref_code').eq('org_id', membership.orgId).in('status', ['available', 'reserved']).order('title').limit(200),
  ]);

  const prefs = prefsRes.data;
  const stage = stages.find((s) => s.id === lead.stage_id) ?? null;
  const nameOf = new Map(members.map((m) => [m.user_id, m.name]));
  const canEdit = membership.role === 'owner' || membership.role === 'admin' || (membership.role === 'broker' && lead.assigned_to === user.id);
  const isManager = can(membership.role, 'leads.edit_all');

  const summaryLead = {
    intent: lead.intent, phone_normalized: lead.phone_normalized, email: lead.email, category: lead.category,
    score_override: lead.score_override, first_contacted_at: lead.first_contacted_at, do_not_contact: lead.do_not_contact,
    stage_key: stage?.key ?? null,
  };
  const summaryPrefs = prefs ? {
    budget_min: prefs.budget_min, budget_max: prefs.budget_max, localities: prefs.localities, property_types: prefs.property_types,
    configurations: prefs.configurations, timeline_days: prefs.timeline_days, transaction_type: prefs.transaction_type,
  } : null;
  const cat = effectiveCategory(summaryLead);
  const missing = missingInformation(summaryLead, summaryPrefs);
  const next = recommendedAction(summaryLead);
  const breakdown = (lead.score_breakdown ?? []) as { rule: string; points: number; reason: string }[];
  const consents = consentRes.data ?? [];
  const whatsappOk = consents.some((c) => c.granted && (c.channels as string[]).includes('whatsapp'));
  const phone = lead.phone_normalized as string | null;

  return (
    <>
      <Link href="/dashboard/leads" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-stone-600 hover:text-navy-900">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Leads
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl">{lead.full_name}</h1>
            {cat && <Badge tone={CATEGORY_TONE[cat]}>{CATEGORY_LABEL[cat]}{lead.score_override ? ' (override)' : ''} · {lead.score ?? 0}</Badge>}
            <Badge tone="neutral">{INTENT_LABEL[lead.intent as keyof typeof INTENT_LABEL]}</Badge>
            {lead.duplicate_of && <Badge tone="warning">Merged duplicate</Badge>}
            {lead.do_not_contact && <Badge tone="danger">Do not contact</Badge>}
          </div>
          <p className="mt-1 text-sm text-stone-600">
            {stage?.name ?? '—'} · {lead.assigned_to ? `Assigned to ${nameOf.get(lead.assigned_to) ?? 'a former member'}` : 'Unassigned'} ·
            Created {fmtDate(lead.created_at)} · Source {lead.source ?? '—'}
          </p>
        </div>
        {!lead.do_not_contact && (
          <div className="flex flex-wrap gap-2">
            {phone && <a href={`tel:${phone}`} className="inline-flex h-10 items-center gap-2 rounded-full bg-navy-900 px-4 text-sm font-semibold text-ivory"><Phone className="h-4 w-4" aria-hidden="true" /> Call</a>}
            {phone && (
              <a href={whatsappLink(phone, `Hello ${lead.full_name.split(' ')[0]}, this is about your property enquiry.`)} target="_blank" rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-full border border-stone-300 bg-white px-4 text-sm font-semibold text-navy-900"
                title={whatsappOk ? undefined : 'No WhatsApp consent recorded'}>
                <MessageCircle className="h-4 w-4" aria-hidden="true" /> WhatsApp{!whatsappOk && ' (no consent recorded)'}
              </a>
            )}
            {lead.email && <a href={`mailto:${lead.email}`} className="inline-flex h-10 items-center gap-2 rounded-full border border-stone-300 bg-white px-4 text-sm font-semibold text-navy-900"><Mail className="h-4 w-4" aria-hidden="true" /> Email</a>}
          </div>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
        <div className="flex flex-col gap-5">
          <Section title="Qualification summary">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-navy-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-stone-600">Recommended next action</p>
                <p className="mt-1 font-medium text-navy-900">{next.action}</p>
                {next.followUp && <p className="mt-1 text-sm text-stone-600">Suggested follow-up: {fmtDateTime(next.followUp.toISOString())}</p>}
              </div>
              <div className="rounded-xl bg-ivory-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-stone-600">Missing information</p>
                {missing.length ? <p className="mt-1 text-sm text-stone-800">{missing.join(' · ')}</p> : <p className="mt-1 text-sm text-success-700">Nothing important missing.</p>}
              </div>
            </div>
            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <div><dt className="inline text-stone-600">Budget: </dt><dd className="inline font-medium">{prefs?.budget_max ? `${prefs.budget_min ? formatINR(prefs.budget_min) : '…'} – ${formatINR(prefs.budget_max)}` : '—'}</dd></div>
              <div><dt className="inline text-stone-600">Localities: </dt><dd className="inline font-medium">{prefs?.localities?.join(', ') || '—'}</dd></div>
              <div><dt className="inline text-stone-600">Next follow-up: </dt><dd className="inline font-medium">{relative(lead.next_follow_up_at)}</dd></div>
              <div><dt className="inline text-stone-600">Last contact: </dt><dd className="inline font-medium">{relative(lead.last_contacted_at)}</dd></div>
            </dl>
            <details className="mt-4 rounded-lg border border-stone-200 p-3 text-sm">
              <summary className="cursor-pointer font-semibold text-navy-900">Why this score ({lead.score ?? 0}/100)</summary>
              <ul className="mt-3 space-y-1.5">
                {breakdown.map((b) => (
                  <li key={b.rule} className="flex justify-between gap-4">
                    <span className="text-stone-700">{b.reason}</span>
                    <span className={b.points > 0 ? 'font-semibold text-success-700' : 'text-stone-500'}>+{b.points}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-stone-500">These are your brokerage’s configurable rules, not a prediction about the person. Personal characteristics are never used.</p>
              {lead.score_override && <p className="mt-2 text-xs text-stone-700">Override reason: {lead.override_reason}</p>}
            </details>
            {canEdit && <QualificationControls leadId={id} canOverride={isManager} override={lead.score_override} />}
          </Section>

          <Section title="Matching properties" action={canEdit ? <MatchRecalc leadId={id} /> : undefined}>
            {(matchesRes.data ?? []).length === 0 ? (
              <p className="text-sm text-stone-600">No matches yet. Add requirements (budget, localities, type) or available inventory.</p>
            ) : (
              <ul className="divide-y divide-stone-200">
                {(matchesRes.data ?? []).map((m) => {
                  const p = (Array.isArray(m.properties) ? m.properties[0] : m.properties) as { id: string; title: string; ref_code: string; price: number | null; locality: string } | null;
                  if (!p) return null;
                  return (
                    <li key={m.property_id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                      <div>
                        <Link href={`/dashboard/properties/${p.id}`} className="font-semibold text-navy-900 hover:underline">{p.title}</Link>
                        <p className="text-xs text-stone-600">{p.ref_code} · {p.locality} · {formatINR(p.price)}</p>
                        <p className="mt-1 text-xs text-stone-700">{(m.reasons as string[]).join(' · ')}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={m.score >= 75 ? 'success' : m.score >= 55 ? 'gold' : 'neutral'}>{m.score}% match</Badge>
                        {canEdit && <MatchShare leadId={id} propertyId={p.id} title={p.title} />}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <Section title="Requirements">
            <PreferencesEditor leadId={id} canEdit={canEdit} prefs={prefs} />
          </Section>

          <Section title="Activity">
            {canEdit && <ActivityForm leadId={id} />}
            <ol className="mt-4 space-y-3">
              {(activitiesRes.data ?? []).map((a) => (
                <li key={a.id} className="border-l-2 border-stone-200 pl-3">
                  <p className="text-xs text-stone-500">{fmtDateTime(a.created_at)} · {a.actor_id ? nameOf.get(a.actor_id) ?? 'Team member' : 'System'}</p>
                  <p className="text-sm"><span className="font-semibold text-navy-900">{ACTIVITY_LABEL[a.type] ?? a.type}</span>{a.body ? ` — ${a.body}` : ''}</p>
                </li>
              ))}
            </ol>
          </Section>
        </div>

        <div className="flex flex-col gap-5">
          <Section title="Pipeline">
            <StageControl
              leadId={id}
              canEdit={canEdit}
              currentStageId={lead.stage_id}
              stages={stages.filter((s) => s.is_active).map((s) => ({ id: s.id, name: s.name, isWon: s.is_won, isLost: s.is_lost }))}
              deal={{ dealValue: lead.deal_value, brokerageAmount: lead.brokerage_amount, expectedBrokerage: lead.expected_brokerage }}
              lostReason={lead.lost_reason}
            />
            {isManager && (
              <div className="mt-4 border-t border-stone-200 pt-4">
                <AssignControl leadId={id} current={lead.assigned_to} members={members.filter((m) => m.role !== 'viewer').map((m) => ({ id: m.user_id, name: m.name }))} />
              </div>
            )}
          </Section>

          <Section title="Tasks">
            <TaskList
              leadId={id}
              tasks={(tasksRes.data ?? []).map((t) => ({ ...t, assignee: t.assigned_to ? nameOf.get(t.assigned_to) ?? null : null }))}
              canAdd={membership.role !== 'viewer' && canEdit}
              userId={user.id}
              isManager={isManager}
            />
          </Section>

          <Section title="Site visits">
            <VisitList
              visits={(visitsRes.data ?? []).map((v) => ({
                ...v,
                property: ((Array.isArray(v.properties) ? v.properties[0] : v.properties) as { title: string } | null)?.title ?? null,
                broker: v.broker_id ? nameOf.get(v.broker_id) ?? null : null,
              }))}
              canEdit={canEdit || membership.role === 'broker'}
            />
            {canEdit && (
              <VisitScheduler
                leadId={id}
                properties={(propsRes.data ?? []).map((p) => ({ id: p.id, name: `${p.ref_code} · ${p.title}` }))}
                brokers={isManager ? members.filter((m) => m.role !== 'viewer').map((m) => ({ id: m.user_id, name: m.name })) : []}
                defaultBroker={lead.assigned_to ?? user.id}
              />
            )}
          </Section>

          <Section title="Contact details">
            <ContactEditor lead={{ id, full_name: lead.full_name, phone: lead.phone ?? '', email: lead.email ?? '', preferred_contact: lead.preferred_contact ?? 'phone', do_not_contact: lead.do_not_contact }} canEdit={canEdit} />
          </Section>

          <Section title="Enquiries">
            <ul className="space-y-3 text-sm">
              {(enquiriesRes.data ?? []).length === 0 && <li className="text-stone-600">No enquiries recorded.</li>}
              {(enquiriesRes.data ?? []).map((e) => {
                const p = (Array.isArray(e.properties) ? e.properties[0] : e.properties) as { id: string; title: string } | null;
                return (
                  <li key={e.id} className="rounded-lg bg-stone-100 p-3">
                    <p className="text-xs text-stone-500">{fmtDateTime(e.created_at)} · {e.kind}{e.wants_site_visit ? ' · wants a site visit' : ''}{e.preferred_visit_date ? ` on ${fmtDate(e.preferred_visit_date)}` : ''}</p>
                    {p && <p className="font-medium text-navy-900">{p.title}</p>}
                    {e.message && <p className="mt-1 text-stone-700">{e.message}</p>}
                  </li>
                );
              })}
            </ul>
          </Section>

          <Section title="Consent">
            <ul className="space-y-2 text-sm">
              {consents.length === 0 && <li className="text-stone-600">No consent recorded. Confirm before contacting.</li>}
              {consents.map((c, i) => (
                <li key={i}>
                  <Badge tone={c.granted ? 'success' : 'neutral'}>{c.granted ? 'Granted' : 'Declined'}</Badge>{' '}
                  <span className="font-medium">{c.purpose.replace('_', ' ')}</span> · {(c.channels as string[]).join(', ')} · {fmtDate(c.created_at)}
                </li>
              ))}
            </ul>
          </Section>

          {isManager && (dupRes.data ?? []).length > 0 && !lead.duplicate_of && (
            <Section title="Possible duplicates">
              <DuplicatesPanel keepId={id} duplicates={(dupRes.data ?? []) as { id: string; full_name: string; phone: string | null; email: string | null; created_at: string; stage_name: string | null }[]} />
            </Section>
          )}

          {isManager && <DeleteLeadButton leadId={id} />}
        </div>
      </div>
    </>
  );
}
