-- =============================================================================
-- Phase 1 — security: helper functions, integrity triggers, Row Level Security,
-- membership RPCs and audit logging.
--
-- Role model (per organization):
--   owner   full access, manages owners/admins
--   admin   manages inventory, leads, assignments, brokers/viewers
--   broker  sees and works only leads assigned to them; reads org inventory
--   viewer  read-only access to the organization's records
--
-- Public (anon) visitors get NO direct table access. Public listings are read
-- through the public_properties view; public enquiries arrive via an RPC
-- added in Phase 2.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so policies don't recurse through RLS)
-- ---------------------------------------------------------------------------
create or replace function public.current_role_in(p_org uuid)
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.user_roles
  where org_id = p_org and user_id = auth.uid();
$$;

create or replace function public.is_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where org_id = p_org and user_id = auth.uid()
  );
$$;

create or replace function public.has_role(p_org uuid, p_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_role_in(p_org) = any (p_roles), false);
$$;

-- Can the current user see this lead? Owners/admins/viewers: any lead in their
-- org. Brokers: only leads assigned to them.
create or replace function public.can_access_lead(p_lead uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.leads l
    join public.user_roles r on r.org_id = l.org_id and r.user_id = auth.uid()
    where l.id = p_lead
      and (r.role in ('owner', 'admin', 'viewer') or l.assigned_to = auth.uid())
  );
$$;

-- Can the current user modify this lead (and its child records)?
create or replace function public.can_edit_lead(p_lead uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.leads l
    join public.user_roles r on r.org_id = l.org_id and r.user_id = auth.uid()
    where l.id = p_lead
      and (r.role in ('owner', 'admin') or (r.role = 'broker' and l.assigned_to = auth.uid()))
  );
$$;

revoke all on function public.current_role_in(uuid), public.is_member(uuid),
  public.has_role(uuid, public.app_role[]), public.can_access_lead(uuid),
  public.can_edit_lead(uuid) from public, anon;
