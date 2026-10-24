/**
 * Database security tests. Run with `npm run test:db` (see scripts/test-db.sh),
 * which applies supabase/migrations to a throwaway Postgres first.
 *
 * Each helper call runs inside a transaction as the Supabase `authenticated`
 * (or `anon`) role with a JWT subject, exactly how PostgREST executes requests.
 */
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const url = process.env.TEST_DATABASE_URL;
const db = new Client({ connectionString: url });

type Row = Record<string, unknown>;

async function as<T = Row>(
  uid: string | null,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
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

async function admin<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await db.query(sql, params);
  return res.rows as T[];
}

async function createUser(email: string, fullName: string): Promise<string> {
  const [row] = await admin<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data)
     values ($1, jsonb_build_object('full_name', $2::text)) returning id`,
    [email, fullName],
  );
  return row.id;
}

let ownerA: string, adminA: string, brokerA: string, broker2A: string, viewerA: string, ownerB: string;
let orgA: string, orgB: string;
let stageNewA: string, stageQualifiedA: string, stageNewB: string;
let leadA1: string, leadA2: string, leadB1: string;

beforeAll(async () => {
  if (!url) throw new Error('TEST_DATABASE_URL is not set; run `npm run test:db`.');
  await db.connect();

  ownerA = await createUser('owner.a@example.test', 'Asha Owner');
  adminA = await createUser('admin.a@example.test', 'Arjun Admin');
  brokerA = await createUser('broker.a@example.test', 'Bina Broker');
  broker2A = await createUser('broker2.a@example.test', 'Biren Broker');
  viewerA = await createUser('viewer.a@example.test', 'Vani Viewer');
  ownerB = await createUser('owner.b@example.test', 'Bharat Owner');

  [{ id: orgA }] = await as<{ id: string }>(ownerA, `select public.create_organization('Harbour Homes') as id`);
  [{ id: orgB }] = await as<{ id: string }>(ownerB, `select public.create_organization('Rival Realty') as id`);

  await as(ownerA, `select public.add_member_by_email($1, 'admin.a@example.test', 'admin')`, [orgA]);
  await as(ownerA, `select public.add_member_by_email($1, 'broker.a@example.test', 'broker')`, [orgA]);
  await as(ownerA, `select public.add_member_by_email($1, 'broker2.a@example.test', 'broker')`, [orgA]);
  await as(ownerA, `select public.add_member_by_email($1, 'viewer.a@example.test', 'viewer')`, [orgA]);

  [{ id: stageNewA }] = await admin(`select id from pipeline_stages where org_id=$1 and key='new_enquiry'`, [orgA]) as { id: string }[];
  [{ id: stageQualifiedA }] = await admin(`select id from pipeline_stages where org_id=$1 and key='qualified'`, [orgA]) as { id: string }[];
  [{ id: stageNewB }] = await admin(`select id from pipeline_stages where org_id=$1 and key='new_enquiry'`, [orgB]) as { id: string }[];

  [{ id: leadA1 }] = await as<{ id: string }>(ownerA,
    `insert into leads (org_id, full_name, phone_normalized, stage_id, assigned_to, source)
     values ($1, 'Test Buyer One', '+919800000001', $2, $3, 'website') returning id`,
    [orgA, stageNewA, brokerA]);
  [{ id: leadA2 }] = await as<{ id: string }>(ownerA,
    `insert into leads (org_id, full_name, phone_normalized, stage_id, assigned_to)
     values ($1, 'Test Buyer Two', '+919800000002', $2, $3) returning id`,
    [orgA, stageNewA, broker2A]);
  [{ id: leadB1 }] = await as<{ id: string }>(ownerB,
    `insert into leads (org_id, full_name, phone_normalized, stage_id)
     values ($1, 'Rival Lead', '+919800000099', $2) returning id`,
    [orgB, stageNewB]);
});

afterAll(async () => {
  await db.end();
});

describe('organization setup', () => {
  it('seeds the 12 default pipeline stages in order', async () => {
    const rows = await as<{ key: string }>(ownerA,
      `select key from pipeline_stages where org_id=$1 order by position`, [orgA]);
    expect(rows.map((r) => r.key)).toEqual([
      'new_enquiry', 'contact_pending', 'contacted', 'qualified', 'property_shared',
      'visit_scheduled', 'visit_completed', 'negotiation', 'booking', 'won', 'lost', 'nurture',
    ]);
  });

  it('makes the creator the owner and creates a profile automatically', async () => {
    const [role] = await as<{ role: string }>(ownerA,
      `select role from user_roles where org_id=$1 and user_id=$2`, [orgA, ownerA]);
    expect(role.role).toBe('owner');
    const [p] = await as<{ full_name: string }>(ownerA, `select full_name from profiles where id=$1`, [ownerA]);
    expect(p.full_name).toBe('Asha Owner');
  });

  it('allows only one organization per creator', async () => {
    await expect(as(ownerA, `select public.create_organization('Second Org')`)).rejects.toThrow(/already created/);
  });

  it('rejects create_organization without a signed-in user', async () => {
    await expect(as(null, `select public.create_organization('Anon Org')`)).rejects.toThrow(/permission denied/);
  });
});

describe('cross-organization isolation', () => {
  it('owner of org A cannot see org B or its leads', async () => {
    expect(await as(ownerA, `select id from organizations where id=$1`, [orgB])).toHaveLength(0);
    expect(await as(ownerA, `select id from leads where id=$1`, [leadB1])).toHaveLength(0);
    expect(await as(ownerA, `select id from pipeline_stages where org_id=$1`, [orgB])).toHaveLength(0);
  });

  it('cannot insert a lead into another organization by changing org_id', async () => {
    await expect(as(ownerA,
      `insert into leads (org_id, full_name, phone_normalized) values ($1, 'Injected', '+919811111111')`,
      [orgB])).rejects.toThrow(/row-level security/);
  });

  it('cannot attach own-org records to another org’s lead or stage', async () => {
    await expect(as(ownerA,
      `insert into lead_activities (org_id, lead_id, type, body) values ($1, $2, 'note', 'x')`,
      [orgA, leadB1])).rejects.toThrow(/different organization|row-level security/);
    await expect(as(ownerA,
      `insert into leads (org_id, full_name, phone_normalized, stage_id) values ($1, 'X', '+919822222222', $2)`,
      [orgA, stageNewB])).rejects.toThrow(/different organization/);
  });

  it('cannot assign work to someone outside the organization', async () => {
    await expect(as(ownerA, `update leads set assigned_to=$2 where id=$1`, [leadA1, ownerB]))
      .rejects.toThrow(/not a member/);
  });

  it('cannot move a record to another organization', async () => {
    await expect(as(ownerA, `update leads set org_id=$2 where id=$1`, [leadA1, orgB]))
      .rejects.toThrow(/row-level security|cannot be changed/);
  });

  it('cannot see profiles of people in other organizations', async () => {
    expect(await as(ownerA, `select id from profiles where id=$1`, [ownerB])).toHaveLength(0);
    expect(await as(ownerA, `select id from profiles where id=$1`, [brokerA])).toHaveLength(1);
  });
});

describe('role permissions', () => {
  it('broker sees only leads assigned to them', async () => {
    const rows = await as<{ id: string }>(brokerA, `select id from leads where org_id=$1`, [orgA]);
    expect(rows.map((r) => r.id)).toEqual([leadA1]);
  });

  it('broker can update their own lead but not reassign it or override its score', async () => {
    const updated = await as(brokerA,
      `update leads set next_follow_up_at = now() + interval '1 day', stage_id=$2 where id=$1 returning id`,
      [leadA1, stageQualifiedA]);
    expect(updated).toHaveLength(1);
    await expect(as(brokerA, `update leads set assigned_to=$2 where id=$1`, [leadA1, broker2A]))
      .rejects.toThrow(/cannot reassign|row-level security/);
    await expect(as(brokerA,
      `update leads set score_override='hot', override_reason='gut feel' where id=$1`, [leadA1]))
      .rejects.toThrow(/cannot override/);
  });

  it('broker cannot touch a colleague’s lead', async () => {
    const updated = await as(brokerA, `update leads set lost_reason='x' where id=$1 returning id`, [leadA2]);
    expect(updated).toHaveLength(0);
    await expect(as(brokerA,
      `insert into lead_activities (org_id, lead_id, type, body) values ($1, $2, 'note', 'x')`,
      [orgA, leadA2])).rejects.toThrow(/row-level security/);
  });

  it('broker can create leads only for themselves', async () => {
    await expect(as(brokerA,
      `insert into leads (org_id, full_name, phone_normalized, assigned_to) values ($1, 'Walk-in', '+919833333333', $2)`,
      [orgA, broker2A])).rejects.toThrow(/row-level security/);
    const ok = await as(brokerA,
      `insert into leads (org_id, full_name, phone_normalized, assigned_to) values ($1, 'Walk-in', '+919833333334', $2) returning id`,
      [orgA, brokerA]);
    expect(ok).toHaveLength(1);
  });

  it('broker reads inventory but cannot change it', async () => {
    await as(ownerA,
      `insert into properties (org_id, ref_code, title, transaction_type, category, property_type, locality, status)
       values ($1, 'KHR-001', 'Test 2 BHK in Kharghar', 'sale', 'residential', 'apartment', 'Kharghar', 'draft')`, [orgA]);
    expect(await as(brokerA, `select id from properties where org_id=$1`, [orgA])).toHaveLength(1);
    const changed = await as(brokerA, `update properties set price=1 where org_id=$1 returning id`, [orgA]);
    expect(changed).toHaveLength(0);
  });

  it('viewer can read everything in the org but change nothing', async () => {
    expect((await as(viewerA, `select id from leads where org_id=$1`, [orgA])).length).toBeGreaterThanOrEqual(2);
    const changed = await as(viewerA, `update leads set lost_reason='x' where org_id=$1 returning id`, [orgA]);
    expect(changed).toHaveLength(0);
    await expect(as(viewerA,
      `insert into leads (org_id, full_name, phone_normalized) values ($1, 'V', '+919844444444')`, [orgA]))
      .rejects.toThrow(/row-level security/);
  });

  it('admin can manage leads and reassign them', async () => {
    const rows = await as(adminA, `update leads set assigned_to=$2 where id=$1 returning id`, [leadA2, brokerA]);
    expect(rows).toHaveLength(1);
    await as(adminA, `update leads set assigned_to=$2 where id=$1`, [leadA2, broker2A]);
  });
});

describe('team management', () => {
  it('admin can add brokers but not owners or admins', async () => {
    const extra = await createUser('extra.a@example.test', 'Ekta Extra');
    await expect(as(adminA, `select public.add_member_by_email($1, 'extra.a@example.test', 'admin')`, [orgA]))
      .rejects.toThrow(/only owners/);
    await as(adminA, `select public.add_member_by_email($1, 'extra.a@example.test', 'broker')`, [orgA]);
    const [r] = await admin<{ role: string }>(`select role from user_roles where org_id=$1 and user_id=$2`, [orgA, extra]);
    expect(r.role).toBe('broker');
  });

  it('brokers cannot add members', async () => {
    await expect(as(brokerA, `select public.add_member_by_email($1, 'owner.b@example.test', 'broker')`, [orgA]))
      .rejects.toThrow(/only owners and admins/);
  });

  it('nobody can edit user_roles directly', async () => {
    const rows = await as(ownerA, `update user_roles set role='owner' where user_id=$1 returning id`, [brokerA]);
    expect(rows).toHaveLength(0);
    await expect(as(brokerA, `insert into user_roles (org_id, user_id, role) values ($1, $2, 'owner')`, [orgB, brokerA]))
      .rejects.toThrow(/row-level security/);
  });

  it('an organization always keeps at least one owner', async () => {
    await expect(as(ownerA, `select public.set_member_role($1, $2, 'admin')`, [orgA, ownerA]))
      .rejects.toThrow(/at least one owner/);
    await expect(as(ownerA, `select public.remove_member($1, $2)`, [orgA, ownerA]))
      .rejects.toThrow(/at least one owner/);
  });

  it('owner of another org cannot manage this org’s team', async () => {
    await expect(as(ownerB, `select public.remove_member($1, $2)`, [orgA, brokerA]))
      .rejects.toThrow(/only owners and admins/);
  });
});

describe('public visitors (anon)', () => {
  it('cannot read any CRM table', async () => {
    for (const t of ['leads', 'properties', 'tasks', 'user_roles', 'consent_records', 'audit_logs']) {
      await expect(as(null, `select * from ${t} limit 1`)).rejects.toThrow(/permission denied/);
    }
  });

  it('sees only published, live listings via public_properties, without private fields', async () => {
    await as(ownerA,
      `insert into properties (org_id, ref_code, title, transaction_type, category, property_type, locality,
         status, is_published, address_private, internal_notes, is_demo)
       values ($1, 'VSH-101', 'Demo 3 BHK in Vashi', 'sale', 'residential', 'apartment', 'Vashi',
         'available', true, 'Flat 1203, Secret Towers', 'owner wants quick sale', true),
              ($1, 'VSH-102', 'Unpublished listing', 'sale', 'residential', 'apartment', 'Vashi',
         'available', false, null, null, true),
              ($1, 'VSH-103', 'Sold listing', 'sale', 'residential', 'apartment', 'Vashi',
         'sold', true, null, null, true)`, [orgA]);
    const rows = await as<Row>(null, `select * from public_properties`);
    expect(rows.map((r) => r.ref_code)).toEqual(['VSH-101']);
    expect(rows[0]).not.toHaveProperty('address_private');
    expect(rows[0]).not.toHaveProperty('internal_notes');
    expect(rows[0].is_demo).toBe(true);
  });

  it('cannot call membership functions', async () => {
    await expect(as(null, `select public.add_member_by_email($1, 'x@example.test', 'owner')`, [orgA]))
      .rejects.toThrow(/permission denied/);
  });
});

describe('audit trail and idempotency', () => {
  it('records stage changes and reassignments, readable by owners only', async () => {
    const logs = await as<{ action: string }>(ownerA,
      `select action from audit_logs where entity_id=$1 order by id`, [leadA1]);
    expect(logs.map((l) => l.action)).toEqual(expect.arrayContaining(['lead.created', 'lead.stage_changed']));
    expect(await as(brokerA, `select id from audit_logs`)).toHaveLength(0);
    await expect(as(ownerA,
      `insert into audit_logs (org_id, action, entity) values ($1, 'fake', 'lead')`, [orgA]))
      .rejects.toThrow(/permission denied/);
  });

  it('dedupe_key prevents duplicate automated tasks', async () => {
    const insert = `insert into tasks (org_id, lead_id, assigned_to, title, due_at, dedupe_key)
                    values ($1, $2, $3, 'First contact', now(), $4)`;
    const key = `first_contact:${leadA1}`;
    await as(ownerA, insert, [orgA, leadA1, brokerA, key]);
    await expect(as(ownerA, insert, [orgA, leadA1, brokerA, key])).rejects.toThrow(/duplicate key/);
  });

  it('broker sees tasks for their leads, not a colleague’s', async () => {
    await as(ownerA,
      `insert into tasks (org_id, lead_id, assigned_to, title, due_at) values ($1, $2, $3, 'Call back', now())`,
      [orgA, leadA2, broker2A]);
    const mine = await as<{ lead_id: string }>(brokerA, `select lead_id from tasks where org_id=$1`, [orgA]);
    expect(mine.every((t) => t.lead_id === leadA1)).toBe(true);
  });
});
