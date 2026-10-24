'use client';

import { ArrowDown, ArrowUp } from 'lucide-react';
import { useState } from 'react';
import { runAutomationNow, saveOrganization, saveSettings, updateStage } from '@/app/actions/settings';
import { Button } from '@/components/ui/button';
import { FormAlert, Input } from '@/components/ui/field';
import { useAction } from './lead-panels';

const lbl = 'mb-1 block text-xs font-semibold text-stone-700';

function Msg({ r }: { r?: { ok: boolean; message?: string; errors?: Record<string, string> } }) {
  if (!r?.message) return null;
  return <div className="mt-3"><FormAlert tone={r.ok ? 'success' : 'error'}>{r.message}{r.errors && ` (${Object.values(r.errors)[0]})`}</FormAlert></div>;
}

export function OrgForm({ name, accepts, isOwner }: { name: string; accepts: boolean; isOwner: boolean }) {
  const a = useAction();
  const [v, setV] = useState({ name, accepts_public_enquiries: accepts });
  return (
    <div className="grid gap-3">
      <div><label className={lbl} htmlFor="org-name">Name</label><Input id="org-name" value={v.name} disabled={!isOwner} onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" disabled={!isOwner} checked={v.accepts_public_enquiries} onChange={(e) => setV({ ...v, accepts_public_enquiries: e.target.checked })} className="h-4 w-4 accent-navy-900" />
        Accept enquiries from the website
      </label>
      {isOwner ? <div><Button size="sm" disabled={a.pending} onClick={() => a.run(() => saveOrganization(v))}>Save</Button></div>
        : <p className="text-xs text-stone-500">Only owners can change these.</p>}
      <Msg r={a.result} />
    </div>
  );
}

export function AutomationRunner() {
  const a = useAction();
  return (
    <>
      <Button size="sm" variant="outline" disabled={a.pending} onClick={() => a.run(() => runAutomationNow())}>{a.pending ? 'Running…' : 'Run reminders now'}</Button>
      <Msg r={a.result} />
    </>
  );
}

type S = { scoring?: Record<string, number>; automation?: Record<string, number | string | boolean> };

const SCORING: [string, string][] = [
  ['budget_match', 'Budget matches an available property'], ['locality_match', 'Preferred locality matches inventory'],
  ['timeline_30d', 'Timeline within 30 days'], ['valid_contact', 'Valid mobile number'],
  ['specific_property', 'Enquired about a specific property'], ['site_visit_request', 'Asked for a site visit'],
  ['hot_min', 'Hot from score'], ['warm_min', 'Warm from score'],
];
const AUTOMATION: [string, string, string][] = [
  ['first_contact_minutes', 'First contact due after', 'minutes'], ['follow_up_days', 'Follow-up after contact', 'days'],
  ['overdue_escalation_hours', 'Escalate overdue tasks after', 'hours'], ['visit_reminder_hours', 'Visit reminder before', 'hours'],
  ['negotiation_follow_up_days', 'Negotiation follow-up after', 'days'], ['post_visit_follow_up_days', 'Post-visit follow-up after', 'days'],
  ['stale_listing_days', 'Re-verify listings older than', 'days'],
];