grant execute on function public.current_role_in(uuid), public.is_member(uuid),
  public.has_role(uuid, public.app_role[]), public.can_access_lead(uuid),
  public.can_edit_lead(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Integrity: related records must belong to the same organization.
-- (Stops someone in org A attaching their rows to org B's leads/properties.)
-- ---------------------------------------------------------------------------
create or replace function public.enforce_same_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  j jsonb := to_jsonb(new);
begin
  if j ? 'lead_id' and (j ->> 'lead_id') is not null then
    select org_id into v_org from public.leads where id = (j ->> 'lead_id')::uuid;
    if v_org is distinct from new.org_id then
      raise exception 'lead belongs to a different organization' using errcode = '42501';
    end if;
  end if;
  if j ? 'property_id' and (j ->> 'property_id') is not null then
    select org_id into v_org from public.properties where id = (j ->> 'property_id')::uuid;
    if v_org is distinct from new.org_id then
      raise exception 'property belongs to a different organization' using errcode = '42501';
    end if;
  end if;
  if j ? 'site_visit_id' and (j ->> 'site_visit_id') is not null then
    select org_id into v_org from public.site_visits where id = (j ->> 'site_visit_id')::uuid;
    if v_org is distinct from new.org_id then
      raise exception 'site visit belongs to a different organization' using errcode = '42501';
    end if;
  end if;
  if j ? 'stage_id' and (j ->> 'stage_id') is not null then
    select org_id into v_org from public.pipeline_stages where id = (j ->> 'stage_id')::uuid;
    if v_org is distinct from new.org_id then
      raise exception 'stage belongs to a different organization' using errcode = '42501';
    end if;
  end if;
  if j ? 'campaign_id' and (j ->> 'campaign_id') is not null then
    select org_id into v_org from public.campaigns where id = (j ->> 'campaign_id')::uuid;
    if v_org is distinct from new.org_id then
      raise exception 'campaign belongs to a different organization' using errcode = '42501';
    end if;
  end if;
  if j ? 'duplicate_of' and (j ->> 'duplicate_of') is not null then
    select org_id into v_org from public.leads where id = (j ->> 'duplicate_of')::uuid;
    if v_org is distinct from new.org_id then
      raise exception 'duplicate lead belongs to a different organization' using errcode = '42501';
    end if;
  end if;
  -- People assigned to work must be members of the organization.
  if j ? 'assigned_to' and (j ->> 'assigned_to') is not null then
    if not exists (select 1 from public.user_roles
                   where org_id = new.org_id and user_id = (j ->> 'assigned_to')::uuid) then
      raise exception 'assignee is not a member of this organization' using errcode = '42501';
    end if;
  end if;
  if j ? 'broker_id' and (j ->> 'broker_id') is not null then
    if not exists (select 1 from public.user_roles
                   where org_id = new.org_id and user_id = (j ->> 'broker_id')::uuid) then
      raise exception 'broker is not a member of this organization' using errcode = '42501';
    end if;
  end if;
  if j ? 'assigned_broker' and (j ->> 'assigned_broker') is not null then
    if not exists (select 1 from public.user_roles
                   where org_id = new.org_id and user_id = (j ->> 'assigned_broker')::uuid) then
      raise exception 'broker is not a member of this organization' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- org_id itself must never move between organizations.
create or replace function public.prevent_org_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.org_id is distinct from old.org_id then
    raise exception 'org_id cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'leads','lead_preferences','property_enquiries','lead_property_matches',
    'lead_activities','site_visits','tasks','consent_records','property_media',
    'properties'
  ] loop
    execute format(
      'create trigger %I_same_org before insert or update on public.%I
         for each row execute function public.enforce_same_org()', t, t);
  end loop;
  foreach t in array array[
    'user_roles','pipeline_stages','campaigns','properties','property_media','leads',
    'lead_preferences','property_enquiries','lead_property_matches','lead_activities',
    'site_visits','tasks','consent_records','notification_logs'
  ] loop
    execute format(
      'create trigger %I_no_org_change before update on public.%I
         for each row execute function public.prevent_org_change()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Profiles are created automatically for every new auth user.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, nullif(new.raw_user_meta_data ->> 'full_name', ''), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Audit logging (written by triggers/RPCs only; never editable by clients)
-- ---------------------------------------------------------------------------
create or replace function public.write_audit(
  p_org uuid, p_action text, p_entity text, p_entity_id uuid, p_data jsonb default '{}'
) returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (org_id, actor_id, action, entity, entity_id, data)
  values (p_org, auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_data, '{}'));
$$;
revoke all on function public.write_audit(uuid, text, text, uuid, jsonb) from public, anon, authenticated;

create or replace function public.audit_lead_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit(new.org_id, 'lead.created', 'lead', new.id,
      jsonb_build_object('source', new.source, 'assigned_to', new.assigned_to));
  elsif tg_op = 'UPDATE' then
    if new.stage_id is distinct from old.stage_id then
      perform public.write_audit(new.org_id, 'lead.stage_changed', 'lead', new.id,
        jsonb_build_object('from', old.stage_id, 'to', new.stage_id));
    end if;
    if new.assigned_to is distinct from old.assigned_to then
      perform public.write_audit(new.org_id, 'lead.reassigned', 'lead', new.id,
        jsonb_build_object('from', old.assigned_to, 'to', new.assigned_to));
    end if;
    if new.score_override is distinct from old.score_override then
      perform public.write_audit(new.org_id, 'lead.score_overridden', 'lead', new.id,
        jsonb_build_object('from', old.score_override, 'to', new.score_override,
                           'reason', new.override_reason));
    end if;
  elsif tg_op = 'DELETE' then
    -- Skip when the whole organization is being deleted (cascade).
    if exists (select 1 from public.organizations where id = old.org_id) then
      perform public.write_audit(old.org_id, 'lead.deleted', 'lead', old.id,
        jsonb_build_object('full_name', old.full_name));
    end if;
    return old;
  end if;
  return new;
end;
$$;

create trigger leads_audit
  after insert or update or delete on public.leads
  for each row execute function public.audit_lead_changes();

-- Brokers may update their own leads but may not reassign them or change
-- scoring overrides; only owners/admins can.
create or replace function public.guard_broker_lead_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_role_in(new.org_id) = 'broker' then
    if new.assigned_to is distinct from old.assigned_to then
      raise exception 'brokers cannot reassign leads' using errcode = '42501';
    end if;
    if new.score_override is distinct from old.score_override
       or new.override_reason is distinct from old.override_reason then
      raise exception 'brokers cannot override lead scores' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger leads_guard_broker
  before update on public.leads
  for each row execute function public.guard_broker_lead_update();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'organizations','profiles','user_roles','pipeline_stages','campaigns','properties',
    'property_media','leads','lead_preferences','property_enquiries',
    'lead_property_matches','lead_activities','site_visits','tasks',
    'consent_records','notification_logs','audit_logs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    -- Visitors never touch tables directly.
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- organizations
create policy org_select on public.organizations for select to authenticated
  using (public.is_member(id));
create policy org_update on public.organizations for update to authenticated
  using (public.has_role(id, '{owner}')) with check (public.has_role(id, '{owner}'));
-- (insert/delete happen through create_organization / support processes only)

-- profiles: see yourself and teammates; edit only yourself
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.user_roles mine
      join public.user_roles theirs on theirs.org_id = mine.org_id
      where mine.user_id = auth.uid() and theirs.user_id = profiles.id
    )
  );
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- user_roles: members can see the team; changes only through RPCs below
create policy user_roles_select on public.user_roles for select to authenticated
  using (public.is_member(org_id));

