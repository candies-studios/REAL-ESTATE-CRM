'use client';

import { useState, useTransition } from 'react';
import {
  assignLead, deleteLead, logActivity, markPropertyShared, mergeLeads, moveLeadStage, overrideScore,
  recalculateLead, updateLeadContact, updatePreferences,
} from '@/app/actions/leads';
import type { ActionResult } from '@/app/actions/auth';
import { createTask, scheduleVisit, updateTask, updateVisit } from '@/app/actions/work';
import { Badge } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FormAlert, Input, Select } from '@/components/ui/field';
import { NAVI_MUMBAI_LOCALITIES } from '@/config/brand';
import { fmtDateTime, relative, toLocalInput } from './format';

/** Runs a server action and keeps its pending state and result message. */
export function useAction() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult>();
  const run = (fn: () => Promise<ActionResult | void>, after?: (r: ActionResult) => void) =>
    start(async () => {
      const r = (await fn()) ?? { ok: true };
      setResult(r);
      after?.(r);
    });
  return { pending, result, run, setResult };
}

function Msg({ r }: { r?: ActionResult }) {
  if (!r?.message && !r?.errors) return null;
  const text = r.message ?? Object.values(r.errors ?? {})[0];
  return <div className="mt-3"><FormAlert tone={r.ok ? 'success' : 'error'}>{text}</FormAlert></div>;
}

const lbl = 'mb-1 block text-xs font-semibold uppercase tracking-wider text-stone-600';
const ta = 'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-navy-700 focus:outline-none focus:ring-2 focus:ring-gold-300';

// ---------------------------------------------------------------- stage
export function StageControl({ leadId, canEdit, currentStageId, stages, deal, lostReason }: {
  leadId: string; canEdit: boolean; currentStageId: string | null;
  stages: { id: string; name: string; isWon: boolean; isLost: boolean }[];
  deal: { dealValue: number | null; brokerageAmount: number | null; expectedBrokerage: number | null };
  lostReason: string | null;
}) {
  const a = useAction();
  const [stageId, setStageId] = useState(currentStageId ?? '');
  const [reason, setReason] = useState(lostReason ?? '');
  const [dealValue, setDealValue] = useState(deal.dealValue?.toString() ?? '');
  const [brokerage, setBrokerage] = useState(deal.brokerageAmount?.toString() ?? '');
  const [expected, setExpected] = useState(deal.expectedBrokerage?.toString() ?? '');
  const target = stages.find((s) => s.id === stageId);

  if (!canEdit) return <p className="text-sm">{stages.find((s) => s.id === currentStageId)?.name ?? '—'}</p>;
  return (
    <div className="grid gap-3">
      <div>
        <label className={lbl} htmlFor="stage-select">Stage</label>
        <Select id="stage-select" value={stageId} onChange={(e) => setStageId(e.target.value)}>
          {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </div>
      {target?.isLost && (
        <div>
          <label className={lbl} htmlFor="lost-reason">Lost reason (required)</label>
          <Input id="lost-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Bought elsewhere, budget changed" />
        </div>
      )}
      {target?.isWon && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={lbl} htmlFor="deal-v">Deal value (₹)</label><Input id="deal-v" inputMode="numeric" value={dealValue} onChange={(e) => setDealValue(e.target.value)} /></div>
          <div><label className={lbl} htmlFor="brk-v">Brokerage received (₹)</label><Input id="brk-v" inputMode="numeric" value={brokerage} onChange={(e) => setBrokerage(e.target.value)} /></div>
        </div>
      )}
      {!target?.isWon && !target?.isLost && (
        <div><label className={lbl} htmlFor="exp-v">Expected brokerage (₹, optional)</label><Input id="exp-v" inputMode="numeric" value={expected} onChange={(e) => setExpected(e.target.value)} /></div>
      )}
      <Button size="sm" disabled={a.pending} onClick={() => a.run(() => moveLeadStage({
        leadId, stageId,
        lostReason: target?.isLost ? reason : undefined,
        dealValue: target?.isWon ? dealValue : undefined,
        brokerageAmount: target?.isWon ? brokerage : undefined,
        expectedBrokerage: !target?.isWon && !target?.isLost ? expected : undefined,
      }))}>{a.pending ? 'Saving…' : 'Update'}</Button>
      <Msg r={a.result} />
    </div>
  );
}

