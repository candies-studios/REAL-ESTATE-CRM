import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { emailConfigured, sendEmail } from '@/lib/notify/email';
import { siteUrl, supabaseUrl } from '@/lib/supabase/env';

export const dynamic = 'force-dynamic';

/**
 * Scheduled job: runs the database automation, then delivers queued reminder
 * emails. Call with `Authorization: Bearer <CRON_SECRET>` (Vercel Cron does
 * this automatically when CRON_SECRET is set).
 *
 * Safe to retry: run_automation is idempotent, and each email row is claimed
 * (queued → sending) before delivery so overlapping runs don't double-send.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || !supabaseUrl) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured' }, { status: 503 });
  }
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: automation, error } = await db.rpc('run_automation');
  if (error) return NextResponse.json({ error: 'Automation failed', detail: error.message }, { status: 500 });

  const { data: queued } = await db.from('notification_logs')
    .select('id, title, body, link, recipient_id').eq('channel', 'email').eq('status', 'queued')
    .order('created_at').limit(100);

  const results = { sent: 0, skipped: 0, failed: 0 };
  const configured = emailConfigured();
  const ids = (queued ?? []).map((q) => q.recipient_id).filter(Boolean) as string[];
  const { data: profiles } = ids.length ? await db.from('profiles').select('id, email').in('id', ids) : { data: [] };
  const emailOf = new Map((profiles ?? []).map((p) => [p.id as string, p.email as string | null]));

  for (const n of queued ?? []) {
    // Claim the row so a concurrent run can't send it too.
    const { data: claimed } = await db.from('notification_logs').update({ status: 'sending' }).eq('id', n.id).eq('status', 'queued').select('id');
    if (!claimed?.length) continue;
    const to = n.recipient_id ? emailOf.get(n.recipient_id) : null;
    if (!configured || !to) {
      await db.from('notification_logs').update({ status: 'skipped', error: configured ? 'Recipient has no email' : 'Email provider not configured' }).eq('id', n.id);
      results.skipped++;
      continue;
    }
    const text = [n.body, n.link ? `Open: ${siteUrl}${n.link}` : null, '—', 'You receive this because you are on the team in the brokerage workspace.'].filter(Boolean).join('\n\n');
    const r = await sendEmail(to, n.title ?? 'Reminder', text);
    if (r.status === 'sent') {
      await db.from('notification_logs').update({ status: 'sent', provider_ref: r.id }).eq('id', n.id);
      results.sent++;
    } else {
      await db.from('notification_logs').update({ status: r.status, error: r.status === 'failed' ? r.error : r.reason }).eq('id', n.id);
      results[r.status === 'failed' ? 'failed' : 'skipped']++;
    }
  }
  return NextResponse.json({ automation, email: results, ranAt: new Date().toISOString() });
}