-- pipeline_stages, campaigns: everyone in the org reads; owner/admin write
create policy stages_select on public.pipeline_stages for select to authenticated
  using (public.is_member(org_id));
create policy stages_write on public.pipeline_stages for all to authenticated
  using (public.has_role(org_id, '{owner,admin}'))
  with check (public.has_role(org_id, '{owner,admin}'));

create policy campaigns_select on public.campaigns for select to authenticated
  using (public.is_member(org_id));
create policy campaigns_write on public.campaigns for all to authenticated
  using (public.has_role(org_id, '{owner,admin}'))
  with check (public.has_role(org_id, '{owner,admin}'));

-- properties & media: org members read inventory; owner/admin manage it
create policy properties_select on public.properties for select to authenticated
  using (public.is_member(org_id));
create policy properties_write on public.properties for all to authenticated
  using (public.has_role(org_id, '{owner,admin}'))
  with check (public.has_role(org_id, '{owner,admin}'));

create policy media_select on public.property_media for select to authenticated
  using (public.is_member(org_id));
create policy media_write on public.property_media for all to authenticated
  using (public.has_role(org_id, '{owner,admin}'))
  with check (public.has_role(org_id, '{owner,admin}'));

-- leads
create policy leads_select on public.leads for select to authenticated
  using (
    public.has_role(org_id, '{owner,admin,viewer}')
    or (public.has_role(org_id, '{broker}') and assigned_to = auth.uid())
  );
create policy leads_insert on public.leads for insert to authenticated
  with check (
    public.has_role(org_id, '{owner,admin}')
    or (public.has_role(org_id, '{broker}') and assigned_to = auth.uid())
  );
create policy leads_update on public.leads for update to authenticated
  using (
    public.has_role(org_id, '{owner,admin}')
    or (public.has_role(org_id, '{broker}') and assigned_to = auth.uid())
  )
  with check (
    public.has_role(org_id, '{owner,admin}')
    or (public.has_role(org_id, '{broker}') and assigned_to = auth.uid())
  );
create policy leads_delete on public.leads for delete to authenticated
  using (public.has_role(org_id, '{owner,admin}'));