export function AssignControl({ leadId, current, members }: { leadId: string; current: string | null; members: { id: string; name: string }[] }) {
  const a = useAction();
  const [value, setValue] = useState(current ?? '');
  return (
    <div>
      <label className={lbl} htmlFor="assign">Assigned broker</label>
      <div className="flex gap-2">
        <Select id="assign" value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="">Unassigned</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
        <Button size="sm" variant="outline" disabled={a.pending || value === (current ?? '')}
          onClick={() => a.run(() => assignLead({ leadId, userId: value || null }))}>Reassign</Button>
      </div>
      <Msg r={a.result} />
    </div>
  );
}

// ---------------------------------------------------------------- qualification
export function QualificationControls({ leadId, canOverride, override }: { leadId: string; canOverride: boolean; override: string | null }) {
  const a = useAction();
  const [cat, setCat] = useState(override ?? '');
  const [reason, setReason] = useState('');
  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-stone-200 pt-4">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={a.pending} onClick={() => a.run(() => recalculateLead(leadId))}>Recalculate score</Button>
      </div>
      {canOverride && (
        <div className="grid gap-2 sm:grid-cols-[170px_1fr_auto] sm:items-end">
          <div>
            <label className={lbl} htmlFor="ov-cat">Override</label>
            <Select id="ov-cat" value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="">No override</option><option value="hot">Hot</option><option value="warm">Warm</option><option value="cold">Cold</option>
            </Select>
          </div>
          <div>
            <label className={lbl} htmlFor="ov-reason">Reason</label>
            <Input id="ov-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why the rules don't fit this lead" disabled={!cat} />
          </div>
          <Button size="sm" disabled={a.pending} onClick={() => a.run(() => overrideScore({ leadId, category: cat || null, reason }))}>Save</Button>
        </div>
      )}
      <Msg r={a.result} />
    </div>
  );
}

export function MatchRecalc({ leadId }: { leadId: string }) {
  const a = useAction();
  return (
    <span className="flex items-center gap-2">
      {a.result?.message && <span className={`text-xs ${a.result.ok ? 'text-success-700' : 'text-danger-700'}`}>{a.result.message}</span>}
      <Button size="sm" variant="ghost" disabled={a.pending} onClick={() => a.run(() => recalculateLead(leadId))}>Refresh</Button>
    </span>
  );
}

export function MatchShare({ leadId, propertyId, title }: { leadId: string; propertyId: string; title: string }) {
  const a = useAction();
  return a.result?.ok ? <Badge tone="success">Shared</Badge> : (
    <Button size="sm" variant="outline" disabled={a.pending} onClick={() => a.run(() => markPropertyShared({ leadId, propertyId, title }))}>Mark shared</Button>
  );
}

// ---------------------------------------------------------------- preferences
type Prefs = {
  transaction_type: string | null; category: string | null; localities: string[]; property_types: string[];
  configurations: string[]; must_have_amenities: string[]; budget_min: number | null; budget_max: number | null;
  timeline_days: number | null; furnishing: string | null; possession_pref: string | null;
} | null;

