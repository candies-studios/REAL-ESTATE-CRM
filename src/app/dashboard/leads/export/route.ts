import { NextResponse, type NextRequest } from 'next/server';
import { getActiveMembership, getUser } from '@/lib/auth';
import { buildLeadQuery, parseLeadParams } from '@/lib/crm';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';

const COLUMNS = [
  'full_name', 'phone', 'email', 'intent', 'source', 'stage_name', 'effective_category', 'score',
  'assignee_name', 'localities_text', 'budget_min', 'budget_max', 'next_follow_up_at', 'last_contacted_at',
  'created_at', 'won_at', 'deal_value', 'brokerage_amount',
] as const;

/** Escapes a CSV cell and neutralises spreadsheet formula injection. */
function cell(v: unknown) {
  if (v == null) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: NextRequest) {
  const user = await getUser();
  const membership = await getActiveMembership();
  if (!user || !membership) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!can(membership.role, 'export.csv')) return NextResponse.json({ error: 'Only owners and admins can export' }, { status: 403 });

  const params = parseLeadParams(Object.fromEntries(request.nextUrl.searchParams));
  const supabase = await createClient();
  const { data, error } = await buildLeadQuery(supabase, membership.orgId, params, { select: COLUMNS.join(',') }).limit(10000);
  if (error) return NextResponse.json({ error: 'Export failed' }, { status: 500 });

  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  await supabase.rpc('log_export', { p_org: membership.orgId, p_rows: rows.length, p_filters: params });

  const csv = [COLUMNS.join(','), ...rows.map((r) => COLUMNS.map((c) => cell(r[c])).join(','))].join('\n');
  return new NextResponse(`﻿${csv}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
