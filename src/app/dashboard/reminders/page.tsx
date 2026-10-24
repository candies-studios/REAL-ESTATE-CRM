import Link from 'next/link';
import { fmtDateTime } from '@/components/dashboard/format';
import { PageHeader } from '@/components/dashboard/page-header';
import { MarkAllRead } from '@/components/dashboard/reminders';
import { Card } from '@/components/ui/card';
import { requireMembership } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Reminders' };
export const dynamic = 'force-dynamic';

export default async function RemindersPage() {
  const { user, membership } = await requireMembership();
  const supabase = await createClient();
  const { data } = await supabase.from('notification_logs')
    .select('id, title, body, link, read_at, created_at')
    .eq('org_id', membership.orgId).eq('recipient_id', user.id).eq('channel', 'in_app')
    .order('created_at', { ascending: false }).limit(100);
  const unread = (data ?? []).filter((n) => !n.read_at).length;

  return (
    <>
      <PageHeader title="Reminders" description="New tasks, due-today reminders, escalations and assignments for you."
        actions={unread > 0 && <MarkAllRead />} />
      <Card className="overflow-hidden">
        <ul className="divide-y divide-stone-200">
          {(data ?? []).length === 0 && <li className="p-8 text-center text-stone-600">No reminders yet.</li>}
          {(data ?? []).map((n) => (
            <li key={n.id} className={`flex flex-wrap items-start justify-between gap-3 px-5 py-3.5 ${n.read_at ? '' : 'bg-gold-100/40'}`}>
              <div>
                <p className={`text-sm ${n.read_at ? 'text-stone-700' : 'font-semibold text-navy-900'}`}>{n.title}</p>
                {n.body && <p className="text-sm text-stone-600">{n.body}</p>}
                <p className="text-xs text-stone-500">{fmtDateTime(n.created_at)}</p>
              </div>
              {n.link && <Link href={n.link} className="text-sm font-semibold text-navy-800 underline">Open</Link>}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