export function PreferencesEditor({ leadId, canEdit, prefs }: { leadId: string; canEdit: boolean; prefs: Prefs }) {
  const a = useAction();
  const [editing, setEditing] = useState(false);
  const p = prefs;
  const [v, setV] = useState({
    transaction_type: p?.transaction_type ?? '', category: p?.category ?? '',
    localities: p?.localities ?? [], property_types: (p?.property_types ?? []).join(', '),
    configurations: (p?.configurations ?? []).join(', '), must_have_amenities: (p?.must_have_amenities ?? []).join(', '),
    budget_min: p?.budget_min?.toString() ?? '', budget_max: p?.budget_max?.toString() ?? '',
    timeline_days: p?.timeline_days?.toString() ?? '', furnishing: p?.furnishing ?? '', possession_pref: p?.possession_pref ?? '',
  });
  const split = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

  if (!editing) {
    const rows: [string, string][] = [
      ['Looking to', p?.transaction_type ?? '—'], ['Category', p?.category ?? '—'],
      ['Localities', p?.localities?.join(', ') || '—'], ['Property types', p?.property_types?.join(', ') || '—'],
      ['Configuration', p?.configurations?.join(', ') || '—'],
      ['Budget', p?.budget_max ? `₹${p.budget_min ?? 0} – ₹${p.budget_max}` : '—'],
      ['Timeline', p?.timeline_days != null ? `${p.timeline_days} days` : '—'],
      ['Furnishing', p?.furnishing?.replace('_', ' ') ?? '—'], ['Possession', p?.possession_pref?.replace(/_/g, ' ') ?? '—'],
      ['Must-have amenities', p?.must_have_amenities?.join(', ') || '—'],
    ];
    return (
      <>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {rows.map(([k, val]) => <div key={k}><dt className="inline text-stone-600">{k}: </dt><dd className="inline font-medium capitalize">{val}</dd></div>)}
        </dl>
        {canEdit && <Button size="sm" variant="outline" className="mt-4" onClick={() => setEditing(true)}>Edit requirements</Button>}
      </>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className={lbl} htmlFor="p-tx">Looking to</label>
          <Select id="p-tx" value={v.transaction_type} onChange={(e) => setV({ ...v, transaction_type: e.target.value })}>
            <option value="">Not specified</option><option value="sale">Buy</option><option value="rent">Rent</option><option value="lease">Lease</option>
          </Select></div>
        <div><label className={lbl} htmlFor="p-cat">Category</label>
          <Select id="p-cat" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })}>
            <option value="">Any</option><option value="residential">Residential</option><option value="commercial">Commercial</option>
          </Select></div>
        <div><label className={lbl} htmlFor="p-min">Budget min (₹)</label><Input id="p-min" inputMode="numeric" value={v.budget_min} onChange={(e) => setV({ ...v, budget_min: e.target.value })} /></div>
        <div><label className={lbl} htmlFor="p-max">Budget max (₹)</label><Input id="p-max" inputMode="numeric" value={v.budget_max} onChange={(e) => setV({ ...v, budget_max: e.target.value })} /></div>
        <div><label className={lbl} htmlFor="p-types">Property types (comma separated)</label><Input id="p-types" value={v.property_types} onChange={(e) => setV({ ...v, property_types: e.target.value })} placeholder="Apartment, Villa" /></div>
        <div><label className={lbl} htmlFor="p-conf">Configuration</label><Input id="p-conf" value={v.configurations} onChange={(e) => setV({ ...v, configurations: e.target.value })} placeholder="2 BHK, 3 BHK" /></div>
        <div><label className={lbl} htmlFor="p-time">Timeline (days)</label><Input id="p-time" inputMode="numeric" value={v.timeline_days} onChange={(e) => setV({ ...v, timeline_days: e.target.value })} /></div>
        <div><label className={lbl} htmlFor="p-poss">Possession</label>
          <Select id="p-poss" value={v.possession_pref} onChange={(e) => setV({ ...v, possession_pref: e.target.value })}>
            <option value="">Either</option><option value="ready_to_move">Ready to move</option><option value="under_construction">Under construction</option>
          </Select></div>
        <div><label className={lbl} htmlFor="p-furn">Furnishing</label>
          <Select id="p-furn" value={v.furnishing} onChange={(e) => setV({ ...v, furnishing: e.target.value })}>
            <option value="">Any</option><option value="unfurnished">Unfurnished</option><option value="semi_furnished">Semi-furnished</option><option value="fully_furnished">Fully furnished</option>
          </Select></div>
        <div><label className={lbl} htmlFor="p-amen">Must-have amenities</label><Input id="p-amen" value={v.must_have_amenities} onChange={(e) => setV({ ...v, must_have_amenities: e.target.value })} placeholder="Lift, Parking" /></div>
      </div>
      <fieldset>
        <legend className={lbl}>Localities</legend>
        <div className="flex flex-wrap gap-1.5">
          {NAVI_MUMBAI_LOCALITIES.map((l) => {
            const on = v.localities.includes(l);
            return (
              <button key={l} type="button" aria-pressed={on}
                onClick={() => setV({ ...v, localities: on ? v.localities.filter((x) => x !== l) : [...v.localities, l] })}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${on ? 'border-navy-900 bg-navy-900 text-ivory' : 'border-stone-300 bg-white'}`}>{l}</button>
            );
          })}
        </div>
      </fieldset>
      <div className="flex gap-2">
        <Button size="sm" disabled={a.pending} onClick={() => a.run(() => updatePreferences({
          leadId, transaction_type: v.transaction_type, category: v.category, localities: v.localities,
          property_types: split(v.property_types), configurations: split(v.configurations), must_have_amenities: split(v.must_have_amenities),
          budget_min: v.budget_min, budget_max: v.budget_max, timeline_days: v.timeline_days, furnishing: v.furnishing, possession_pref: v.possession_pref,
        }), (r) => r.ok && setEditing(false))}>{a.pending ? 'Saving…' : 'Save requirements'}</Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
      </div>
      <Msg r={a.result} />
    </div>
  );
}

// ---------------------------------------------------------------- activity
export function ActivityForm({ leadId }: { leadId: string }) {
  const a = useAction();
  const [type, setType] = useState('call');
  const [body, setBody] = useState('');
  return (
    <div className="rounded-xl border border-stone-200 p-3">
      <div className="flex flex-wrap gap-2">
        {[['call', 'Call'], ['whatsapp', 'WhatsApp'], ['email', 'Email'], ['meeting', 'Meeting'], ['note', 'Note']].map(([k, label]) => (
          <button key={k} type="button" aria-pressed={type === k} onClick={() => setType(k)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${type === k ? 'bg-navy-900 text-ivory' : 'bg-stone-100 text-stone-700'}`}>{label}</button>
        ))}
      </div>
      <label className="sr-only" htmlFor="act-body">Details</label>
      <textarea id="act-body" rows={2} value={body} onChange={(e) => setBody(e.target.value)} className={`${ta} mt-2`}
        placeholder={type === 'note' ? 'Write a note' : 'What was discussed? (optional)'} />
      <div className="mt-2 flex items-center gap-3">
        <Button size="sm" disabled={a.pending} onClick={() => a.run(() => logActivity({ leadId, type, body }), (r) => r.ok && setBody(''))}>
          {type === 'note' ? 'Add note' : 'Log contact'}
        </Button>
        <span className="text-xs text-stone-500">{type !== 'note' && 'Logging contact records first contact and schedules a follow-up.'}</span>
      </div>
      <Msg r={a.result} />
    </div>
  );
}