-- Lead child records follow the parent lead's access rules.
do $$
declare t text;
begin
  foreach t in array array[
    'lead_preferences','property_enquiries','lead_property_matches',
    'lead_activities','consent_records'
  ] loop
    execute format(
      'create policy %I_select on public.%I for select to authenticated
         using (public.can_access_lead(lead_id))', t, t);
    execute format(
      'create policy %I_insert on public.%I for insert to authenticated
         with check (public.can_edit_lead(lead_id))', t, t);
  end loop;
  -- Preferences and matches are editable; activities and consent are append-only.
  foreach t in array array['lead_preferences','property_enquiries','lead_property_matches'] loop
    execute format(
      'create policy %I_update on public.%I for update to authenticated
         using (public.can_edit_lead(lead_id)) with check (public.can_edit_lead(lead_id))', t, t);
    execute format(
      'create policy %I_delete on public.%I for delete to authenticated
         using (public.has_role(org_id, ''{owner,admin}''))', t, t);
  end loop;
end $$;

-- site visits
create policy visits_select on public.site_visits for select to authenticated
  using (public.can_access_lead(lead_id) or broker_id = auth.uid() and public.is_member(org_id));
create policy visits_insert on public.site_visits for insert to authenticated
  with check (public.can_edit_lead(lead_id));
create policy visits_update on public.site_visits for update to authenticated
  using (public.can_edit_lead(lead_id) or (broker_id = auth.uid() and public.has_role(org_id, '{broker}')))
  with check (public.can_edit_lead(lead_id) or (broker_id = auth.uid() and public.has_role(org_id, '{broker}')));
create policy visits_delete on public.site_visits for delete to authenticated
  using (public.has_role(org_id, '{owner,admin}'));

-- tasks
create policy tasks_select on public.tasks for select to authenticated
  using (
    public.has_role(org_id, '{owner,admin,viewer}')
    or (public.has_role(org_id, '{broker}')
        and (assigned_to = auth.uid() or (lead_id is not null and public.can_access_lead(lead_id))))
  );
create policy tasks_insert on public.tasks for insert to authenticated
  with check (
    public.has_role(org_id, '{owner,admin}')
    or (public.has_role(org_id, '{broker}') and assigned_to = auth.uid()
        and (lead_id is null or public.can_edit_lead(lead_id)))
  );
create policy tasks_update on public.tasks for update to authenticated
  using (
    public.has_role(org_id, '{owner,admin}')
    or (public.has_role(org_id, '{broker}') and assigned_to = auth.uid())
  )
  with check (
    public.has_role(org_id, '{owner,admin}')
    or (public.has_role(org_id, '{broker}') and assigned_to = auth.uid())
  );
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.has_role(org_id, '{owner,admin}'));

-- notification & audit logs: owners/admins read; nobody writes directly
create policy notif_select on public.notification_logs for select to authenticated
  using (public.has_role(org_id, '{owner,admin}'));
create policy audit_select on public.audit_logs for select to authenticated
  using (public.has_role(org_id, '{owner,admin}'));
revoke insert, update, delete on public.audit_logs, public.notification_logs from authenticated;

-- ---------------------------------------------------------------------------
-- Public listings view: only published, live listings, only safe columns.
-- (Runs with the view owner's rights so anon needs no access to the table.)
-- ---------------------------------------------------------------------------
create view public.public_properties
with (security_barrier = true)
as
select
  p.id, p.org_id, p.ref_code, p.title, p.transaction_type, p.category,
  p.property_type, p.configuration, p.locality, p.city, p.project_name,
  p.public_location, p.price, p.price_on_request, p.carpet_area, p.area_unit,
  p.furnishing, p.possession_status, p.possession_date, p.amenities,
  p.description, p.status, p.is_demo, p.last_verified_at,
  p.rera_number, p.rera_project_name, p.updated_at,
  (select m.storage_path from public.property_media m
    where m.property_id = p.id order by m.is_cover desc, m.position limit 1) as cover_path
from public.properties p
where p.is_published and p.status in ('available', 'reserved');

grant select on public.public_properties to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Membership RPCs
-- ---------------------------------------------------------------------------

-- Create an organization; the caller becomes its owner and gets default stages.
create or replace function public.create_organization(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_name is null or char_length(trim(p_name)) < 2 then
    raise exception 'organization name is too short' using errcode = '22023';
  end if;
  -- One brokerage per creator keeps sign-up abuse in check; owners can still be
  -- invited into other organizations.
  if exists (select 1 from public.organizations where created_by = v_uid) then
    raise exception 'you have already created an organization' using errcode = '23505';
  end if;

  insert into public.organizations (name, created_by) values (trim(p_name), v_uid)
  returning id into v_org;

  insert into public.user_roles (org_id, user_id, role) values (v_org, v_uid, 'owner');

  insert into public.pipeline_stages (org_id, key, name, position, is_won, is_lost) values
    (v_org, 'new_enquiry',        'New Enquiry',                      1, false, false),
    (v_org, 'contact_pending',    'Contact Pending',                  2, false, false),
    (v_org, 'contacted',          'Contacted',                        3, false, false),
    (v_org, 'qualified',          'Qualified',                        4, false, false),
    (v_org, 'property_shared',    'Property Shared',                  5, false, false),
    (v_org, 'visit_scheduled',    'Site Visit Scheduled',             6, false, false),
    (v_org, 'visit_completed',    'Site Visit Completed',             7, false, false),
    (v_org, 'negotiation',        'Negotiation',                      8, false, false),
    (v_org, 'booking',            'Booking or Agreement in Progress', 9, false, false),
    (v_org, 'won',                'Won',                             10, true,  false),
    (v_org, 'lost',               'Lost',                            11, false, true),
    (v_org, 'nurture',            'Nurture / Follow Up Later',       12, false, false);

  perform public.write_audit(v_org, 'org.created', 'organization', v_org,
    jsonb_build_object('name', trim(p_name)));
  return v_org;
end;
$$;

-- Add an existing user (they must have signed up) to the organization by email.
create or replace function public.add_member_by_email(p_org uuid, p_email text, p_role public.app_role)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller public.app_role := public.current_role_in(p_org);
  v_user uuid;
begin
  if v_caller is null or v_caller not in ('owner', 'admin') then
    raise exception 'only owners and admins can add members' using errcode = '42501';
  end if;
  if v_caller = 'admin' and p_role in ('owner', 'admin') then
    raise exception 'only owners can add owners or admins' using errcode = '42501';
  end if;

  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'no account with that email yet; ask them to sign up first' using errcode = 'P0002';
  end if;

  insert into public.user_roles (org_id, user_id, role) values (p_org, v_user, p_role)
  on conflict (org_id, user_id) do nothing;
  if not found then
    raise exception 'that person is already a member' using errcode = '23505';
  end if;

  perform public.write_audit(p_org, 'member.added', 'user', v_user, jsonb_build_object('role', p_role));
  return v_user;
end;
$$;

create or replace function public.set_member_role(p_org uuid, p_user uuid, p_role public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller public.app_role := public.current_role_in(p_org);
  v_current public.app_role;
begin
  select role into v_current from public.user_roles where org_id = p_org and user_id = p_user;
  if v_current is null then
    raise exception 'not a member' using errcode = 'P0002';
  end if;
  if v_caller is null or v_caller not in ('owner', 'admin') then
    raise exception 'only owners and admins can change roles' using errcode = '42501';
  end if;
  if v_caller = 'admin' and (v_current in ('owner', 'admin') or p_role in ('owner', 'admin')) then
    raise exception 'only owners can change owner or admin roles' using errcode = '42501';
  end if;
  if v_current = 'owner' and p_role <> 'owner'
     and (select count(*) from public.user_roles where org_id = p_org and role = 'owner') = 1 then
    raise exception 'an organization must keep at least one owner' using errcode = '42501';
  end if;

  update public.user_roles set role = p_role where org_id = p_org and user_id = p_user;
  perform public.write_audit(p_org, 'member.role_changed', 'user', p_user,
    jsonb_build_object('from', v_current, 'to', p_role));
end;
$$;

create or replace function public.remove_member(p_org uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller public.app_role := public.current_role_in(p_org);
  v_current public.app_role;
begin
  select role into v_current from public.user_roles where org_id = p_org and user_id = p_user;
  if v_current is null then
    raise exception 'not a member' using errcode = 'P0002';
  end if;
  if v_caller is null or v_caller not in ('owner', 'admin') then
    raise exception 'only owners and admins can remove members' using errcode = '42501';
  end if;
  if v_caller = 'admin' and v_current in ('owner', 'admin') then
    raise exception 'only owners can remove owners or admins' using errcode = '42501';
  end if;
  if v_current = 'owner'
     and (select count(*) from public.user_roles where org_id = p_org and role = 'owner') = 1 then
    raise exception 'an organization must keep at least one owner' using errcode = '42501';
  end if;

  delete from public.user_roles where org_id = p_org and user_id = p_user;
  perform public.write_audit(p_org, 'member.removed', 'user', p_user,
    jsonb_build_object('role', v_current));
end;
$$;

revoke all on function public.create_organization(text),
  public.add_member_by_email(uuid, text, public.app_role),
  public.set_member_role(uuid, uuid, public.app_role),
  public.remove_member(uuid, uuid) from public, anon;
grant execute on function public.create_organization(text),
  public.add_member_by_email(uuid, text, public.app_role),
  public.set_member_role(uuid, uuid, public.app_role),
  public.remove_member(uuid, uuid) to authenticated;

-- Internal trigger functions should not be callable as RPCs.
revoke all on function public.set_updated_at(), public.enforce_same_org(),
  public.prevent_org_change(), public.handle_new_user(), public.audit_lead_changes(),
  public.guard_broker_lead_update() from public, anon, authenticated;
