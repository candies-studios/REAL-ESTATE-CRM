'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { bulkUpdateLeads } from '@/app/actions/leads';
import { Badge, Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/field';
import { CATEGORY_LABEL, INTENT_LABEL } from '@/lib/qualification';
import { formatINR } from '@/lib/utils';
import { CATEGORY_TONE, fmtDate, relative } from './format';

export type LeadRow = {
  id: string; full_name: string; phone: string | null; email: string | null;
  intent: keyof typeof INTENT_LABEL; source: string | null; score: number | null;
  effective_category: 'hot' | 'warm' | 'cold' | null; stage_name: string | null; assignee_name: string | null;
  next_follow_up_at: string | null; created_at: string; localities_text: string | null;
  budget_min: number | null; budget_max: number | null; do_not_contact: boolean;
};

export function LeadTable({ rows, canBulk, stages, members }: {
  rows: LeadRow[]; canBulk: boolean; stages: { id: string; name: string }[]; members: { id: string; name: string }[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message?: string }>();
  const [bulkAction, setBulkAction] = useState<'assign' | 'stage'>('assign');
  const [bulkValue, setBulkValue] = useState('');
  const [confirming, setConfirming] = useState(false);

  const all = rows.length > 0 && selected.length === rows.length;
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const runBulk = () =>
    start(async () => {
      const res = await bulkUpdateLeads({ leadIds: selected, action: bulkAction, value: bulkValue === 'none' ? null : bulkValue });
      setResult(res);
      setConfirming(false);
      if (res.ok) setSelected([]);
    });

  if (rows.length === 0) {
    return (
      <Card className="p-10 text-center">
        <p className="font-display text-xl text-navy-900">No leads match.</p>
        <p className="mt-1 text-stone-600">New website enquiries appear here automatically.</p>
      </Card>
    );
  }

  return (
    <>
      {canBulk && selected.length > 0 && (
        <Card className="mb-3 flex flex-wrap items-center gap-3 border-navy-600/30 bg-navy-50 p-3 text-sm">
          <strong>{selected.length} selected</strong>
          <label className="sr-only" htmlFor="bulk-action">Bulk action</label>
          <select id="bulk-action" value={bulkAction} onChange={(e) => { setBulkAction(e.target.value as 'assign' | 'stage'); setBulkValue(''); }}
            className="h-9 rounded-md border border-stone-300 bg-white px-2">
            <option value="assign">Assign to</option>
            <option value="stage">Move to stage</option>
          </select>
          <label className="sr-only" htmlFor="bulk-value">Value</label>
          <select id="bulk-value" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} className="h-9 rounded-md border border-stone-300 bg-white px-2">
            <option value="">Choose…</option>
            {bulkAction === 'assign' && <option value="none">Unassigned</option>}
            {(bulkAction === 'assign' ? members : stages).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          {!confirming ? (
            <Button size="sm" disabled={!bulkValue || pending} onClick={() => setConfirming(true)}>Apply</Button>
          ) : (
            <span className="flex items-center gap-2">
              <span>Update {selected.length} leads?</span>
              <Button size="sm" onClick={runBulk} disabled={pending}>{pending ? 'Updating…' : 'Confirm'}</Button>
              <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>Cancel</Button>
            </span>
          )}
        </Card>
      )}
      {result?.message && <div className="mb-3"><FormAlert tone={result.ok ? 'success' : 'error'}>{result.message}</FormAlert></div>}

      <Card className="overflow-hidden">
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <caption className="sr-only">Leads</caption>
            <thead className="border-b border-stone-200 bg-stone-100/70 text-xs uppercase tracking-wider text-stone-600">
              <tr>
                {canBulk && (
                  <th scope="col" className="w-10 px-4 py-3">
                    <input type="checkbox" aria-label="Select all" checked={all}
                      onChange={() => setSelected(all ? [] : rows.map((r) => r.id))} className="h-4 w-4 accent-navy-900" />
                  </th>
                )}
                <th scope="col" className="px-4 py-3 font-semibold">Lead</th>
                <th scope="col" className="px-4 py-3 font-semibold">Score</th>
                <th scope="col" className="px-4 py-3 font-semibold">Stage</th>
                <th scope="col" className="px-4 py-3 font-semibold">Requirement</th>
                <th scope="col" className="px-4 py-3 font-semibold">Broker</th>
                <th scope="col" className="px-4 py-3 font-semibold">Next follow-up</th>
                <th scope="col" className="px-4 py-3 font-semibold">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {rows.map((r) => {
                const overdue = r.next_follow_up_at && Date.parse(r.next_follow_up_at) < Date.now();
                return (
                  <tr key={r.id} className="hover:bg-stone-100/50">
                    {canBulk && (
                      <td className="px-4 py-3">
                        <input type="checkbox" aria-label={`Select ${r.full_name}`} checked={selected.includes(r.id)} onChange={() => toggle(r.id)} className="h-4 w-4 accent-navy-900" />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/leads/${r.id}`} className="font-semibold text-navy-900 hover:underline">{r.full_name}</Link>
                      <div className="text-xs text-stone-600">{INTENT_LABEL[r.intent]} · {r.phone ?? r.email ?? '—'}{r.do_not_contact && ' · Do not contact'}</div>
                    </td>
                    <td className="px-4 py-3">
                      {r.effective_category ? (
                        <Badge tone={CATEGORY_TONE[r.effective_category]}>{CATEGORY_LABEL[r.effective_category]} {r.score ?? ''}</Badge>
                      ) : <span className="text-stone-500">—</span>}
                    </td>
                    <td className="px-4 py-3">{r.stage_name ?? '—'}</td>
                    <td className="px-4 py-3 text-stone-700">
                      <div className="max-w-[220px] truncate">{r.localities_text || '—'}</div>
                      {(r.budget_min || r.budget_max) && (
                        <div className="text-xs text-stone-500">{r.budget_min ? formatINR(r.budget_min) : '…'} – {r.budget_max ? formatINR(r.budget_max) : '…'}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">{r.assignee_name ?? <span className="text-warning-700">Unassigned</span>}</td>
                    <td className={`px-4 py-3 ${overdue ? 'font-semibold text-danger-700' : ''}`}>{relative(r.next_follow_up_at)}</td>
                    <td className="px-4 py-3 text-stone-600">{fmtDate(r.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