// ---------------------------------------------------------------- contact
export function ContactEditor({ lead, canEdit }: {
  lead: { id: string; full_name: string; phone: string; email: string; preferred_contact: string; do_not_contact: boolean }; canEdit: boolean;
}) {
  const a = useAction();
  const [v, setV] = useState(lead);
  if (!canEdit) {
    return <p className="text-sm">{lead.phone || '—'} · {lead.email || 'no email'} · prefers {lead.preferred_contact}</p>;
  }
  return (
    <div className="grid gap-3">
      <div><label className={lbl} htmlFor="c-name">Name</label><Input id="c-name" value={v.full_name} onChange={(e) => setV({ ...v, full_name: e.target.value })} /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className={lbl} htmlFor="c-phone">Mobile</label><Input id="c-phone" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} /></div>
        <div><label className={lbl} htmlFor="c-email">Email</label><Input id="c-email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></div>
      </div>
      <div><label className={lbl} htmlFor="c-pref">Preferred contact</label>
        <Select id="c-pref" value={v.preferred_contact} onChange={(e) => setV({ ...v, preferred_contact: e.target.value })}>
          <option value="phone">Phone</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option>
        </Select></div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={v.do_not_contact} onChange={(e) => setV({ ...v, do_not_contact: e.target.checked })} className="h-4 w-4 accent-navy-900" />
        Do not contact (person opted out)
      </label>
      <div><Button size="sm" variant="outline" disabled={a.pending} onClick={() => a.run(() => updateLeadContact({ leadId: lead.id, ...v }))}>Save contact details</Button></div>
      <Msg r={a.result} />
    </div>
  );
}

