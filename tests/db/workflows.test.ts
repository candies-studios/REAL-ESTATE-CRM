/**
 * Business-logic tests: public enquiries, scoring, matching, CRM rules,
 * site visits, automation and reports. Uses its own organization and
 * synthetic people so it can share the database with rls.test.ts.
 */
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const db = new Client({ connectionString: process.env.TEST_DATABASE_URL });
type Row = Record<string, unknown>;

async function as<T = Row>(uid: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.query('begin');
  try {
    if (uid) {
      await db.query('set local role authenticated');
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
    } else {
      await db.query('set local role anon');
    }
    const res = await db.query(sql, params);
    await db.query('commit');
    return res.rows as T[];
  } catch (err) {
    await db.query('rollback');
    throw err;
  }
}
const admin = async <T = Row>(sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as T[];
const one = async <T = Row>(sql: string, params: unknown[] = []) => (await admin<T>(sql, params))[0];

async function createUser(email: string, name: string) {
  return (await one<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data) values ($1, jsonb_build_object('full_name', $2::text)) returning id`,
    [email, name])).id;
}

const submit = (payload: Row) =>
  as<{ r: { ok: boolean; reference: string } }>(null, `select public.submit_enquiry($1::jsonb) as r`, [JSON.stringify(payload)]);

let owner: string, adminU: string, broker1: string, broker2: string, viewer: string;
let org: string, p1: string, p2: string;

beforeAll(async () => {
  await db.connect();
  owner = await createUser('wf.owner@example.test', 'Meera Owner');
  adminU = await createUser('wf.admin@example.test', 'Rohan Admin');
  broker1 = await createUser('wf.broker1@example.test', 'Kiran Broker');
  broker2 = await createUser('wf.broker2@example.test', 'Neha Broker');
  viewer = await createUser('wf.viewer@example.test', 'Om Viewer');
  org = (await as<{ id: string }>(owner, `select public.create_organization('Seawoods Realty') as id`))[0].id;
  for (const [email, role] of [['wf.admin@example.test', 'admin'], ['wf.broker1@example.test', 'broker'],
    ['wf.broker2@example.test', 'broker'], ['wf.viewer@example.test', 'viewer']]) {
    await as(owner, `select public.add_member_by_email($1, $2, $3::app_role)`, [org, email, role]);
  }
  p1 = (await as<{ id: string }>(owner,
    `insert into properties (org_id, ref_code, title, transaction_type, category, property_type, configuration,
       locality, price, carpet_area, amenities, possession_status, status, is_published, last_verified_at)
     values ($1, 'KHR-201', 'Test 2 BHK near Central Park', 'sale', 'residential', 'Apartment', '2 BHK',
       'Kharghar', 9500000, 780, '{Lift,Parking,Gym}', 'ready_to_move', 'available', true, now())
     returning id`, [org]))[0].id;
  p2 = (await as<{ id: string }>(owner,
    `insert into properties (org_id, ref_code, title, transaction_type, category, property_type, configuration,
       locality, price, status, is_published, last_verified_at)
     values ($1, 'VSH-301', 'Test 1 BHK for rent', 'rent', 'residential', 'Apartment', '1 BHK',
       'Vashi', 32000, 'available', true, now() - interval '60 days') returning id`, [org]))[0].id;
});

afterAll(async () => { await db.end(); });

describe('public enquiry intake', () => {
  let leadId: string;

  it('creates a scored, assigned lead with consent, tasks and matches from a property enquiry', async () => {
    const [{ r }] = await submit({
      org_id: org, kind: 'property', property_id: p1, full_name: 'Test Buyer Ananya', phone: '98200 11111',
      email: 'ananya@example.test', preferred_contact: 'whatsapp', wants_site_visit: true,
      budget_min: 8000000, budget_max: 10000000, timeline_days: 20, consent: true,
      consent_text: 'I agree to be contacted', marketing_consent: false, channels: ['phone', 'whatsapp'],
    });
    expect(r.ok).toBe(true);
    expect(r.reference).toMatch(/^[0-9A-F]{8}$/);

    const lead = await one<Row>(`select * from leads where org_id=$1 and phone_normalized='+919820011111'`, [org]);
    leadId = lead.id as string;
    expect(lead.score).toBe(100);
    expect(lead.category).toBe('hot');
    expect((lead.score_breakdown as Row[]).length).toBe(6);
    expect([broker1, broker2]).toContain(lead.assigned_to);
    expect(lead.intent).toBe('buyer');

    const tasks = await admin<Row>(`select type, assigned_to from tasks where lead_id=$1`, [leadId]);
    expect(tasks.map((t) => t.type)).toContain('first_contact');
    expect(tasks[0].assigned_to).toBe(lead.assigned_to);

    const consent = await admin<Row>(`select purpose, granted, channels from consent_records where lead_id=$1 order by purpose`, [leadId]);
    expect(consent.map((c) => [c.purpose, c.granted])).toEqual([['enquiry_response', true], ['marketing', false]]);

    const matches = await admin<Row>(`select property_id, score, reasons from lead_property_matches where lead_id=$1`, [leadId]);
    expect(matches[0].property_id).toBe(p1);
    expect(matches[0].reasons).toEqual(expect.arrayContaining(['Within budget', 'Preferred locality: Kharghar']));
  });

  it('does not let the visitor read anything back', async () => {
    await expect(as(null, `select * from leads`)).rejects.toThrow(/permission denied/);
  });

  it('attaches a repeat enquiry from the same mobile to the existing lead', async () => {
    await submit({ org_id: org, kind: 'buyer', full_name: 'Ananya T', phone: '+91 9820011111', consent: true, localities: ['Seawoods'] });
    const leads = await admin(`select id from leads where org_id=$1 and phone_normalized='+919820011111'`, [org]);
    expect(leads).toHaveLength(1);
    const acts = await admin<Row>(`select type from lead_activities where lead_id=$1`, [leadId]);
    expect(acts.map((a) => a.type)).toContain('repeat_enquiry');
    const pref = await one<{ localities: string[] }>(`select localities from lead_preferences where lead_id=$1`, [leadId]);
    expect(pref.localities.sort()).toEqual(['Kharghar', 'Seawoods']);
  });

  it.each([
    [{ consent: false }, /consent is required/],
    [{ phone: '12345' }, /valid mobile/],
    [{ full_name: 'A' }, /full name/],
    [{ email: 'not-an-email' }, /valid email/],
    [{ org_id: '00000000-0000-0000-0000-000000000000' }, /not accepted/],
  ])('rejects invalid input %#', async (override, msg) => {
    await expect(submit({ org_id: org, kind: 'buyer', full_name: 'Valid Name', phone: '9820099999', consent: true, ...override }))
      .rejects.toThrow(msg);
  });

  it('refuses enquiries for unpublished properties', async () => {
    const draft = (await as<{ id: string }>(owner,
      `insert into properties (org_id, ref_code, title, transaction_type, category, property_type, locality)
       values ($1, 'DRF-1', 'Draft listing', 'sale', 'residential', 'Apartment', 'Ulwe') returning id`, [org]))[0].id;
    await expect(submit({ org_id: org, kind: 'property', property_id: draft, full_name: 'Someone', phone: '9820088888', consent: true }))
      .rejects.toThrow(/no longer available/);
  });

  it('rate-limits repeated submissions from one mobile number', async () => {
    const base = { org_id: org, kind: 'buyer', full_name: 'Spam Tester', phone: '9820077777', consent: true };
    for (let i = 0; i < 5; i++) await submit(base);
    await expect(submit(base)).rejects.toThrow(/too many enquiries/);
  });

  it('turns an owner submission into an unpublished draft listing with a review task', async () => {
    await submit({ org_id: org, kind: 'landlord', full_name: 'Test Landlord', phone: '9820066666', consent: true,
      locality: 'Nerul', property_type_single: 'Apartment', configuration: '2 BHK', expected_price: 40000 });
    const prop = await one<Row>(`select * from properties where org_id=$1 and listing_source='owner_submission'`, [org]);
    expect(prop.status).toBe('draft');
    expect(prop.is_published).toBe(false);
    expect(prop.transaction_type).toBe('rent');
    const lead = await one<Row>(`select id, intent from leads where phone_normalized='+919820066666'`);
    expect(lead.intent).toBe('landlord');
    expect(await admin(`select id from tasks where lead_id=$1 and type='listing_review'`, [lead.id])).toHaveLength(1);
  });
});

describe('CRM rules', () => {
  let lead: string;
  let assignee: string;

  beforeAll(async () => {
    lead = (await one<{ id: string }>(`select id from leads where phone_normalized='+919820011111'`)).id;
    assignee = (await one<{ assigned_to: string }>(`select assigned_to from leads where id=$1`, [lead])).assigned_to;
  });

  it('logging a call records first contact, advances the stage and schedules a follow-up', async () => {
    await as(assignee, `insert into lead_activities (org_id, lead_id, actor_id, type, body) values ($1, $2, $3, 'call', 'Spoke, wants weekend visit')`,
      [org, lead, assignee]);
    const l = await one<Row>(`select l.first_contacted_at, s.key from leads l join pipeline_stages s on s.id=l.stage_id where l.id=$1`, [lead]);
    expect(l.first_contacted_at).not.toBeNull();
    expect(l.key).toBe('contacted');
    const fc = await one<Row>(`select status from tasks where lead_id=$1 and type='first_contact'`, [lead]);
    expect(fc.status).toBe('done');
    expect(await admin(`select id from tasks where lead_id=$1 and type='follow_up' and status='open'`, [lead])).toHaveLength(1);
  });

  it('records when a lead first becomes qualified', async () => {
    await as(assignee, `update leads set stage_id = public.stage_id_for($1, 'qualified') where id=$2`, [org, lead]);
    expect((await one<Row>(`select qualified_at from leads where id=$1`, [lead])).qualified_at).not.toBeNull();
  });

  it('schedules a site visit with confirmation and reminder tasks, and blocks double-booking', async () => {
    const start = new Date(Date.now() + 3 * 86_400_000).toISOString();
    await as(assignee, `insert into site_visits (org_id, lead_id, property_id, broker_id, starts_at, duration_min, meeting_point)
                        values ($1, $2, $3, $4, $5, 60, 'Project sales office')`, [org, lead, p1, assignee, start]);
    const types = (await admin<Row>(`select type from tasks where lead_id=$1 and site_visit_id is not null`, [lead])).map((t) => t.type);
    expect(types).toEqual(expect.arrayContaining(['visit_confirm', 'visit_reminder']));
    expect((await one<Row>(`select s.key from leads l join pipeline_stages s on s.id=l.stage_id where l.id=$1`, [lead])).key)
      .toBe('visit_scheduled');
    const overlap = new Date(Date.parse(start) + 30 * 60_000).toISOString();
    await expect(as(assignee, `insert into site_visits (org_id, lead_id, broker_id, starts_at) values ($1, $2, $3, $4)`,
      [org, lead, assignee, overlap])).rejects.toThrow(/already has a visit/);
  });

  it('marking a visit attended completes visit tasks, advances the stage and creates a follow-up', async () => {
    const v = await one<{ id: string }>(`select id from site_visits where lead_id=$1`, [lead]);
    await as(assignee, `update site_visits set status='attended', outcome_notes='Liked it, discussing price' where id=$1`, [v.id]);
    const open = await admin<Row>(`select type from tasks where site_visit_id=$1 and status='open'`, [v.id]);
    expect(open.map((t) => t.type)).toEqual(['follow_up']);
    expect((await one<Row>(`select s.key from leads l join pipeline_stages s on s.id=l.stage_id where l.id=$1`, [lead])).key)
      .toBe('visit_completed');
  });

  it('moving to negotiation creates a negotiation task', async () => {
    await as(assignee, `update leads set stage_id = public.stage_id_for($1, 'negotiation') where id=$2`, [org, lead]);
    expect(await admin(`select id from tasks where lead_id=$1 and type='negotiation' and status='open'`, [lead])).toHaveLength(1);
  });

  it('requires a reason to mark a lead lost, then stops its follow-ups', async () => {
    const other = (await one<{ id: string; assigned_to: string }>(`select id, assigned_to from leads where phone_normalized='+919820077777'`));
    await expect(as(owner, `update leads set stage_id = public.stage_id_for($1, 'lost') where id=$2`, [org, other.id]))
      .rejects.toThrow(/lost reason is required/);
    await as(owner, `update leads set stage_id = public.stage_id_for($1, 'lost'), lost_reason='Bought elsewhere' where id=$2`, [org, other.id]);
    expect(await admin(`select id from tasks where lead_id=$1 and status in ('open','snoozed')`, [other.id])).toHaveLength(0);
  });

  it('marking won records the date and cancels open tasks', async () => {
    await as(adminU, `update leads set stage_id = public.stage_id_for($1, 'won'), deal_value=9300000, brokerage_amount=186000 where id=$2`, [org, lead]);
    const l = await one<Row>(`select won_at from leads where id=$1`, [lead]);
    expect(l.won_at).not.toBeNull();
    expect(await admin(`select id from tasks where lead_id=$1 and status='open'`, [lead])).toHaveLength(0);
  });

  it('owners can merge duplicates; brokers cannot', async () => {
    const keep = (await as<{ id: string }>(owner,
      `insert into leads (org_id, full_name, phone_normalized, assigned_to) values ($1, 'Test Dup Keep', '+919820055555', $2) returning id`,
      [org, broker1]))[0].id;
    const dup = (await as<{ id: string }>(owner,
      `insert into leads (org_id, full_name, phone_normalized, email, assigned_to) values ($1, 'Test Dup', '+919820055555', 'dup@example.test', $2) returning id`,
      [org, broker1]))[0].id;
    const found = await as<{ id: string }>(owner, `select id from public.find_duplicate_leads($1)`, [keep]);
    expect(found.map((f) => f.id)).toContain(dup);
    await expect(as(broker1, `select public.merge_leads($1, $2)`, [keep, dup])).rejects.toThrow(/only owners and admins/);
    await as(owner, `select public.merge_leads($1, $2)`, [keep, dup]);
    const merged = await one<Row>(`select duplicate_of from leads where id=$1`, [dup]);
    expect(merged.duplicate_of).toBe(keep);
    expect((await one<Row>(`select email from leads where id=$1`, [keep])).email).toBe('dup@example.test');
    expect(await admin(`select id from audit_logs where action='lead.merged' and entity_id=$1`, [keep])).toHaveLength(1);
  });

  it('brokers only see their own leads in lead_list', async () => {
    const rows = await as<{ assigned_to: string }>(broker1, `select assigned_to from lead_list where org_id=$1`, [org]);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.assigned_to === broker1)).toBe(true);
  });
});

describe('listings', () => {
  it('cannot be published before being verified', async () => {
    await expect(as(owner,
      `insert into properties (org_id, ref_code, title, transaction_type, category, property_type, locality, status, is_published)
       values ($1, 'NV-1', 'Unverified', 'sale', 'residential', 'Apartment', 'Ulwe', 'available', true)`, [org]))
      .rejects.toThrow(/verify the listing/);
  });

  it('sold listings are unpublished automatically', async () => {
    await as(owner, `update properties set status='sold' where id=$1`, [p2]);
    expect((await one<Row>(`select is_published from properties where id=$1`, [p2])).is_published).toBe(false);
    await as(owner, `update properties set status='available', is_published=true where id=$1`, [p2]);
  });
});

describe('scheduled automation', () => {
  it('escalates overdue tasks, prompts visit outcomes, flags stale listings — and is idempotent', async () => {
    const l = (await as<{ id: string }>(owner,
      `insert into leads (org_id, full_name, phone_normalized, assigned_to) values ($1, 'Test Overdue Lead', '+919820044444', $2) returning id`,
      [org, broker2]))[0].id;
    await admin(`insert into tasks (org_id, lead_id, assigned_to, title, due_at) values ($1, $2, $3, 'Send brochure', now() - interval '2 days')`, [org, l, broker2]);
    await admin(`update leads set created_at = now() - interval '2 days' where id=$1`, [l]);
    // a visit that already happened with no outcome recorded
    await admin(`insert into site_visits (org_id, lead_id, broker_id, starts_at) values ($1, $2, $3, now() - interval '3 hours')`, [org, l, broker2]);

    const first = (await one<{ r: Row }>(`select public.run_automation() as r`)).r;
    expect(first.escalated).toBeGreaterThan(0);
    expect(first.visit_outcome_tasks).toBeGreaterThan(0);
    expect(first.reverify_tasks).toBeGreaterThan(0); // p2 was verified 60 days ago

    const escalations = await admin(`select id from notification_logs where org_id=$1 and dedupe_key like 'in_app:%:escalate:%'`, [org]);
    expect(escalations.length).toBeGreaterThanOrEqual(2); // owner + admin
    expect(await admin(`select id from notification_logs where org_id=$1 and channel='email' and status='queued'`, [org])).not.toHaveLength(0);

    const counts = async () => (await one<{ t: number; n: number }>(
      `select (select count(*)::int from tasks where org_id=$1) t, (select count(*)::int from notification_logs where org_id=$1) n`, [org]));
    const before = await counts();
    const second = (await one<{ r: Row }>(`select public.run_automation() as r`)).r;
    expect(second.escalated).toBe(0);
    expect(second.visit_outcome_tasks).toBe(0);
    expect(second.reverify_tasks).toBe(0);
    expect(await counts()).toEqual(before);
  });

  it('reopens snoozed tasks when their time comes', async () => {
    const t = await one<{ id: string }>(`select id from tasks where org_id=$1 and status='open' limit 1`, [org]);
    await admin(`update tasks set status='snoozed', snoozed_until = now() - interval '1 minute' where id=$1`, [t.id]);
    await admin(`select public.run_automation()`);
    expect((await one<Row>(`select status from tasks where id=$1`, [t.id])).status).toBe('open');
  });

  it('only owners/admins can trigger it from the app; nobody can call the raw job', async () => {
    await expect(as(broker1, `select public.run_my_automation($1)`, [org])).rejects.toThrow(/only owners and admins/);
    expect((await as<{ r: Row }>(adminU, `select public.run_my_automation($1) as r`, [org]))[0].r).toHaveProperty('escalated');
    await expect(as(owner, `select public.run_automation()`)).rejects.toThrow(/permission denied/);
    await expect(as(null, `select public.run_automation()`)).rejects.toThrow(/permission denied/);
  });

  it('users read and mark only their own reminders', async () => {
    const mine = await as<{ id: string; recipient_id: string }>(broker2, `select id, recipient_id from notification_logs where channel='in_app'`);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((n) => n.recipient_id === broker2)).toBe(true);
    const marked = await as(broker2, `update notification_logs set read_at = now() where id=$1 returning id`, [mine[0].id]);
    expect(marked).toHaveLength(1);
    await expect(as(broker2, `update notification_logs set title='hacked' where id=$1`, [mine[0].id])).rejects.toThrow(/permission denied/);
  });
});

describe('settings and reports', () => {
  it('validates settings and lets only owners/admins change them', async () => {
    await expect(as(broker1, `select public.update_org_settings($1, '{"scoring":{"hot_min":80,"warm_min":50}}')`, [org]))
      .rejects.toThrow(/only owners and admins/);
    await expect(as(owner, `select public.update_org_settings($1, '{"scoring":{"hot_min":40,"warm_min":50}}')`, [org]))
      .rejects.toThrow(/hot threshold/);
    await as(owner, `select public.update_org_settings($1, '{"scoring":{"hot_min":80,"warm_min":50},"automation":{"first_contact_minutes":30}}')`, [org]);
    const s = await one<{ settings: { scoring: Row; automation: Row } }>(`select settings from organizations where id=$1`, [org]);
    expect(s.settings.scoring.hot_min).toBe(80);
    expect(s.settings.scoring.budget_match).toBe(25); // untouched keys are kept
    expect(s.settings.automation.first_contact_minutes).toBe(30);
  });

  it('report_summary returns defined metrics for managers and refuses brokers', async () => {
    const from = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const to = new Date(Date.now() + 7 * 86_400_000).toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = (await as<{ r: Record<string, any> }>(viewer, `select public.report_summary($1, $2, $3) as r`, [org, from, to]))[0].r;
    expect(r.new_leads).toBeGreaterThan(0);
    expect(r.by_stage).toHaveLength(12);
    expect(r.won.count).toBe(1);
    expect(Number(r.won.recorded_revenue)).toBe(186000);
    expect(r.qualified.denominator).toBe(r.new_leads);
    expect(r.visit_conversion).toEqual({ numerator: 1, denominator: 1 });
    expect(r.brokers.length).toBeGreaterThan(0);
    await expect(as(broker1, `select public.report_summary($1, $2, $3)`, [org, from, to])).rejects.toThrow(/reports are available/);
  });
});
