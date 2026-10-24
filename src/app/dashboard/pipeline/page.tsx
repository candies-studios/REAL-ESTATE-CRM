import { PipelineBoard, type BoardLead } from '@/components/dashboard/pipeline-board';
import { PageHeader } from '@/components/dashboard/page-header';
import { requireMembership } from '@/lib/auth';
import { getStages } from '@/lib/crm';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Pipeline' };
export const dynamic = 'force-dynamic';

const PER_STAGE = 50;

export default async function PipelinePage() {
  const { user, membership } = await requireMembership();
  const supabase = await createClient();
  const stages = (await getStages(membership.orgId)).filter((s) => s.is_active);

  // One query per stage keeps each column bounded; RLS limits brokers to their own leads.
  const columns = await Promise.all(stages.map(async (s) => {
    const { data, count } = await supabase.from('lead_list')
      .select('id, full_name, effective_category, score, assignee_name, assigned_to, next_follow_up_at, localities_text, budget_max', { count: 'exact' })
      .eq('org_id', membership.orgId).eq('stage_id', s.id).is('duplicate_of', null)
      .order('next_follow_up_at', { ascending: true, nullsFirst: false })
      .limit(PER_STAGE);
    return { stage: { id: s.id, name: s.name, isWon: s.is_won, isLost: s.is_lost }, leads: (data ?? []) as BoardLead[], total: count ?? 0 };
  }));

  const canMoveAll = membership.role === 'owner' || membership.role === 'admin';
  return (
    <>
      <PageHeader title="Pipeline" description="Drag a card to another stage, or use “Move to” on the card. Moves are checked on the server." />
      <PipelineBoard columns={columns} canMove={membership.role !== 'viewer'} canMoveAll={canMoveAll} userId={user.id} />
    </>
  );
}