// ---------------------------------------------------------------- tasks
export type TaskItem = { id: string; title: string; type: string; due_at: string; status: string; assigned_to: string | null; assignee?: string | null; escalated_at?: string | null };

export function TaskRow({ task, mine, isManager, members }: { task: TaskItem; mine: boolean; isManager: boolean; members?: { id: string; name: string }[] }) {
  const a = useAction();
  const overdue = Date.parse(task.due_at) < Date.now() && task.status === 'open';
  const canAct = mine || isManager;
  if (a.result?.ok && a.result.message === 'Done.') return null;
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-stone-900">{task.title}</p>
        <p className={`text-xs ${overdue ? 'font-semibold text-danger-700' : 'text-stone-500'}`}>
          {task.status === 'snoozed' ? 'Snoozed until ' : 'Due '}{fmtDateTime(task.due_at)} ({relative(task.due_at)})
          {task.assignee !== undefined && ` · ${task.assignee ?? 'Unassigned'}`}
          {task.escalated_at && ' · escalated'}
        </p>
        {a.result && !a.result.ok && <p className="text-xs text-danger-700">{a.result.message}</p>}
      </div>
      {canAct && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" disabled={a.pending} onClick={() => a.run(() => updateTask({ action: 'complete', taskId: task.id }))}>Done</Button>
          <label className="sr-only" htmlFor={`snz-${task.id}`}>Snooze</label>
          <select id={`snz-${task.id}`} defaultValue="" disabled={a.pending}
            onChange={(e) => e.target.value && a.run(() => updateTask({ action: 'snooze', taskId: task.id, until: e.target.value as '1h' }))}
            className="h-9 rounded-full border border-stone-300 bg-white px-2 text-xs">
            <option value="">Snooze…</option><option value="1h">1 hour</option><option value="3h">3 hours</option>
            <option value="tomorrow">Tomorrow 10am</option><option value="next_week">Next week</option>
          </select>
          {isManager && members && (
            <>
              <label className="sr-only" htmlFor={`ra-${task.id}`}>Reassign</label>
              <select id={`ra-${task.id}`} defaultValue="" disabled={a.pending}
                onChange={(e) => e.target.value && a.run(() => updateTask({ action: 'reassign', taskId: task.id, userId: e.target.value }))}
                className="h-9 rounded-full border border-stone-300 bg-white px-2 text-xs">
                <option value="">Reassign…</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </>
          )}
        </div>
      )}
    </li>
  );
}

export function TaskList({ leadId, tasks, canAdd, userId, isManager }: { leadId: string; tasks: TaskItem[]; canAdd: boolean; userId: string; isManager: boolean }) {
  const a = useAction();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState(() => toLocalInput(new Date(Date.now() + 86_400_000)));
  return (
    <>
      {tasks.length === 0 ? <p className="text-sm text-stone-600">No open tasks.</p> : (
        <ul className="divide-y divide-stone-200">
          {tasks.map((t) => <TaskRow key={t.id} task={t} mine={t.assigned_to === userId} isManager={isManager} />)}
        </ul>
      )}
      {canAdd && (
        <div className="mt-3 grid gap-2 border-t border-stone-200 pt-3 sm:grid-cols-[1fr_auto_auto]">
          <label className="sr-only" htmlFor="t-title">Task</label>
          <Input id="t-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task, e.g. Send brochure" />
          <label className="sr-only" htmlFor="t-due">Due</label>
          <Input id="t-due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
          <Button size="sm" disabled={a.pending || title.length < 2} onClick={() => a.run(() => createTask({ leadId, title, due }), (r) => r.ok && setTitle(''))}>Add</Button>
        </div>
      )}
      <Msg r={a.result} />
    </>
  );
}

// ---------------------------------------------------------------- visits
export type VisitItem = {
  id: string; starts_at: string; duration_min: number; status: string; meeting_point: string | null;
  buyer_confirmed: boolean; outcome_notes: string | null; property: string | null; broker: string | null; lead?: string | null; lead_id?: string;
};

const VISIT_TONE: Record<string, 'navy' | 'success' | 'warning' | 'danger' | 'neutral' | 'gold'> = {
  scheduled: 'navy', confirmed: 'gold', rescheduled: 'warning', attended: 'success', cancelled: 'neutral', no_show: 'danger',
};