export function SettingsForm({ settings }: { settings: S }) {
  const a = useAction();
  const [sc, setSc] = useState<Record<string, string>>(Object.fromEntries(SCORING.map(([k]) => [k, String(settings.scoring?.[k] ?? '')])));
  const [au, setAu] = useState<Record<string, string>>(Object.fromEntries(
    [...AUTOMATION.map(([k]) => k), 'work_start', 'work_end'].map((k) => [k, String(settings.automation?.[k] ?? '')])));
  const [autoAssign, setAutoAssign] = useState(settings.automation?.auto_assign !== false);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <fieldset>
        <legend className="font-sans text-sm font-semibold text-navy-900">Score points (total is capped at 100)</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {SCORING.map(([k, label]) => (
            <div key={k}><label className={lbl} htmlFor={`sc-${k}`}>{label}</label>
              <Input id={`sc-${k}`} inputMode="numeric" value={sc[k]} onChange={(e) => setSc({ ...sc, [k]: e.target.value })} /></div>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="font-sans text-sm font-semibold text-navy-900">Follow-ups and working hours</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {AUTOMATION.map(([k, label, unit]) => (
            <div key={k}><label className={lbl} htmlFor={`au-${k}`}>{label} ({unit})</label>
              <Input id={`au-${k}`} inputMode="numeric" value={au[k]} onChange={(e) => setAu({ ...au, [k]: e.target.value })} /></div>
          ))}
          <div><label className={lbl} htmlFor="au-ws">Working day starts</label><Input id="au-ws" type="time" value={au.work_start} onChange={(e) => setAu({ ...au, work_start: e.target.value })} /></div>
          <div><label className={lbl} htmlFor="au-we">Working day ends</label><Input id="au-we" type="time" value={au.work_end} onChange={(e) => setAu({ ...au, work_end: e.target.value })} /></div>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={autoAssign} onChange={(e) => setAutoAssign(e.target.checked)} className="h-4 w-4 accent-navy-900" />
          Auto-assign website enquiries to the broker with the fewest open leads
        </label>
      </fieldset>
      <div className="lg:col-span-2">
        <Button disabled={a.pending} onClick={() => a.run(() => saveSettings({ scoring: sc, automation: { ...au, auto_assign: autoAssign } }))}>
          {a.pending ? 'Saving…' : 'Save settings'}
        </Button>
        <Msg r={a.result} />
      </div>
    </div>
  );
}

export function StageEditor({ stages }: { stages: { id: string; key: string; name: string; active: boolean }[] }) {
  const a = useAction();
  const [names, setNames] = useState<Record<string, string>>(Object.fromEntries(stages.map((s) => [s.id, s.name])));
  const [newName, setNewName] = useState('');
  return (
    <>
      <ol className="divide-y divide-stone-200 rounded-xl border border-stone-200">
        {stages.map((s, i) => (
          <li key={s.id} className={`flex flex-wrap items-center gap-2 px-3 py-2 ${s.active ? '' : 'bg-stone-100 text-stone-500'}`}>
            <span className="w-6 text-xs text-stone-500">{i + 1}</span>
            <label className="sr-only" htmlFor={`st-${s.id}`}>Stage name</label>
            <Input id={`st-${s.id}`} value={names[s.id]} onChange={(e) => setNames({ ...names, [s.id]: e.target.value })} className="h-9 max-w-xs" />
            <Button size="sm" variant="ghost" disabled={a.pending || names[s.id] === s.name} onClick={() => a.run(() => updateStage({ op: 'rename', id: s.id, name: names[s.id] }))}>Rename</Button>
            <span className="ml-auto flex items-center gap-1">
              <button type="button" aria-label={`Move ${s.name} up`} disabled={i === 0 || a.pending} onClick={() => a.run(() => updateStage({ op: 'move', id: s.id, dir: 'up' }))}
                className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-stone-100 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
              <button type="button" aria-label={`Move ${s.name} down`} disabled={i === stages.length - 1 || a.pending} onClick={() => a.run(() => updateStage({ op: 'move', id: s.id, dir: 'down' }))}
                className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-stone-100 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
              <Button size="sm" variant="outline" disabled={a.pending} onClick={() => a.run(() => updateStage({ op: 'toggle', id: s.id, active: !s.active }))}>{s.active ? 'Hide' : 'Show'}</Button>
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="new-stage">New stage name</label>
        <Input id="new-stage" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New stage, e.g. Documentation" className="max-w-xs" />
        <Button size="sm" disabled={a.pending || !newName.trim()} onClick={() => a.run(() => updateStage({ op: 'add', name: newName }), (r) => r.ok && setNewName(''))}>Add stage</Button>
      </div>
      <Msg r={a.result} />
    </>
  );
}
