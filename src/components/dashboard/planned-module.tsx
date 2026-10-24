import { Card } from '@/components/ui/card';
import { PageHeader } from './page-header';

/** Honest placeholder for screens scheduled in a later build phase. */
export function PlannedModule({ title, phase, summary, features }: { title: string; phase: number; summary: string; features: string[] }) {
  return (
    <>
      <PageHeader title={title} description={summary} />
      <Card className="max-w-3xl p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-700">Arrives in Phase {phase}</p>
        <p className="mt-2 text-stone-700">The database tables and access rules for this screen are already in place. The screen itself will include:</p>
        <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-stone-700">
          {features.map((f) => <li key={f}>{f}</li>)}
        </ul>
      </Card>
    </>
  );
}