export function VisitRow({ v, canEdit }: { v: VisitItem; canEdit: boolean }) {
  const a = useAction();
  const [outcome, setOutcome] = useState(v.outcome_notes ?? '');
  const [mode, setMode] = useState<'none' | 'outcome' | 'reschedule'>('none');
  const [when, setWhen] = useState(toLocalInput(v.starts_at));
  const active = ['scheduled', 'confirmed', 'rescheduled'].includes(v.status);
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-stone-900">{fmtDateTime(v.starts_at)} · {v.duration_min} min{v.lead ? ` · ${v.lead}` : ''}</p>
          <p className="text-xs text-stone-600">{[v.property, v.meeting_point, v.broker].filter(Boolean).join(' · ') || 'No property set'}</p>
          {v.outcome_notes && <p className="mt-1 text-xs text-stone-700">Outcome: {v.outcome_notes}</p>}
        </div>
        <div className="flex items-center gap-1.5">
          <Badge tone={VISIT_TONE[v.status] ?? 'neutral'}>{v.status.replace('_', '-')}</Badge>
          {v.buyer_confirmed && active && <Badge tone="success">Client confirmed</Badge>}
        </div>
      </div>
      {canEdit && active && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {!v.buyer_confirmed && <Button size="sm" variant="outline" disabled={a.pending} onClick={() => a.run(() => updateVisit({ visitId: v.id, buyerConfirmed: true }))}>Client confirmed</Button>}
          <Button size="sm" variant="outline" onClick={() => setMode(mode === 'outcome' ? 'none' : 'outcome')}>Record outcome</Button>
          <Button size="sm" variant="ghost" onClick={() => setMode(mode === 'reschedule' ? 'none' : 'reschedule')}>Reschedule</Button>
          <Button size="sm" variant="ghost" disabled={a.pending} onClick={() => a.run(() => updateVisit({ visitId: v.id, status: 'cancelled' }))}>Cancel</Button>
        </div>
      )}
      {mode === 'outcome' && (
        <div className="mt-2 grid gap-2">
          <label className="sr-only" htmlFor={`out-${v.id}`}>Outcome</label>
          <textarea id={`out-${v.id}`} rows={2} className={ta} value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="What happened? Feedback, objections, next step" />
          <div className="flex gap-2">
            <Button size="sm" disabled={a.pending} onClick={() => a.run(() => updateVisit({ visitId: v.id, status: 'attended', outcomeNotes: outcome }))}>Attended</Button>
            <Button size="sm" variant="outline" disabled={a.pending} onClick={() => a.run(() => updateVisit({ visitId: v.id, status: 'no_show', outcomeNotes: outcome || 'Client did not arrive' }))}>No-show</Button>
          </div>
        </div>
      )}
      {mode === 'reschedule' && (
        <div className="mt-2 flex flex-wrap gap-2">
          <label className="sr-only" htmlFor={`rs-${v.id}`}>New time</label>
          <Input id={`rs-${v.id}`} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="max-w-56" />
          <Button size="sm" disabled={a.pending} onClick={() => a.run(() => updateVisit({ visitId: v.id, startsAt: when }), (r) => r.ok && setMode('none'))}>Save new time</Button>
        </div>
      )}
      <Msg r={a.result} />
    </li>
  );
}

export function VisitList({ visits, canEdit }: { visits: VisitItem[]; canEdit: boolean }) {
  if (visits.length === 0) return <p className="text-sm text-stone-600">No visits yet.</p>;
  return <ul className="divide-y divide-stone-200">{visits.map((v) => <VisitRow key={v.id} v={v} canEdit={canEdit} />)}</ul>;
}

