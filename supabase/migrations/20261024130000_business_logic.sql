-- =============================================================================
-- Phases 2–6 — business logic
--   * organization settings (scoring rules, automation timings, working hours)
--   * public enquiry intake (validation, rate limits, duplicates, consent, auto-assign)
--   * transparent lead scoring and property matching
--   * CRM rules (stage transitions, merge, duplicate lookup, list view)
--   * site visits with conflict prevention
--   * event-driven automation + scheduled run_automation() job
--   * in-app notifications, reports
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Schema additions
-- ---------------------------------------------------------------------------
alter table public.organizations
  add column accepts_public_enquiries boolean not null default true,
  add column settings jsonb not null default '{
    "scoring": {
      "budget_match": 25, "locality_match": 20, "timeline_30d": 20,
      "valid_contact": 15, "specific_property": 10, "site_visit_request": 10,
      "hot_min": 75, "warm_min": 45
    },
    "automation": {
      "first_contact_minutes": 15, "follow_up_days": 2, "overdue_escalation_hours": 24,
      "visit_reminder_hours": 24, "negotiation_follow_up_days": 2,
      "post_visit_follow_up_days": 1, "stale_listing_days": 30,
      "work_start": "09:30", "work_end": "19:30", "auto_assign": true
    }
  }'::jsonb;

alter table public.leads
  add column do_not_contact      boolean not null default false,
  add column first_contacted_at  timestamptz,
  add column qualified_at        timestamptz,
  add column won_at              timestamptz,
  add column deal_value          numeric(14, 2) check (deal_value is null or deal_value >= 0),
  add column brokerage_amount    numeric(14, 2) check (brokerage_amount is null or brokerage_amount >= 0),
  add column expected_brokerage  numeric(14, 2) check (expected_brokerage is null or expected_brokerage >= 0);

alter table public.property_enquiries
  add column kind     text not null default 'property',  -- property, buyer, seller, landlord, tenant, contact
  add column channel  text not null default 'manual',    -- website, manual, portal...
  add column ip_hash  text,
  add column preferred_visit_date date;
create index property_enquiries_created_idx on public.property_enquiries (org_id, created_at desc);
create index property_enquiries_ip_idx on public.property_enquiries (ip_hash, created_at desc);

alter table public.tasks add column escalated_at timestamptz;

alter table public.notification_logs
  add column lead_id  uuid references public.leads (id) on delete cascade,
  add column title    text,
  add column body     text,
  add column link     text,
  add column read_at  timestamptz;
create index notification_logs_recipient_idx on public.notification_logs (recipient_id, channel, read_at, created_at desc);

-- Recipients read and mark their own in-app reminders as read.
create policy notif_select_own on public.notification_logs for select to authenticated
  using (recipient_id = auth.uid() and public.is_member(org_id));
grant update (read_at) on public.notification_logs to authenticated;
create policy notif_mark_read on public.notification_logs for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Small helpers
-- ---------------------------------------------------------------------------
create or replace function public.normalize_phone(p text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  raw text := regexp_replace(coalesce(p, ''), '[^0-9+]', '', 'g');
  d text;
begin
  d := ltrim(raw, '+');
  if left(d, 2) = '00' then d := substr(d, 3); end if;
  if length(d) = 11 and left(d, 1) = '0' then d := substr(d, 2); end if;
  if length(d) = 10 and d ~ '^[6-9]' then return '+91' || d; end if;
  if length(d) = 12 and left(d, 2) = '91' and substr(d, 3, 1) ~ '[6-9]' then return '+' || d; end if;
  if left(raw, 1) = '+' and length(d) between 8 and 15 then return '+' || d; end if;
  return null;
end;
$$;

create or replace function public.org_setting(p_org uuid, p_group text, p_key text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select settings -> p_group ->> p_key from public.organizations where id = p_org),
    jsonb_build_object(
      'budget_match', 25, 'locality_match', 20, 'timeline_30d', 20, 'valid_contact', 15,
      'specific_property', 10, 'site_visit_request', 10, 'hot_min', 75, 'warm_min', 45,
      'first_contact_minutes', 15, 'follow_up_days', 2, 'overdue_escalation_hours', 24,
      'visit_reminder_hours', 24, 'negotiation_follow_up_days', 2, 'post_visit_follow_up_days', 1,
      'stale_listing_days', 30, 'work_start', '09:30', 'work_end', '19:30', 'auto_assign', true
    ) ->> p_key
  );
$$;

create or replace function public.stage_id_for(p_org uuid, p_key text)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select id from public.pipeline_stages where org_id = p_org and key = p_key;
$$;

/** Moves a timestamp into the organization's working hours. */
create or replace function public.next_working_time(p_org uuid, p_ts timestamptz)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  tz text := coalesce((select timezone from public.organizations where id = p_org), 'Asia/Kolkata');
  ws time := public.org_setting(p_org, 'automation', 'work_start')::time;
  we time := public.org_setting(p_org, 'automation', 'work_end')::time;
  local_ts timestamp := p_ts at time zone tz;
  d date := local_ts::date;
begin
  if local_ts::time < ws then
    return (d + ws) at time zone tz;
  elsif local_ts::time > we then
    return ((d + 1) + ws) at time zone tz;
  end if;
  return p_ts;
end;
$$;

