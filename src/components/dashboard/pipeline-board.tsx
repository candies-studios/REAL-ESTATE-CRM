'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { moveLeadStage } from '@/app/actions/leads';
import { Badge } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FormAlert, Input } from '@/components/ui/field';
import { CATEGORY_LABEL } from '@/lib/qualification';
import { formatINR } from '@/lib/utils';
import { CATEGORY_TONE, relative } from './format';

export type BoardLead = {
  id: string; full_name: string; effective_category: 'hot' | 'warm' | 'cold' | null; score: number | null;
  assignee_name: string | null; assigned_to: string | null; next_follow_up_at: string | null;
  localities_text: string | null; budget_max: number | null;
};
type Col = { stage: { id: string; name: string; isWon: boolean; isLost: boolean }; leads: BoardLead[]; total: number };

export function PipelineBoard({ columns, canMove, canMoveAll, userId }: { columns: Col[]; canMove: boolean; canMoveAll: boolean; userId: string }) {
  const router = useRouter();
  const [cols, setCols] = useState(columns);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [dragging, setDragging] = useState<string | null>(null);
  const [needsDetail, setNeedsDetail] = useState<{ leadId: string; stageId: string; kind: 'lost' | 'won' } | null>(null);
  const [detail, setDetail] = useState('');

  const stageOf = (id: string) => cols.find((c) => c.stage.id === id)!.stage;
  const movable = (l: BoardLead) => canMove && (canMoveAll || l.assigned_to === userId);

  const move = (leadId: string, toStageId: string, extra: Record<string, string> = {}) => {
    const from = cols.find((c) => c.leads.some((l) => l.id === leadId));
    if (!from || from.stage.id === toStageId) return;
    const target = stageOf(toStageId);
    if ((target.isLost && !extra.lostReason) || (target.isWon && extra.brokerageAmount === undefined)) {
      setNeedsDetail({ leadId, stageId: toStageId, kind: target.isLost ? 'lost' : 'won' });
      setDetail('');
      return;
    }
    const lead = from.leads.find((l) => l.id === leadId)!;
    const snapshot = cols;
    // Optimistic update; rolled back if the server refuses.
    setCols((cs) => cs.map((c) =>
      c.stage.id === from.stage.id ? { ...c, leads: c.leads.filter((l) => l.id !== leadId), total: c.total - 1 }
      : c.stage.id === toStageId ? { ...c, leads: [lead, ...c.leads], total: c.total + 1 } : c));
    setError(undefined);
    start(async () => {
      const res = await moveLeadStage({ leadId, stageId: toStageId, ...extra });
      if (!res.ok) { setCols(snapshot); setError(res.message); } else router.refresh();
    });
  };

  return (
    <>
      {error && <div className="mb-3"><FormAlert>{error}</FormAlert></div>}
      {needsDetail && (
        <div role="dialog" aria-modal="true" aria-labelledby="detail-h" className="mb-4 rounded-xl border border-stone-300 bg-white p-4 shadow-[var(--shadow-lift)]">
          <h2 id="detail-h" className="font-sans text-base font-semibold text-navy-900">
            {needsDetail.kind === 'lost' ? 'Why was this lead lost?' : 'Brokerage received (₹)'}
          </h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="detail-input">{needsDetail.kind === 'lost' ? 'Lost reason' : 'Brokerage amount'}</label>
            <Input id="detail-input" autoFocus value={detail} onChange={(e) => setDetail(e.target.value)} className="max-w-sm"
              inputMode={needsDetail.kind === 'won' ? 'numeric' : undefined}
              placeholder={needsDetail.kind === 'lost' ? 'e.g. Bought elsewhere' : 'Leave empty to add later'} />
            <Button size="sm" disabled={needsDetail.kind === 'lost' && !detail.trim()} onClick={() => {
              const d = needsDetail; setNeedsDetail(null);
              move(d.leadId, d.stageId, d.kind === 'lost' ? { lostReason: detail.trim() } : { brokerageAmount: detail.trim() });
            }}>Move</Button>
            <Button size="sm" variant="ghost" onClick={() => setNeedsDetail(null)}>Cancel</Button>
          </div>
        </div>
      )}
      <div className="relative flex gap-4 overflow-x-auto pb-4" aria-busy={pending}>
        {cols.map((c) => (
          <section
            key={c.stage.id}
            aria-label={c.stage.name}
            onDragOver={(e) => { if (dragging) e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); setDragging(null); if (id) move(id, c.stage.id); }}
            className={`flex w-72 shrink-0 flex-col rounded-xl border bg-stone-100 ${dragging ? 'border-dashed border-navy-600/40' : 'border-stone-200'}`}
          >
            <header className="flex items-center justify-between px-3 py-2.5">
              <h2 className="font-sans text-sm font-semibold text-navy-900">{c.stage.name}</h2>
              <span className="rounded-full bg-white px-2 text-xs font-semibold text-stone-600">{c.total}</span>
            </header>
            <ul className="flex min-h-24 flex-col gap-2 px-2 pb-2">
              {c.leads.map((l) => (
                <li
                  key={l.id}
                  draggable={movable(l)}
                  onDragStart={(e) => { e.dataTransfer.setData('text/plain', l.id); setDragging(l.id); }}
                  onDragEnd={() => setDragging(null)}
                  className={`rounded-lg border border-stone-200 bg-white p-3 shadow-sm ${movable(l) ? 'cursor-grab active:cursor-grabbing' : ''} ${dragging === l.id ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/dashboard/leads/${l.id}`} className="text-sm font-semibold text-navy-900 hover:underline">{l.full_name}</Link>
                    {l.effective_category && <Badge tone={CATEGORY_TONE[l.effective_category]}>{CATEGORY_LABEL[l.effective_category]}</Badge>}
                  </div>
                  <p className="mt-1 truncate text-xs text-stone-600">{l.localities_text || 'No locality'}{l.budget_max ? ` · up to ${formatINR(l.budget_max)}` : ''}</p>
                  <p className="mt-1 text-xs text-stone-500">{l.assignee_name ?? 'Unassigned'} · follow-up {relative(l.next_follow_up_at)}</p>
                  {movable(l) && (
                    <>
                      <label className="sr-only" htmlFor={`mv-${l.id}`}>Move {l.full_name} to</label>
                      <select id={`mv-${l.id}`} value="" onChange={(e) => e.target.value && move(l.id, e.target.value)}
                        className="mt-2 h-8 w-full rounded-md border border-stone-200 bg-stone-100 px-1.5 text-xs">
                        <option value="">Move to…</option>
                        {cols.filter((o) => o.stage.id !== c.stage.id).map((o) => <option key={o.stage.id} value={o.stage.id}>{o.stage.name}</option>)}
                      </select>
                    </>
                  )}
                </li>
              ))}
              {c.total > c.leads.length && (
                <li className="px-1 text-xs text-stone-500">
                  + {c.total - c.leads.length} more · <Link className="underline" href={`/dashboard/leads?stage=${c.stage.id}`}>view all</Link>
                </li>
              )}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
