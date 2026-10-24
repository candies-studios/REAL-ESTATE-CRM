-- =============================================================================
-- Phase 1 — core schema
-- Multi-organization CRM for a real estate brokerage (Navi Mumbai first).
-- Every business table carries org_id so data is isolated per brokerage.
-- Row Level Security is enabled in the next migration.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('owner', 'admin', 'broker', 'viewer');
create type public.lead_intent as enum ('buyer', 'seller', 'landlord', 'tenant', 'investor');
create type public.transaction_type as enum ('sale', 'rent', 'lease');
create type public.property_category as enum ('residential', 'commercial');
create type public.listing_status as enum ('draft', 'available', 'reserved', 'sold', 'rented', 'inactive');
create type public.contact_method as enum ('phone', 'whatsapp', 'email');
create type public.lead_category as enum ('hot', 'warm', 'cold');
create type public.task_status as enum ('open', 'done', 'snoozed', 'cancelled');
create type public.site_visit_status as enum ('scheduled', 'confirmed', 'attended', 'rescheduled', 'cancelled', 'no_show');
create type public.area_unit as enum ('sq_ft', 'sq_m');
create type public.furnishing as enum ('unfurnished', 'semi_furnished', 'fully_furnished');
create type public.possession_status as enum ('ready_to_move', 'under_construction');

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Organizations, people and membership
-- ---------------------------------------------------------------------------
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 120),
  timezone    text not null default 'Asia/Kolkata',
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text check (char_length(full_name) <= 120),
  phone       text check (char_length(phone) <= 20),
  email       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Membership + role in one table: a user has exactly one role per organization.
create table public.user_roles (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        public.app_role not null default 'broker',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, user_id)
);
create index user_roles_user_idx on public.user_roles (user_id);

-- ---------------------------------------------------------------------------
-- Pipeline and campaigns
-- ---------------------------------------------------------------------------
create table public.pipeline_stages (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  key         text not null check (key ~ '^[a-z0-9_]{2,40}$'),
  name        text not null check (char_length(name) between 1 and 60),
  position    integer not null,
  is_won      boolean not null default false,
  is_lost     boolean not null default false,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, key),
  check (not (is_won and is_lost))
);
create index pipeline_stages_org_pos_idx on public.pipeline_stages (org_id, position);

create table public.campaigns (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 120),
  source       text,              -- e.g. google_ads, meta, portal, referral, website
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  starts_on    date,
  ends_on      date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index campaigns_org_idx on public.campaigns (org_id);

-- ---------------------------------------------------------------------------
-- Properties (inventory)
-- ---------------------------------------------------------------------------
create table public.properties (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations (id) on delete cascade,
  ref_code           text not null check (char_length(ref_code) between 2 and 30),
  title              text not null check (char_length(title) between 3 and 160),
  transaction_type   public.transaction_type not null,
  category           public.property_category not null,
  property_type      text not null,                 -- apartment, villa, row_house, office, shop, plot...
  configuration      text,                          -- 1 BHK, 2 BHK, studio...
  locality           text not null,                 -- Kharghar, Vashi, Nerul, Panvel...
  city               text not null default 'Navi Mumbai',
  project_name       text,
  address_private    text,                          -- never exposed publicly
  public_location    text,                          -- approximate, safe to publish
  price              numeric(14, 2) check (price is null or price >= 0),
  price_on_request   boolean not null default false,
  carpet_area        numeric(10, 2) check (carpet_area is null or carpet_area > 0),
  area_unit          public.area_unit not null default 'sq_ft',
  furnishing         public.furnishing,
  possession_status  public.possession_status,
  possession_date    date,
  amenities          text[] not null default '{}',
  description        text,
  status             public.listing_status not null default 'draft',
  is_published       boolean not null default false,
  is_demo            boolean not null default false, -- seed/demo listings must be labelled
  assigned_broker    uuid references auth.users (id) on delete set null,
  listing_source     text,
  last_verified_at   timestamptz,
  rera_number        text,
  rera_project_name  text,
  internal_notes     text,
  created_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (org_id, ref_code)
);
create index properties_org_status_idx on public.properties (org_id, status);
create index properties_org_locality_idx on public.properties (org_id, locality);
create index properties_public_idx on public.properties (is_published, status);

create table public.property_media (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  property_id   uuid not null references public.properties (id) on delete cascade,
  storage_path  text not null,
  alt_text      text,
  position      integer not null default 0,
  is_cover      boolean not null default false,
  created_at    timestamptz not null default now()
);
create index property_media_property_idx on public.property_media (property_id, position);

-- ---------------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------------
create table public.leads (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations (id) on delete cascade,
  full_name          text not null check (char_length(full_name) between 1 and 120),
  phone              text check (char_length(phone) <= 20),
  phone_normalized   text check (phone_normalized ~ '^\+?[0-9]{8,15}$'),
  email              text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  preferred_contact  public.contact_method,
  intent             public.lead_intent not null default 'buyer',
  source             text,                          -- website, portal, walk_in, referral, campaign...
  campaign_id        uuid references public.campaigns (id) on delete set null,
  landing_page       text,
  stage_id           uuid references public.pipeline_stages (id) on delete restrict,
  assigned_to        uuid references auth.users (id) on delete set null,
  score              integer check (score between 0 and 100),
  category           public.lead_category,
  score_breakdown    jsonb not null default '[]',
  score_override     public.lead_category,
  override_reason    text,
  last_contacted_at  timestamptz,
  next_follow_up_at  timestamptz,
  lost_reason        text,
  duplicate_of       uuid references public.leads (id) on delete set null,
  created_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (phone_normalized is not null or email is not null),
  check (score_override is null or override_reason is not null)
);
create index leads_org_stage_idx on public.leads (org_id, stage_id);
create index leads_org_assigned_idx on public.leads (org_id, assigned_to);
create index leads_org_phone_idx on public.leads (org_id, phone_normalized);
create index leads_org_email_idx on public.leads (org_id, lower(email));
create index leads_org_followup_idx on public.leads (org_id, next_follow_up_at);
create index leads_org_created_idx on public.leads (org_id, created_at desc);