/** In-app (and optional email) notification, idempotent by dedupe key. */
create or replace function public.notify(
  p_org uuid, p_recipient uuid, p_dedupe text, p_title text, p_body text,
  p_link text default null, p_lead uuid default null, p_task uuid default null, p_email boolean default false
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_recipient is null then return; end if;
  insert into public.notification_logs (org_id, task_id, lead_id, channel, recipient_id, status, title, body, link, dedupe_key)
  values (p_org, p_task, p_lead, 'in_app', p_recipient, 'sent', p_title, p_body, p_link, 'in_app:' || p_recipient || ':' || p_dedupe)
  on conflict (org_id, dedupe_key) do nothing;
  if p_email then
    insert into public.notification_logs (org_id, task_id, lead_id, channel, recipient_id, status, title, body, link, dedupe_key)
    values (p_org, p_task, p_lead, 'email', p_recipient, 'queued', p_title, p_body, p_link, 'email:' || p_recipient || ':' || p_dedupe)
    on conflict (org_id, dedupe_key) do nothing;
  end if;
end;
$$;

/** Creates a task once (dedupe key) and notifies the assignee. Returns the task id or null. */
create or replace function public.create_task_once(
  p_org uuid, p_lead uuid, p_visit uuid, p_assignee uuid, p_title text, p_type text,
  p_due timestamptz, p_dedupe text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  insert into public.tasks (org_id, lead_id, site_visit_id, assigned_to, title, type, due_at, dedupe_key)
  values (p_org, p_lead, p_visit, p_assignee, p_title, p_type, p_due, p_dedupe)
  on conflict (org_id, dedupe_key) do nothing
  returning id into v_id;
  if v_id is not null then
    perform public.notify(p_org, p_assignee, 'task:' || v_id, 'New task: ' || p_title, null,
      case when p_lead is not null then '/dashboard/leads/' || p_lead else '/dashboard/tasks' end, p_lead, v_id);
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lead scoring (transparent, configurable, never uses personal characteristics)
-- ---------------------------------------------------------------------------
create or replace function public.compute_lead_score_internal(p_lead uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.leads;
  pref public.lead_preferences;
  breakdown jsonb := '[]';
  total int := 0;
  pts int;
  hot int; warm int;
begin
  select * into l from public.leads where id = p_lead;
  if not found then return null; end if;
  select * into pref from public.lead_preferences where lead_id = p_lead;

  -- Budget matches an available property
  pts := public.org_setting(l.org_id, 'scoring', 'budget_match')::int;
  if pref.budget_max is not null and exists (
    select 1 from public.properties p
    where p.org_id = l.org_id and p.status = 'available' and p.price is not null
      and p.price <= pref.budget_max
      and (pref.budget_min is null or p.price >= pref.budget_min * 0.8)
      and (pref.transaction_type is null or p.transaction_type = pref.transaction_type)
  ) then
    total := total + pts;
    breakdown := breakdown || jsonb_build_object('rule', 'budget_match', 'points', pts, 'reason', 'Budget fits at least one available property');
  else
    breakdown := breakdown || jsonb_build_object('rule', 'budget_match', 'points', 0,
      'reason', case when pref.budget_max is null then 'No budget provided' else 'No available property within budget' end);
  end if;

  -- Preferred locality matches inventory
  pts := public.org_setting(l.org_id, 'scoring', 'locality_match')::int;
  if coalesce(array_length(pref.localities, 1), 0) > 0 and exists (
    select 1 from public.properties p
    where p.org_id = l.org_id and p.status = 'available' and p.locality = any (pref.localities)
  ) then
    total := total + pts;
    breakdown := breakdown || jsonb_build_object('rule', 'locality_match', 'points', pts, 'reason', 'Inventory available in a preferred locality');
  else
    breakdown := breakdown || jsonb_build_object('rule', 'locality_match', 'points', 0,
      'reason', case when coalesce(array_length(pref.localities, 1), 0) = 0 then 'No preferred locality provided' else 'No available inventory in preferred localities' end);
  end if;

  -- Timeline within 30 days
  pts := public.org_setting(l.org_id, 'scoring', 'timeline_30d')::int;
  if pref.timeline_days is not null and pref.timeline_days <= 30 then
    total := total + pts;
    breakdown := breakdown || jsonb_build_object('rule', 'timeline_30d', 'points', pts, 'reason', 'Plans to move or buy within 30 days');
  else
    breakdown := breakdown || jsonb_build_object('rule', 'timeline_30d', 'points', 0,
      'reason', case when pref.timeline_days is null then 'No timeline provided' else 'Timeline is beyond 30 days' end);
  end if;

  -- Valid contact information
  pts := public.org_setting(l.org_id, 'scoring', 'valid_contact')::int;
  if l.phone_normalized is not null then
    total := total + pts;
    breakdown := breakdown || jsonb_build_object('rule', 'valid_contact', 'points', pts, 'reason', 'Valid mobile number');
  else
    breakdown := breakdown || jsonb_build_object('rule', 'valid_contact', 'points', 0, 'reason', 'No valid mobile number');
  end if;

  -- Specific property enquiry
  pts := public.org_setting(l.org_id, 'scoring', 'specific_property')::int;
  if exists (select 1 from public.property_enquiries e where e.lead_id = p_lead and e.property_id is not null and e.kind = 'property') then
    total := total + pts;
    breakdown := breakdown || jsonb_build_object('rule', 'specific_property', 'points', pts, 'reason', 'Enquired about a specific property');
  else
    breakdown := breakdown || jsonb_build_object('rule', 'specific_property', 'points', 0, 'reason', 'No specific property enquiry');
  end if;

  -- Explicit site-visit request
  pts := public.org_setting(l.org_id, 'scoring', 'site_visit_request')::int;
  if exists (select 1 from public.property_enquiries e where e.lead_id = p_lead and e.wants_site_visit) then
    total := total + pts;
    breakdown := breakdown || jsonb_build_object('rule', 'site_visit_request', 'points', pts, 'reason', 'Asked for a site visit');
  else
    breakdown := breakdown || jsonb_build_object('rule', 'site_visit_request', 'points', 0, 'reason', 'No site visit requested yet');
  end if;

  total := least(total, 100);
  hot := public.org_setting(l.org_id, 'scoring', 'hot_min')::int;
  warm := public.org_setting(l.org_id, 'scoring', 'warm_min')::int;

  update public.leads
     set score = total,
         category = case when total >= hot then 'hot' when total >= warm then 'warm' else 'cold' end::public.lead_category,
         score_breakdown = breakdown
   where id = p_lead;
  return total;
end;
$$;

-- ---------------------------------------------------------------------------
-- Property matching (ranked, with reasons)
-- ---------------------------------------------------------------------------
create or replace function public.compute_matches_internal(p_lead uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.leads;
  pref public.lead_preferences;
  stale_days int;
  n int;
begin
  select * into l from public.leads where id = p_lead;
  if not found then return 0; end if;
  select * into pref from public.lead_preferences where lead_id = p_lead;
  stale_days := public.org_setting(l.org_id, 'automation', 'stale_listing_days')::int;

  delete from public.lead_property_matches where lead_id = p_lead;
  if pref.lead_id is null or l.intent not in ('buyer', 'tenant', 'investor') then
    return 0;
  end if;

  with scored as (
    select p.id,
      -- budget (30)
      case
        when pref.budget_max is null or p.price is null then 0
        when p.price <= pref.budget_max and (pref.budget_min is null or p.price >= pref.budget_min * 0.8) then 30
        when p.price <= pref.budget_max * 1.10 then 15
        else 0 end as s_budget,
      -- locality (25)
      case when coalesce(array_length(pref.localities, 1), 0) > 0 and p.locality = any (pref.localities) then 25 else 0 end as s_loc,
      -- property type (15)
      case when coalesce(array_length(pref.property_types, 1), 0) > 0
             and lower(p.property_type) = any (select lower(x) from unnest(pref.property_types) x) then 15 else 0 end as s_type,
      -- configuration (10)
      case when coalesce(array_length(pref.configurations, 1), 0) > 0
             and lower(coalesce(p.configuration, '')) = any (select lower(x) from unnest(pref.configurations) x) then 10 else 0 end as s_conf,
      -- transaction (10) — a mismatch excludes the property below
      case when pref.transaction_type is null or p.transaction_type = pref.transaction_type then 10 else 0 end as s_tx,
      -- possession (5)
      case when pref.possession_pref is null or p.possession_status = pref.possession_pref then 5 else 0 end as s_poss,
      -- amenities (5, proportional)
      case when coalesce(array_length(pref.must_have_amenities, 1), 0) = 0 then 5
           else round(5.0 * (select count(*) from unnest(pref.must_have_amenities) a
                             where lower(a) = any (select lower(x) from unnest(p.amenities) x))
                      / array_length(pref.must_have_amenities, 1))::int end as s_amen,
      p.price, p.locality, p.property_type, p.configuration, p.last_verified_at
    from public.properties p
    where p.org_id = l.org_id
      and p.status = 'available'
      and (pref.transaction_type is null or p.transaction_type = pref.transaction_type)
      and (pref.category is null or p.category = pref.category)
  )
  insert into public.lead_property_matches (org_id, lead_id, property_id, score, reasons)
  select l.org_id, p_lead, s.id,
    least(100, s.s_budget + s.s_loc + s.s_type + s.s_conf + s.s_tx + s.s_poss + s.s_amen),
    to_jsonb(array_remove(array[
      case when s.s_budget = 30 then 'Within budget'
           when s.s_budget = 15 then 'Up to 10% over budget' else 'Outside budget' end,
      case when s.s_loc > 0 then 'Preferred locality: ' || s.locality end,
      case when s.s_type > 0 then 'Matches property type (' || s.property_type || ')' end,
      case when s.s_conf > 0 then 'Matches configuration (' || s.configuration || ')' end,
      case when s.s_poss > 0 and pref.possession_pref is not null then 'Matches possession preference' end,
      case when coalesce(array_length(pref.must_have_amenities, 1), 0) > 0 then
        'Has ' || (s.s_amen * 20) || '% of must-have amenities' end,
      case when s.last_verified_at is null or s.last_verified_at < now() - make_interval(days => stale_days)
        then 'Availability needs re-verification' end
    ], null))
  from scored s
  where s.s_budget + s.s_loc + s.s_type + s.s_conf + s.s_tx + s.s_poss + s.s_amen >= 40
  order by 4 desc
  limit 20;

  get diagnostics n = row_count;
  return n;
end;
$$;

-- Permission-checked wrappers for the app ("Recalculate" buttons).
create or replace function public.compute_lead_score(p_lead uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_edit_lead(p_lead) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return public.compute_lead_score_internal(p_lead);
end;
$$;

create or replace function public.compute_matches(p_lead uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_edit_lead(p_lead) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return public.compute_matches_internal(p_lead);
end;
$$;

-- Recalculate when requirements or enquiries change.
create or replace function public.on_preferences_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.compute_lead_score_internal(new.lead_id);
  perform public.compute_matches_internal(new.lead_id);
  return new;
end;
$$;
create trigger lead_preferences_rescore
  after insert or update on public.lead_preferences
  for each row execute function public.on_preferences_changed();

create or replace function public.on_enquiry_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.compute_lead_score_internal(new.lead_id);
  return new;
end;
$$;
create trigger property_enquiries_rescore
  after insert on public.property_enquiries
  for each row execute function public.on_enquiry_added();

-- ---------------------------------------------------------------------------
-- Pick a broker for a new lead: listing's broker, else least-loaded broker.
-- ---------------------------------------------------------------------------
create or replace function public.pick_assignee(p_org uuid, p_property uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.assigned_broker from public.properties p where p.id = p_property and p.org_id = p_org),
    case when public.org_setting(p_org, 'automation', 'auto_assign')::boolean then (
      select r.user_id
      from public.user_roles r
      left join public.leads l
        on l.assigned_to = r.user_id and l.org_id = p_org
       and l.stage_id not in (select id from public.pipeline_stages s where s.org_id = p_org and (s.is_won or s.is_lost))
      where r.org_id = p_org and r.role = 'broker'
      group by r.user_id, r.created_at
      order by count(l.id), r.created_at
      limit 1
    ) end
  );
$$;

-- ---------------------------------------------------------------------------
-- Public enquiry intake (website forms). Callable by anonymous visitors.
-- ---------------------------------------------------------------------------
create or replace function public.submit_enquiry(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := nullif(p ->> 'org_id', '')::uuid;
  v_kind text := coalesce(nullif(p ->> 'kind', ''), 'buyer');
  v_name text := trim(coalesce(p ->> 'full_name', ''));
  v_phone text := public.normalize_phone(p ->> 'phone');
  v_email text := nullif(lower(trim(coalesce(p ->> 'email', ''))), '');
  v_property uuid := nullif(p ->> 'property_id', '')::uuid;
  v_prop public.properties;
  v_intent public.lead_intent;
  v_lead uuid;
  v_existing public.leads;
  v_enquiry uuid;
  v_channels public.contact_method[];
  v_draft uuid;
  v_campaign uuid;
  v_ip text := nullif(p ->> 'ip_hash', '');
  arr_loc text[]; arr_types text[]; arr_conf text[]; arr_amen text[];
begin
  -- ---- validation ----
  if v_kind not in ('property', 'buyer', 'seller', 'landlord', 'tenant', 'contact', 'investor') then
    raise exception 'invalid enquiry type' using errcode = '22023';
  end if;
  if v_org is null or not exists (select 1 from public.organizations o where o.id = v_org and o.accepts_public_enquiries) then
    raise exception 'enquiries are not accepted' using errcode = '22023';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'enter your full name' using errcode = '22023';
  end if;
  if v_phone is null then
    raise exception 'enter a valid mobile number' using errcode = '22023';
  end if;
  if v_email is not null and v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'enter a valid email address' using errcode = '22023';
  end if;
  if coalesce((p ->> 'consent')::boolean, false) is not true then
    raise exception 'consent is required to respond to your enquiry' using errcode = '22023';
  end if;
  if char_length(coalesce(p ->> 'message', '')) > 2000 then
    raise exception 'message is too long' using errcode = '22023';
  end if;
  if v_property is not null then
    select * into v_prop from public.properties
     where id = v_property and org_id = v_org and is_published and status in ('available', 'reserved');
    if not found then raise exception 'that property is no longer available' using errcode = '22023'; end if;
  end if;

  -- ---- rate limits (abuse prevention) ----
  if (select count(*) from public.property_enquiries e join public.leads l on l.id = e.lead_id
       where l.org_id = v_org and l.phone_normalized = v_phone and e.channel = 'website'
         and e.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'too many enquiries, please try again later' using errcode = '54000';
  end if;
  if v_ip is not null and (select count(*) from public.property_enquiries e
       where e.ip_hash = v_ip and e.created_at > now() - interval '1 hour') >= 10 then
    raise exception 'too many enquiries, please try again later' using errcode = '54000';
  end if;
  if (select count(*) from public.property_enquiries e
       where e.org_id = v_org and e.channel = 'website' and e.created_at > now() - interval '10 minutes') >= 100 then
    raise exception 'too many enquiries, please try again later' using errcode = '54000';
  end if;

  v_intent := case v_kind
    when 'property' then case when v_prop.transaction_type in ('rent', 'lease') then 'tenant' else 'buyer' end
    when 'tenant' then 'tenant' when 'seller' then 'seller' when 'landlord' then 'landlord'
    when 'investor' then 'investor' else 'buyer' end::public.lead_intent;

  select array(select jsonb_array_elements_text(coalesce(p -> 'localities', '[]')))::text[] into arr_loc;
  select array(select jsonb_array_elements_text(coalesce(p -> 'property_types', '[]')))::text[] into arr_types;
  select array(select jsonb_array_elements_text(coalesce(p -> 'configurations', '[]')))::text[] into arr_conf;
  select array(select jsonb_array_elements_text(coalesce(p -> 'amenities', '[]')))::text[] into arr_amen;
  if v_prop.id is not null then
    arr_loc := array(select distinct x from unnest(arr_loc || v_prop.locality) x);
  end if;

  select array(select x::public.contact_method from jsonb_array_elements_text(coalesce(p -> 'channels', '["phone"]')) x
               where x in ('phone', 'whatsapp', 'email')) into v_channels;
  if p ->> 'preferred_contact' in ('phone', 'whatsapp', 'email') and not (p ->> 'preferred_contact')::public.contact_method = any (v_channels) then
    v_channels := v_channels || (p ->> 'preferred_contact')::public.contact_method;
  end if;

  if nullif(p ->> 'utm_campaign', '') is not null then
    select id into v_campaign from public.campaigns
     where org_id = v_org and (utm_campaign = p ->> 'utm_campaign' or name = p ->> 'utm_campaign') limit 1;
  end if;

  -- ---- duplicate detection: same mobile (or email) in this organization ----
  select * into v_existing from public.leads
   where org_id = v_org and duplicate_of is null
     and (phone_normalized = v_phone or (v_email is not null and lower(email) = v_email))
   order by created_at desc limit 1;

  if v_existing.id is not null then
    v_lead := v_existing.id;
    update public.leads set
      email = coalesce(email, v_email),
      preferred_contact = coalesce(nullif(p ->> 'preferred_contact', '')::public.contact_method, preferred_contact)
    where id = v_lead;
  else
    insert into public.leads (org_id, full_name, phone, phone_normalized, email, preferred_contact, intent,
                              source, campaign_id, landing_page, stage_id, assigned_to)
    values (v_org, v_name, left(p ->> 'phone', 20), v_phone, v_email,
            nullif(p ->> 'preferred_contact', '')::public.contact_method, v_intent,
            coalesce(nullif(p ->> 'utm_source', ''), 'website'), v_campaign, left(p ->> 'landing_page', 300),
            public.stage_id_for(v_org, 'new_enquiry'), public.pick_assignee(v_org, v_property))
    returning id into v_lead;
  end if;

  -- ---- requirements (buyers, tenants, investors) ----
  if v_intent in ('buyer', 'tenant', 'investor') then
    insert into public.lead_preferences as lp (lead_id, org_id, transaction_type, category, property_types,
      configurations, localities, budget_min, budget_max, furnishing, needs_home_loan, timeline_days,
      possession_pref, must_have_amenities)
    values (v_lead, v_org,
      coalesce(nullif(p ->> 'transaction_type', '')::public.transaction_type, v_prop.transaction_type,
               case when v_intent = 'tenant' then 'rent' else 'sale' end::public.transaction_type),
      coalesce(nullif(p ->> 'category', '')::public.property_category, v_prop.category),
      case when cardinality(arr_types) > 0 then arr_types when v_prop.id is not null then array[v_prop.property_type] else '{}' end,
      case when cardinality(arr_conf) > 0 then arr_conf when v_prop.configuration is not null then array[v_prop.configuration] else '{}' end,
      arr_loc,
      nullif(p ->> 'budget_min', '')::numeric, nullif(p ->> 'budget_max', '')::numeric,
      nullif(p ->> 'furnishing', '')::public.furnishing, nullif(p ->> 'needs_home_loan', '')::boolean,
      nullif(p ->> 'timeline_days', '')::int, nullif(p ->> 'possession_pref', '')::public.possession_status, arr_amen)
    on conflict (lead_id) do update set
      transaction_type = coalesce(excluded.transaction_type, lp.transaction_type),
      category = coalesce(excluded.category, lp.category),
      property_types = case when cardinality(excluded.property_types) > 0 then excluded.property_types else lp.property_types end,
      configurations = case when cardinality(excluded.configurations) > 0 then excluded.configurations else lp.configurations end,
      localities = array(select distinct x from unnest(lp.localities || excluded.localities) x),
      budget_min = coalesce(excluded.budget_min, lp.budget_min),
      budget_max = coalesce(excluded.budget_max, lp.budget_max),
      furnishing = coalesce(excluded.furnishing, lp.furnishing),
      needs_home_loan = coalesce(excluded.needs_home_loan, lp.needs_home_loan),
      timeline_days = coalesce(excluded.timeline_days, lp.timeline_days),
      possession_pref = coalesce(excluded.possession_pref, lp.possession_pref),
      must_have_amenities = case when cardinality(excluded.must_have_amenities) > 0 then excluded.must_have_amenities else lp.must_have_amenities end;
  end if;

  -- ---- owners: create a draft listing for broker review (never auto-published) ----
  if v_kind in ('seller', 'landlord') and nullif(p ->> 'locality', '') is not null then
    insert into public.properties (org_id, ref_code, title, transaction_type, category, property_type,
      configuration, locality, price, carpet_area, description, status, is_published, listing_source)
    values (v_org, 'SUB-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
      left(coalesce(nullif(p ->> 'configuration', '') || ' ', '') || coalesce(nullif(p ->> 'property_type_single', ''), 'Property')
           || ' in ' || (p ->> 'locality') || ' (owner submission)', 160),
      case when v_kind = 'landlord' then 'rent' else 'sale' end::public.transaction_type,
      coalesce(nullif(p ->> 'category', '')::public.property_category, 'residential'),
      coalesce(nullif(p ->> 'property_type_single', ''), 'Apartment'),
      nullif(p ->> 'configuration', ''), p ->> 'locality',
      nullif(p ->> 'expected_price', '')::numeric, nullif(p ->> 'carpet_area', '')::numeric,
      left(p ->> 'message', 2000), 'draft', false, 'owner_submission')
    returning id into v_draft;
  end if;

  insert into public.property_enquiries (org_id, lead_id, property_id, message, wants_site_visit, landing_page,
                                         kind, channel, ip_hash, preferred_visit_date)
  values (v_org, v_lead, coalesce(v_property, v_draft), left(p ->> 'message', 2000),
          coalesce((p ->> 'wants_site_visit')::boolean, false), left(p ->> 'landing_page', 300),
          v_kind, 'website', v_ip, nullif(p ->> 'preferred_visit_date', '')::date)
  returning id into v_enquiry;

  insert into public.consent_records (org_id, lead_id, purpose, channels, granted, consent_text, source)
  values (v_org, v_lead, 'enquiry_response', v_channels, true,
          left(coalesce(p ->> 'consent_text', 'Consent to be contacted about this enquiry'), 1000),
          left(p ->> 'landing_page', 300));
  if p ? 'marketing_consent' then
    insert into public.consent_records (org_id, lead_id, purpose, channels, granted, consent_text, source)
    values (v_org, v_lead, 'marketing', v_channels, coalesce((p ->> 'marketing_consent')::boolean, false),
            'Consent to receive property updates and offers', left(p ->> 'landing_page', 300));
  end if;

  insert into public.lead_activities (org_id, lead_id, type, body, meta)
  values (v_org, v_lead, case when v_existing.id is null then 'enquiry' else 'repeat_enquiry' end,
          left(p ->> 'message', 2000),
          jsonb_build_object('kind', v_kind, 'property_id', coalesce(v_property, v_draft),
                             'wants_site_visit', coalesce((p ->> 'wants_site_visit')::boolean, false)));

  if v_existing.id is not null then
    perform public.create_task_once(v_org, v_lead, null, v_existing.assigned_to,
      'Repeat enquiry from ' || v_existing.full_name, 'follow_up',
      public.next_working_time(v_org, now() + make_interval(mins => public.org_setting(v_org, 'automation', 'first_contact_minutes')::int)),
      'repeat_enquiry:' || v_enquiry);
  end if;
  if v_draft is not null then
    perform public.create_task_once(v_org, v_lead, null, coalesce(v_existing.assigned_to, (select assigned_to from public.leads where id = v_lead)),
      'Review owner listing submission', 'listing_review', public.next_working_time(v_org, now()), 'listing_review:' || v_draft);
  end if;

  perform public.compute_lead_score_internal(v_lead);
  perform public.compute_matches_internal(v_lead);

  return jsonb_build_object('ok', true, 'reference', upper(substr(v_enquiry::text, 1, 8)));
end;
$$;

revoke all on function public.submit_enquiry(jsonb) from public;
grant execute on function public.submit_enquiry(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Lead lifecycle automation
-- ---------------------------------------------------------------------------
create or replace function public.leads_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.pipeline_stages;
  q_pos int;
begin
  if new.phone is not null and new.phone_normalized is null then
    new.phone_normalized := public.normalize_phone(new.phone);
  end if;
  if new.stage_id is null then
    new.stage_id := public.stage_id_for(new.org_id, 'new_enquiry');
  end if;
  if tg_op = 'UPDATE' then
    if new.stage_id is not distinct from old.stage_id then
      return new;
    end if;
  end if;
  begin
    select * into s from public.pipeline_stages where id = new.stage_id;
    if s.is_lost and coalesce(trim(new.lost_reason), '') = '' then
      raise exception 'a lost reason is required' using errcode = '23514';
    end if;
    if s.is_won and new.won_at is null then new.won_at := now(); end if;
    if not s.is_won then new.won_at := null; end if;
    select position into q_pos from public.pipeline_stages where org_id = new.org_id and key = 'qualified';
    if new.qualified_at is null and not s.is_lost and s.key <> 'nurture' and s.position >= coalesce(q_pos, 4) then
      new.qualified_at := now();
    end if;
    if s.key not in ('new_enquiry', 'contact_pending') and new.first_contacted_at is null and not s.is_lost then
      new.first_contacted_at := now();
    end if;
  end;
  return new;
end;
$$;
create trigger leads_before_write
  before insert or update on public.leads
  for each row execute function public.leads_before_write();

create or replace function public.leads_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.pipeline_stages;
  old_s public.pipeline_stages;
begin
  if tg_op = 'INSERT' then
    perform public.create_task_once(new.org_id, new.id, null, new.assigned_to,
      'First contact: ' || new.full_name, 'first_contact',
      public.next_working_time(new.org_id, now() + make_interval(mins => public.org_setting(new.org_id, 'automation', 'first_contact_minutes')::int)),
      'first_contact:' || new.id);
    return new;
  end if;

  if new.stage_id is distinct from old.stage_id then
    select * into s from public.pipeline_stages where id = new.stage_id;
    select * into old_s from public.pipeline_stages where id = old.stage_id;
    insert into public.lead_activities (org_id, lead_id, actor_id, type, body, meta)
    values (new.org_id, new.id, auth.uid(), 'stage_change',
            coalesce(old_s.name, '—') || ' → ' || s.name,
            jsonb_build_object('from', old.stage_id, 'to', new.stage_id, 'lost_reason', new.lost_reason));

    if s.is_won or s.is_lost then
      -- Stop active follow-ups.
      update public.tasks set status = 'cancelled'
       where lead_id = new.id and status in ('open', 'snoozed');
    elsif s.key = 'negotiation' then
      perform public.create_task_once(new.org_id, new.id, null, new.assigned_to,
        'Negotiation follow-up: ' || new.full_name, 'negotiation',
        public.next_working_time(new.org_id, now() + make_interval(days => public.org_setting(new.org_id, 'automation', 'negotiation_follow_up_days')::int)),
        'negotiation:' || new.id || ':' || to_char(now(), 'YYYYMMDD'));
    end if;
    if s.key not in ('new_enquiry', 'contact_pending') then
      update public.tasks set status = 'done', completed_at = now()
       where lead_id = new.id and type = 'first_contact' and status in ('open', 'snoozed');
    end if;
  end if;

  if new.assigned_to is distinct from old.assigned_to then
    update public.tasks set assigned_to = new.assigned_to
     where lead_id = new.id and status in ('open', 'snoozed') and assigned_to is not distinct from old.assigned_to;
    insert into public.lead_activities (org_id, lead_id, actor_id, type, meta)
    values (new.org_id, new.id, auth.uid(), 'assignment', jsonb_build_object('from', old.assigned_to, 'to', new.assigned_to));
    perform public.notify(new.org_id, new.assigned_to, 'assigned:' || new.id || ':' || coalesce(new.assigned_to::text, ''),
      'Lead assigned to you: ' || new.full_name, null, '/dashboard/leads/' || new.id, new.id);
  end if;
  return new;
end;
$$;
create trigger leads_after_write
  after insert or update on public.leads
  for each row execute function public.leads_after_write();

-- Logging a call / WhatsApp / email / meeting counts as contact.
create or replace function public.on_activity_logged()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.leads;
  cur_key text;
begin
  if new.type not in ('call', 'whatsapp', 'email', 'meeting') then return new; end if;
  select * into l from public.leads where id = new.lead_id;
  select key into cur_key from public.pipeline_stages where id = l.stage_id;

  update public.leads
     set last_contacted_at = now(),
         first_contacted_at = coalesce(first_contacted_at, now()),
         stage_id = case when cur_key in ('new_enquiry', 'contact_pending')
                         then public.stage_id_for(l.org_id, 'contacted') else stage_id end
   where id = new.lead_id;

  update public.tasks set status = 'done', completed_at = now()
   where lead_id = new.lead_id and type = 'first_contact' and status in ('open', 'snoozed');

  if not exists (select 1 from public.tasks where lead_id = new.lead_id and type = 'follow_up' and status in ('open', 'snoozed')) then
    perform public.create_task_once(l.org_id, l.id, null, l.assigned_to, 'Follow up: ' || l.full_name, 'follow_up',
      public.next_working_time(l.org_id, now() + make_interval(days => public.org_setting(l.org_id, 'automation', 'follow_up_days')::int)),
      'follow_up:' || new.id);
  end if;
  return new;
end;
$$;
create trigger lead_activities_contact
  after insert on public.lead_activities
  for each row execute function public.on_activity_logged();

-- Keep the lead's next follow-up date in step with its open tasks.
create or replace function public.sync_next_follow_up()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_lead uuid := coalesce(new.lead_id, old.lead_id);
begin
  if v_lead is not null then
    update public.leads set next_follow_up_at = (
      select min(due_at) from public.tasks where lead_id = v_lead and status in ('open', 'snoozed'))
    where id = v_lead
      and next_follow_up_at is distinct from (select min(due_at) from public.tasks where lead_id = v_lead and status in ('open', 'snoozed'));
  end if;
  return null;
end;
$$;
create trigger tasks_sync_follow_up
  after insert or update of due_at, status or delete on public.tasks
  for each row execute function public.sync_next_follow_up();

create or replace function public.tasks_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'done' and old.status <> 'done' then new.completed_at := now(); end if;
  if new.status <> 'done' then new.completed_at := null; end if;
  if new.status = 'snoozed' and new.snoozed_until is null then
    raise exception 'snoozed tasks need a snooze-until time' using errcode = '23514';
  end if;
  if new.status = 'snoozed' then new.due_at := new.snoozed_until; end if;
  return new;
end;
$$;
create trigger tasks_before_update
  before update on public.tasks
  for each row execute function public.tasks_before_update();

-- ---------------------------------------------------------------------------
-- Site visits
-- ---------------------------------------------------------------------------
create or replace function public.site_visits_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.broker_id is not null and new.status in ('scheduled', 'confirmed', 'rescheduled') and exists (
    select 1 from public.site_visits v
    where v.broker_id = new.broker_id and v.id <> new.id
      and v.status in ('scheduled', 'confirmed', 'rescheduled')
      and tstzrange(v.starts_at, v.starts_at + make_interval(mins => v.duration_min))
       && tstzrange(new.starts_at, new.starts_at + make_interval(mins => new.duration_min))
  ) then
    raise exception 'this broker already has a visit at that time' using errcode = '23P01';
  end if;
  return new;
end;
$$;
create trigger site_visits_before_write
  before insert or update on public.site_visits
  for each row execute function public.site_visits_before_write();

create or replace function public.site_visits_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.leads;
  cur public.pipeline_stages;
  target uuid;
  reminder_at timestamptz;
  is_new_slot boolean := false;
begin
  select * into l from public.leads where id = new.lead_id;
  select * into cur from public.pipeline_stages where id = l.stage_id;

  if tg_op = 'INSERT' then
    is_new_slot := true;
  elsif new.starts_at is distinct from old.starts_at and new.status in ('scheduled', 'rescheduled') then
    is_new_slot := true;
  end if;
  if is_new_slot then
    perform public.create_task_once(new.org_id, new.lead_id, new.id, coalesce(new.broker_id, l.assigned_to),
      'Confirm site visit with ' || l.full_name, 'visit_confirm', public.next_working_time(new.org_id, now()),
      'visit_confirm:' || new.id || ':' || extract(epoch from new.starts_at)::bigint);
    reminder_at := greatest(now(), new.starts_at - make_interval(hours => public.org_setting(new.org_id, 'automation', 'visit_reminder_hours')::int));
    perform public.create_task_once(new.org_id, new.lead_id, new.id, coalesce(new.broker_id, l.assigned_to),
      'Site visit reminder: ' || l.full_name, 'visit_reminder', reminder_at,
      'visit_reminder:' || new.id || ':' || extract(epoch from new.starts_at)::bigint);
    insert into public.lead_activities (org_id, lead_id, actor_id, type, body, meta)
    values (new.org_id, new.lead_id, auth.uid(), 'visit_scheduled', null,
            jsonb_build_object('visit_id', new.id, 'starts_at', new.starts_at, 'property_id', new.property_id));
    target := public.stage_id_for(new.org_id, 'visit_scheduled');
    if not cur.is_won and not cur.is_lost and cur.position < (select position from public.pipeline_stages where id = target) then
      update public.leads set stage_id = target where id = new.lead_id;
    end if;
    if tg_op = 'INSERT' then
      return new;
    end if;
  end if;

  if new.buyer_confirmed and not old.buyer_confirmed then
    update public.tasks set status = 'done' where site_visit_id = new.id and type = 'visit_confirm' and status in ('open', 'snoozed');
  end if;

  if new.status is distinct from old.status then
    insert into public.lead_activities (org_id, lead_id, actor_id, type, body, meta)
    values (new.org_id, new.lead_id, auth.uid(), 'visit_' || new.status::text, new.outcome_notes,
            jsonb_build_object('visit_id', new.id));
    if new.status = 'attended' then
      update public.tasks set status = 'done'
       where site_visit_id = new.id and type in ('visit_confirm', 'visit_reminder', 'visit_outcome') and status in ('open', 'snoozed');
      perform public.create_task_once(new.org_id, new.lead_id, new.id, coalesce(new.broker_id, l.assigned_to),
        'Post-visit follow-up: ' || l.full_name, 'follow_up',
        public.next_working_time(new.org_id, now() + make_interval(days => public.org_setting(new.org_id, 'automation', 'post_visit_follow_up_days')::int)),
        'visit_follow_up:' || new.id);
      target := public.stage_id_for(new.org_id, 'visit_completed');
      if not cur.is_won and not cur.is_lost and cur.position < (select position from public.pipeline_stages where id = target) then
        update public.leads set stage_id = target where id = new.lead_id;
      end if;
    elsif new.status in ('cancelled', 'no_show') then
      update public.tasks set status = 'cancelled'
       where site_visit_id = new.id and type in ('visit_confirm', 'visit_reminder', 'visit_outcome') and status in ('open', 'snoozed');
      perform public.create_task_once(new.org_id, new.lead_id, new.id, coalesce(new.broker_id, l.assigned_to),
        case when new.status = 'no_show' then 'No-show: reschedule visit with ' else 'Visit cancelled: follow up with ' end || l.full_name,
        'follow_up', public.next_working_time(new.org_id, now()), 'visit_reschedule:' || new.id);
    end if;
  end if;
  return new;
end;
$$;
create trigger site_visits_after_write
  after insert or update on public.site_visits
  for each row execute function public.site_visits_after_write();

-- ---------------------------------------------------------------------------
-- Listings: never publish without a verification date.
-- ---------------------------------------------------------------------------
create or replace function public.properties_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_published and new.last_verified_at is null then
    raise exception 'verify the listing before publishing it' using errcode = '23514';
  end if;
  if new.status in ('sold', 'rented', 'inactive', 'draft') then
    new.is_published := false;
  end if;
  return new;
end;
$$;
create trigger properties_before_write
  before insert or update on public.properties
  for each row execute function public.properties_before_write();

-- ---------------------------------------------------------------------------
-- Scheduled automation. Run every 15 minutes by pg_cron (see README) or the
-- /api/cron/reminders route. Every write uses a dedupe key, so retries and
-- overlapping runs never duplicate tasks or notifications.
-- ---------------------------------------------------------------------------
create or replace function public.run_automation(p_now timestamptz default now(), p_org uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  t record;
  r record;
  v record;
  n_rows int := 0;
  n_reopened int := 0; n_due int := 0; n_escalated int := 0; n_outcome int := 0; n_stale int := 0; n_nocontact int := 0;
  today_start timestamptz; today_end timestamptz;
  esc_hours int; stale_days int; fc_minutes int;
begin
  for o in select * from public.organizations where p_org is null or id = p_org loop
    today_start := date_trunc('day', p_now at time zone o.timezone) at time zone o.timezone;
    today_end := today_start + interval '1 day';
    esc_hours := public.org_setting(o.id, 'automation', 'overdue_escalation_hours')::int;
    stale_days := public.org_setting(o.id, 'automation', 'stale_listing_days')::int;
    fc_minutes := public.org_setting(o.id, 'automation', 'first_contact_minutes')::int;

    -- 1. Snoozed tasks whose time has come back to open.
    update public.tasks set status = 'open', snoozed_until = null
     where org_id = o.id and status = 'snoozed' and snoozed_until <= p_now;
    get diagnostics n_rows = row_count;
    n_reopened := n_reopened + n_rows;

    -- 2. Visits whose time has passed without an outcome: prompt the broker.
    for v in
      select sv.*, l.full_name, l.assigned_to from public.site_visits sv join public.leads l on l.id = sv.lead_id
       where sv.org_id = o.id and sv.status in ('scheduled', 'confirmed', 'rescheduled')
         and sv.starts_at + make_interval(mins => sv.duration_min) < p_now
    loop
      if public.create_task_once(o.id, v.lead_id, v.id, coalesce(v.broker_id, v.assigned_to),
           'Record site visit outcome: ' || v.full_name, 'visit_outcome', p_now, 'visit_outcome:' || v.id) is not null then
        n_outcome := n_outcome + 1;
      end if;
    end loop;

    -- 3. Stale inventory: ask for re-verification.
    for r in
      select p.* from public.properties p
       where p.org_id = o.id and p.status in ('available', 'reserved')
         and (p.last_verified_at is null or p.last_verified_at < p_now - make_interval(days => stale_days))
    loop
      if public.create_task_once(o.id, null, null,
           coalesce(r.assigned_broker, (select user_id from public.user_roles where org_id = o.id and role in ('owner', 'admin') order by role, created_at limit 1)),
           'Re-verify listing ' || r.ref_code || ': ' || r.title, 'reverify_listing', public.next_working_time(o.id, p_now),
           'reverify:' || r.id || ':' || coalesce(to_char(r.last_verified_at, 'YYYYMMDD'), 'never')) is not null then
        n_stale := n_stale + 1;
      end if;
    end loop;
    -- 4. Follow-ups due today: in-app + email reminder to the assignee, once per day.
    for t in
      select * from public.tasks
       where org_id = o.id and status = 'open' and assigned_to is not null
         and due_at >= today_start and due_at < today_end
    loop
      perform public.notify(o.id, t.assigned_to, 'due:' || t.id || ':' || to_char(today_start, 'YYYYMMDD'),
        'Due today: ' || t.title, null,
        case when t.lead_id is not null then '/dashboard/leads/' || t.lead_id else '/dashboard/tasks' end,
        t.lead_id, t.id, true);
      n_due := n_due + 1;
    end loop;

    -- 5. Overdue beyond the escalation window: flag and alert owners/admins.
    for t in
      select * from public.tasks
       where org_id = o.id and status = 'open' and escalated_at is null
         and due_at < p_now - make_interval(hours => esc_hours)
    loop
      update public.tasks set escalated_at = p_now where id = t.id;
      for v in select user_id from public.user_roles where org_id = o.id and role in ('owner', 'admin') loop
        perform public.notify(o.id, v.user_id, 'escalate:' || t.id,
          'Overdue task escalated: ' || t.title,
          'Due ' || to_char(t.due_at at time zone o.timezone, 'DD Mon HH24:MI') || ' and still open.',
          case when t.lead_id is not null then '/dashboard/leads/' || t.lead_id else '/dashboard/tasks' end,
          t.lead_id, t.id, true);
      end loop;
      perform public.notify(o.id, t.assigned_to, 'overdue:' || t.id, 'Overdue: ' || t.title, null,
        case when t.lead_id is not null then '/dashboard/leads/' || t.lead_id else '/dashboard/tasks' end, t.lead_id, t.id, true);
      n_escalated := n_escalated + 1;
    end loop;

    -- 6. No first contact recorded yet: remind the assigned broker (once).
    for r in
      select l.* from public.leads l
      join public.pipeline_stages s on s.id = l.stage_id
       where l.org_id = o.id and l.first_contacted_at is null and not s.is_won and not s.is_lost
         and l.duplicate_of is null and l.created_at < p_now - make_interval(mins => fc_minutes)
    loop
      perform public.notify(o.id, r.assigned_to, 'no_contact:' || r.id,
        'No contact yet: ' || r.full_name, 'This enquiry has not been contacted. Call or message them now.',
        '/dashboard/leads/' || r.id, r.id, null, true);
      n_nocontact := n_nocontact + 1;
    end loop;

  end loop;

  return jsonb_build_object('reopened', n_reopened, 'due_today_reminders', n_due, 'escalated', n_escalated,
    'no_contact_reminders', n_nocontact, 'visit_outcome_tasks', n_outcome, 'reverify_tasks', n_stale, 'ran_at', p_now);
end;
$$;

-- Owners/admins can run the automation for their own organization from the app.
create or replace function public.run_my_automation(p_org uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_role(p_org, '{owner,admin}') then
    raise exception 'only owners and admins can run automation' using errcode = '42501';
  end if;
  return public.run_automation(now(), p_org);
end;
$$;

-- ---------------------------------------------------------------------------
-- CRM helpers
-- ---------------------------------------------------------------------------
create or replace function public.find_duplicate_leads(p_lead uuid)
returns table (id uuid, full_name text, phone text, email text, created_at timestamptz, stage_name text)
language sql
stable
security invoker
set search_path = ''
as $$
  select d.id, d.full_name, d.phone, d.email, d.created_at, s.name
  from public.leads l
  join public.leads d on d.org_id = l.org_id and d.id <> l.id and d.duplicate_of is null
   and (d.phone_normalized = l.phone_normalized or (l.email is not null and lower(d.email) = lower(l.email)))
  left join public.pipeline_stages s on s.id = d.stage_id
  where l.id = p_lead
  order by d.created_at;
$$;

create or replace function public.merge_leads(p_keep uuid, p_merge uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.leads;
  m public.leads;
begin
  select * into k from public.leads where id = p_keep;
  select * into m from public.leads where id = p_merge;
  if k.id is null or m.id is null or k.org_id <> m.org_id or k.id = m.id then
    raise exception 'leads must be two different leads in the same organization' using errcode = '22023';
  end if;
  if not public.has_role(k.org_id, '{owner,admin}') then
    raise exception 'only owners and admins can merge leads' using errcode = '42501';
  end if;
  if m.duplicate_of is not null then
    raise exception 'that lead was already merged' using errcode = '22023';
  end if;

  update public.property_enquiries set lead_id = p_keep where lead_id = p_merge;
  update public.lead_activities set lead_id = p_keep where lead_id = p_merge;
  update public.tasks set lead_id = p_keep where lead_id = p_merge;
  update public.site_visits set lead_id = p_keep where lead_id = p_merge;
  update public.consent_records set lead_id = p_keep where lead_id = p_merge;
  update public.notification_logs set lead_id = p_keep where lead_id = p_merge;

  if exists (select 1 from public.lead_preferences where lead_id = p_merge) then
    if not exists (select 1 from public.lead_preferences where lead_id = p_keep) then
      update public.lead_preferences set lead_id = p_keep where lead_id = p_merge;
    else
      update public.lead_preferences kp set
        localities = array(select distinct x from unnest(kp.localities || mp.localities) x),
        budget_min = coalesce(kp.budget_min, mp.budget_min),
        budget_max = coalesce(kp.budget_max, mp.budget_max),
        timeline_days = coalesce(kp.timeline_days, mp.timeline_days),
        property_types = case when cardinality(kp.property_types) > 0 then kp.property_types else mp.property_types end,
        configurations = case when cardinality(kp.configurations) > 0 then kp.configurations else mp.configurations end
      from public.lead_preferences mp
      where kp.lead_id = p_keep and mp.lead_id = p_merge;
    end if;
  end if;

  update public.leads set
    email = coalesce(k.email, m.email),
    phone = coalesce(k.phone, m.phone),
    phone_normalized = coalesce(k.phone_normalized, m.phone_normalized),
    first_contacted_at = least(k.first_contacted_at, m.first_contacted_at)
  where id = p_keep;

  update public.leads set
    duplicate_of = p_keep,
    stage_id = (select id from public.pipeline_stages where org_id = m.org_id and is_lost order by position limit 1),
    lost_reason = 'Merged into lead ' || p_keep
  where id = p_merge;

  insert into public.lead_activities (org_id, lead_id, actor_id, type, body, meta)
  values (k.org_id, p_keep, auth.uid(), 'merge', 'Merged duplicate lead: ' || m.full_name, jsonb_build_object('merged_lead', p_merge));
  perform public.write_audit(k.org_id, 'lead.merged', 'lead', p_keep, jsonb_build_object('merged', p_merge, 'merged_name', m.full_name));
  perform public.compute_lead_score_internal(p_keep);
  perform public.compute_matches_internal(p_keep);
end;
$$;

-- CSV exports are audited.
create or replace function public.log_export(p_org uuid, p_rows int, p_filters jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_role(p_org, '{owner,admin}') then
    raise exception 'only owners and admins can export' using errcode = '42501';
  end if;
  perform public.write_audit(p_org, 'leads.exported', 'lead', null, jsonb_build_object('rows', p_rows, 'filters', p_filters));
end;
$$;

-- Organization settings (owner/admin), validated.
create or replace function public.update_org_settings(p_org uuid, p_settings jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s jsonb := p_settings;
begin
  if not public.has_role(p_org, '{owner,admin}') then
    raise exception 'only owners and admins can change settings' using errcode = '42501';
  end if;
  if (s -> 'scoring' ->> 'hot_min')::int <= (s -> 'scoring' ->> 'warm_min')::int then
    raise exception 'hot threshold must be above warm threshold' using errcode = '22023';
  end if;
  if (s -> 'automation' ->> 'work_start')::time >= (s -> 'automation' ->> 'work_end')::time then
    raise exception 'working hours must end after they start' using errcode = '22023';
  end if;
  update public.organizations set settings = jsonb_build_object(
    'scoring', coalesce(settings -> 'scoring', '{}') || coalesce(s -> 'scoring', '{}'),
    'automation', coalesce(settings -> 'automation', '{}') || coalesce(s -> 'automation', '{}'))
  where id = p_org;
  perform public.write_audit(p_org, 'org.settings_changed', 'organization', p_org, s);
end;
$$;

-- ---------------------------------------------------------------------------
-- Lead list view (RLS of the caller applies: security_invoker)
-- ---------------------------------------------------------------------------
create view public.lead_list
with (security_invoker = true)
as
select
  l.id, l.org_id, l.full_name, l.phone, l.phone_normalized, l.email, l.intent, l.source,
  l.campaign_id, l.stage_id, l.assigned_to, l.score, l.category, l.score_override,
  coalesce(l.score_override, l.category) as effective_category,
  l.last_contacted_at, l.next_follow_up_at, l.created_at, l.updated_at, l.duplicate_of,
  l.do_not_contact, l.won_at, l.deal_value, l.brokerage_amount, l.expected_brokerage,
  s.name as stage_name, s.key as stage_key, s.position as stage_position, s.is_won, s.is_lost,
  pr.full_name as assignee_name,
  lp.localities, lp.budget_min, lp.budget_max, lp.transaction_type,
  array_to_string(lp.localities, ', ') as localities_text,
  (select string_agg(distinct p.title, ' | ') from public.property_enquiries e
     join public.properties p on p.id = e.property_id where e.lead_id = l.id) as properties_text
from public.leads l
left join public.pipeline_stages s on s.id = l.stage_id
left join public.profiles pr on pr.id = l.assigned_to
left join public.lead_preferences lp on lp.lead_id = l.id;

revoke all on public.lead_list from anon;
grant select on public.lead_list to authenticated;

-- ---------------------------------------------------------------------------
-- Reports (security invoker: each user sees only the rows RLS allows)
-- ---------------------------------------------------------------------------
create or replace function public.report_summary(p_org uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  tz text := coalesce((select timezone from public.organizations where id = p_org), 'Asia/Kolkata');
  today_start timestamptz := date_trunc('day', now() at time zone tz) at time zone tz;
  result jsonb;
begin
  if not public.has_role(p_org, '{owner,admin,viewer}') then
    raise exception 'reports are available to owners, admins and read-only managers' using errcode = '42501';
  end if;

  with
  range_leads as (
    select l.*, coalesce(l.score_override, l.category) as eff
    from public.leads l
    where l.org_id = p_org and l.duplicate_of is null and l.created_at >= p_from and l.created_at < p_to
  ),
  attended as (
    select distinct sv.lead_id from public.site_visits sv
    where sv.org_id = p_org and sv.status = 'attended' and sv.starts_at >= p_from and sv.starts_at < p_to
  ),
  won as (
    select l.* from public.leads l join public.pipeline_stages s on s.id = l.stage_id
    where l.org_id = p_org and s.is_won and l.won_at >= p_from and l.won_at < p_to
  )
  select jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to, 'timezone', tz),
    'new_leads', (select count(*) from range_leads),
    'by_stage', coalesce((select jsonb_agg(x order by x.position) from (
        select s.key, s.name, s.position, count(l.id) as count
        from public.pipeline_stages s
        left join public.leads l on l.stage_id = s.id and l.duplicate_of is null
        where s.org_id = p_org and s.is_active
        group by s.id) x), '[]'),
    'by_category', jsonb_build_object(
        'hot', (select count(*) from range_leads where eff = 'hot'),
        'warm', (select count(*) from range_leads where eff = 'warm'),
        'cold', (select count(*) from range_leads where eff = 'cold'),
        'unscored', (select count(*) from range_leads where eff is null)),
    'follow_ups_due_today', (select count(*) from public.tasks t where t.org_id = p_org and t.status = 'open'
        and t.due_at >= today_start and t.due_at < today_start + interval '1 day'),
    'overdue_tasks', (select count(*) from public.tasks t where t.org_id = p_org and t.status = 'open' and t.due_at < now()),
    'upcoming_visits', (select count(*) from public.site_visits sv where sv.org_id = p_org
        and sv.status in ('scheduled', 'confirmed', 'rescheduled') and sv.starts_at >= now() and sv.starts_at < now() + interval '7 days'),
    'by_locality', coalesce((select jsonb_agg(x order by x.count desc) from (
        select coalesce(p.locality, lp.localities[1], 'Not specified') as locality, count(*) as count
        from public.property_enquiries e
        join public.leads l on l.id = e.lead_id
        left join public.properties p on p.id = e.property_id
        left join public.lead_preferences lp on lp.lead_id = e.lead_id
        where e.org_id = p_org and e.created_at >= p_from and e.created_at < p_to
        group by 1 order by 2 desc limit 12) x), '[]'),
    'by_property', coalesce((select jsonb_agg(x order by x.count desc) from (
        select p.id, p.ref_code, p.title, count(*) as count
        from public.property_enquiries e join public.properties p on p.id = e.property_id
        where e.org_id = p_org and e.kind = 'property' and e.created_at >= p_from and e.created_at < p_to
        group by p.id order by 4 desc limit 10) x), '[]'),
    'by_source', coalesce((select jsonb_agg(x order by x.count desc) from (
        select coalesce(source, 'unknown') as source, count(*) as count from range_leads group by 1) x), '[]'),
    'by_campaign', coalesce((select jsonb_agg(x order by x.count desc) from (
        select c.name, count(*) as count from range_leads l join public.campaigns c on c.id = l.campaign_id group by c.name) x), '[]'),
    'qualified', jsonb_build_object(
        'numerator', (select count(*) from range_leads where qualified_at is not null),
        'denominator', (select count(*) from range_leads)),
    'visit_conversion', jsonb_build_object(
        'numerator', (select count(*) from attended a join public.leads l on l.id = a.lead_id
                      join public.pipeline_stages s on s.id = l.stage_id where s.is_won),
        'denominator', (select count(*) from attended)),
    'won', jsonb_build_object(
        'count', (select count(*) from won),
        'recorded_revenue', (select coalesce(sum(brokerage_amount), 0) from won),
        'deal_value', (select coalesce(sum(deal_value), 0) from won)),
    'projected_revenue', (select coalesce(sum(l.expected_brokerage), 0) from public.leads l
        join public.pipeline_stages s on s.id = l.stage_id
        where l.org_id = p_org and s.key in ('negotiation', 'booking')),
    'brokers', coalesce((select jsonb_agg(x order by x.won desc, x.assigned desc) from (
        select r.user_id, coalesce(pr.full_name, pr.email) as name, r.role,
          (select count(*) from range_leads l where l.assigned_to = r.user_id) as assigned,
          (select count(*) from range_leads l where l.assigned_to = r.user_id and l.first_contacted_at is not null) as contacted,
          (select round(avg(extract(epoch from (l.first_contacted_at - l.created_at)) / 60)::numeric, 0)
             from range_leads l where l.assigned_to = r.user_id and l.first_contacted_at is not null) as avg_first_response_min,
          (select count(*) from public.site_visits sv where sv.broker_id = r.user_id and sv.status = 'attended'
             and sv.starts_at >= p_from and sv.starts_at < p_to) as visits_attended,
          (select count(*) from won w where w.assigned_to = r.user_id) as won,
          (select coalesce(sum(w.brokerage_amount), 0) from won w where w.assigned_to = r.user_id) as revenue,
          (select count(*) from public.tasks t where t.assigned_to = r.user_id and t.status = 'open' and t.due_at < now()) as overdue_tasks
        from public.user_roles r left join public.profiles pr on pr.id = r.user_id
        where r.org_id = p_org and r.role in ('owner', 'admin', 'broker')) x), '[]')
  ) into result;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke all on function public.stage_id_for(uuid, text) from public, anon;
grant execute on function public.stage_id_for(uuid, text) to authenticated;
revoke all on function public.normalize_phone(text) from public;
grant execute on function public.normalize_phone(text) to anon, authenticated;

revoke all on function
  public.org_setting(uuid, text, text), public.next_working_time(uuid, timestamptz),
  public.notify(uuid, uuid, text, text, text, text, uuid, uuid, boolean),
  public.create_task_once(uuid, uuid, uuid, uuid, text, text, timestamptz, text),
  public.pick_assignee(uuid, uuid), public.run_automation(timestamptz, uuid),
  public.on_preferences_changed(), public.on_enquiry_added(), public.leads_before_write(),
  public.leads_after_write(), public.on_activity_logged(), public.sync_next_follow_up(),
  public.tasks_before_update(), public.site_visits_before_write(), public.site_visits_after_write(),
  public.properties_before_write(), public.compute_lead_score_internal(uuid), public.compute_matches_internal(uuid)
from public, anon, authenticated;

revoke all on function public.compute_lead_score(uuid), public.compute_matches(uuid),
  public.find_duplicate_leads(uuid), public.merge_leads(uuid, uuid), public.log_export(uuid, int, jsonb),
  public.update_org_settings(uuid, jsonb), public.run_my_automation(uuid),
  public.report_summary(uuid, timestamptz, timestamptz)
from public, anon;
grant execute on function public.compute_lead_score(uuid), public.compute_matches(uuid),
  public.find_duplicate_leads(uuid), public.merge_leads(uuid, uuid), public.log_export(uuid, int, jsonb),
  public.update_org_settings(uuid, jsonb), public.run_my_automation(uuid),
  public.report_summary(uuid, timestamptz, timestamptz)
to authenticated;

-- service_role (server cron route) may run the scheduled job.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.run_automation(timestamptz, uuid) to service_role;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Public website helpers
-- ---------------------------------------------------------------------------
-- The organization the public website belongs to when NEXT_PUBLIC_SITE_ORG_ID
-- isn't set: the first brokerage created that accepts enquiries.
create or replace function public.default_public_org()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.organizations where accepts_public_enquiries order by created_at limit 1;
$$;
revoke all on function public.default_public_org() from public;
grant execute on function public.default_public_org() to anon, authenticated;

-- Photos of published listings only.
create view public.public_property_media
with (security_barrier = true)
as
select m.id, m.property_id, m.storage_path, m.alt_text, m.position, m.is_cover
from public.property_media m
join public.properties p on p.id = m.property_id
where p.is_published and p.status in ('available', 'reserved');
grant select on public.public_property_media to anon, authenticated;