export function VisitScheduler({ leadId, properties, brokers, defaultBroker }: {
  leadId: string; properties: { id: string; name: string }[]; brokers: { id: string; name: string }[]; defaultBroker: string;
}) {
  const a = useAction();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ propertyId: '', brokerId: defaultBroker, startsAt: '', durationMin: '60', meetingPoint: '', buyerConfirmed: false });
  if (!open) return <Button size="sm" variant="outline" className="mt-3" onClick={() => setOpen(true)}>Schedule a visit</Button>;
  return (
    <div className="mt-3 grid gap-3 border-t border-stone-200 pt-3">
      <div><label className={lbl} htmlFor="v-prop">Property</label>
        <Select id="v-prop" value={v.propertyId} onChange={(e) => setV({ ...v, propertyId: e.target.value })}>
          <option value="">Not decided yet</option>
          {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className={lbl} htmlFor="v-when">Date and time (IST)</label><Input id="v-when" type="datetime-local" value={v.startsAt} onChange={(e) => setV({ ...v, startsAt: e.target.value })} /></div>
        <div><label className={lbl} htmlFor="v-dur">Duration</label>
          <Select id="v-dur" value={v.durationMin} onChange={(e) => setV({ ...v, durationMin: e.target.value })}>
            <option value="30">30 min</option><option value="60">1 hour</option><option value="90">1.5 hours</option><option value="120">2 hours</option>
          </Select></div>
      </div>
      {brokers.length > 0 && (
        <div><label className={lbl} htmlFor="v-broker">Broker</label>
          <Select id="v-broker" value={v.brokerId} onChange={(e) => setV({ ...v, brokerId: e.target.value })}>
            {brokers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select></div>
      )}
      <div><label className={lbl} htmlFor="v-meet">Meeting point</label><Input id="v-meet" value={v.meetingPoint} onChange={(e) => setV({ ...v, meetingPoint: e.target.value })} placeholder="e.g. Project sales office, main gate" /></div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={v.buyerConfirmed} onChange={(e) => setV({ ...v, buyerConfirmed: e.target.checked })} className="h-4 w-4 accent-navy-900" />
        Client has already confirmed this time
      </label>
      <div className="flex gap-2">
        <Button size="sm" disabled={a.pending || !v.startsAt} onClick={() => a.run(() => scheduleVisit({ leadId, ...v }), (r) => r.ok && setOpen(false))}>Schedule visit</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
      <Msg r={a.result} />
    </div>
  );
}

// ---------------------------------------------------------------- duplicates & delete
export function DuplicatesPanel({ keepId, duplicates }: {
  keepId: string; duplicates: { id: string; full_name: string; phone: string | null; email: string | null; created_at: string; stage_name: string | null }[];
}) {
  const a = useAction();
  const [confirm, setConfirm] = useState<string | null>(null);
  return (
    <>
      <p className="mb-3 text-sm text-stone-600">Same mobile or email. Merging moves history, tasks, visits and consent onto this lead and keeps an audit record.</p>
      <ul className="divide-y divide-stone-200">
        {duplicates.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
            <div>
              <a href={`/dashboard/leads/${d.id}`} className="font-semibold text-navy-900 hover:underline">{d.full_name}</a>
              <p className="text-xs text-stone-600">{d.phone ?? d.email} · {d.stage_name} · {fmtDateTime(d.created_at)}</p>
            </div>
            {confirm === d.id ? (
              <span className="flex gap-2">
                <Button size="sm" variant="danger" disabled={a.pending} onClick={() => a.run(() => mergeLeads({ keepId, mergeId: d.id }))}>Confirm merge</Button>
                <Button size="sm" variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
              </span>
            ) : <Button size="sm" variant="outline" onClick={() => setConfirm(d.id)}>Merge into this lead</Button>}
          </li>
        ))}
      </ul>
      <Msg r={a.result} />
    </>
  );
}

export function DeleteLeadButton({ leadId }: { leadId: string }) {
  const a = useAction();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="text-right">
      {confirm ? (
        <span className="inline-flex items-center gap-2 text-sm">
          Permanently delete this lead and its history?
          <Button size="sm" variant="danger" disabled={a.pending} onClick={() => a.run(() => deleteLead(leadId))}>Delete</Button>
          <Button size="sm" variant="outline" onClick={() => setConfirm(false)}>Cancel</Button>
        </span>
      ) : <Button size="sm" variant="ghost" className="text-danger-700" onClick={() => setConfirm(true)}>Delete lead</Button>}
      <Msg r={a.result} />
    </div>
  );
}