create table public.lead_preferences (
  lead_id            uuid primary key references public.leads (id) on delete cascade,
  org_id             uuid not null references public.organizations (id) on delete cascade,
  transaction_type   public.transaction_type,
  category           public.property_category,
  property_types     text[] not null default '{}',
  configurations     text[] not null default '{}',
  localities         text[] not null default '{}',
  budget_min         numeric(14, 2) check (budget_min is null or budget_min >= 0),
  budget_max         numeric(14, 2) check (budget_max is null or budget_max >= 0),
  area_min           numeric(10, 2),
  area_max           numeric(10, 2),
  area_unit          public.area_unit not null default 'sq_ft',
  furnishing         public.furnishing,
  needs_home_loan    boolean,                       -- only if voluntarily provided
  timeline_days      integer check (timeline_days is null or timeline_days >= 0),
  possession_pref    public.possession_status,
  must_have_amenities text[] not null default '{}',
  updated_at         timestamptz not null default now(),
  check (budget_min is null or budget_max is null or budget_min <= budget_max)
);

create table public.property_enquiries (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id) on delete cascade,
  lead_id           uuid not null references public.leads (id) on delete cascade,
  property_id       uuid references public.properties (id) on delete set null,
  message           text check (char_length(message) <= 2000),
  wants_site_visit  boolean not null default false,
  landing_page      text,
  created_at        timestamptz not null default now()
);
create index property_enquiries_lead_idx on public.property_enquiries (lead_id);
create index property_enquiries_property_idx on public.property_enquiries (org_id, property_id);

create table public.lead_property_matches (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  lead_id      uuid not null references public.leads (id) on delete cascade,
  property_id  uuid not null references public.properties (id) on delete cascade,
  score        integer not null check (score between 0 and 100),
  reasons      jsonb not null default '[]',
  computed_at  timestamptz not null default now(),
  unique (lead_id, property_id)
);

create table public.lead_activities (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  lead_id     uuid not null references public.leads (id) on delete cascade,
  actor_id    uuid references auth.users (id) on delete set null,
  type        text not null,                      -- note, call, whatsapp, email, stage_change, assignment...
  body        text check (char_length(body) <= 5000),
  meta        jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index lead_activities_lead_idx on public.lead_activities (lead_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Site visits and tasks
-- ---------------------------------------------------------------------------
create table public.site_visits (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  lead_id          uuid not null references public.leads (id) on delete cascade,
  property_id      uuid references public.properties (id) on delete set null,
  broker_id        uuid references auth.users (id) on delete set null,
  starts_at        timestamptz not null,
  duration_min     integer not null default 60 check (duration_min between 15 and 480),
  meeting_point    text,
  buyer_confirmed  boolean not null default false,
  status           public.site_visit_status not null default 'scheduled',
  outcome_notes    text,
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index site_visits_org_starts_idx on public.site_visits (org_id, starts_at);
create index site_visits_broker_idx on public.site_visits (broker_id, starts_at);
create index site_visits_lead_idx on public.site_visits (lead_id);

create table public.tasks (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  lead_id        uuid references public.leads (id) on delete cascade,
  site_visit_id  uuid references public.site_visits (id) on delete cascade,
  assigned_to    uuid references auth.users (id) on delete set null,
  title          text not null check (char_length(title) between 1 and 200),
  type           text not null default 'follow_up', -- follow_up, first_contact, visit_confirm, visit_outcome, negotiation...
  due_at         timestamptz not null,
  status         public.task_status not null default 'open',
  snoozed_until  timestamptz,
  completed_at   timestamptz,
  -- Idempotency: automation writes a deterministic key so retries never duplicate a task.
  dedupe_key     text,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (org_id, dedupe_key)
);
create index tasks_org_assignee_due_idx on public.tasks (org_id, assigned_to, status, due_at);
create index tasks_lead_idx on public.tasks (lead_id);

-- ---------------------------------------------------------------------------
-- Consent, notifications and audit
-- ---------------------------------------------------------------------------
create table public.consent_records (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  lead_id        uuid not null references public.leads (id) on delete cascade,
  purpose        text not null,                   -- enquiry_response, marketing, ...
  channels       public.contact_method[] not null default '{}',
  granted        boolean not null,
  consent_text   text not null,                   -- exact wording shown to the person
  source         text,                            -- form / page where consent was captured
  created_at     timestamptz not null default now()
);
create index consent_records_lead_idx on public.consent_records (lead_id, created_at desc);

create table public.notification_logs (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  task_id      uuid references public.tasks (id) on delete set null,
  channel      text not null,                     -- in_app, email, whatsapp
  recipient_id uuid references auth.users (id) on delete set null,
  status       text not null default 'queued',    -- queued, sent, failed, skipped
  provider_ref text,
  error        text,
  dedupe_key   text not null,
  created_at   timestamptz not null default now(),
  unique (org_id, dedupe_key)
);

create table public.audit_logs (
  id          bigint generated always as identity primary key,
  org_id      uuid references public.organizations (id) on delete cascade,
  actor_id    uuid references auth.users (id) on delete set null,
  action      text not null,
  entity      text not null,
  entity_id   uuid,
  data        jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index audit_logs_org_created_idx on public.audit_logs (org_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'organizations','profiles','user_roles','pipeline_stages','campaigns',
    'properties','leads','lead_preferences','site_visits','tasks'
  ] loop
    execute format(
      'create trigger %I_set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;
