-- Minimal stand-in for Supabase's platform objects so migrations and RLS can be
-- tested against plain Postgres. NOT used in production — Supabase provides these.

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
-- Migrations run as a non-superuser owner WITHOUT bypassrls, like Supabase's
-- "postgres" role, so tests can't pass merely because of superuser rights.
create role migrator login createrole;
grant anon, authenticated, service_role to migrator;

create schema auth;
create schema extensions;
grant usage on schema auth to anon, authenticated, service_role, migrator;
grant usage, create on schema extensions to migrator;
grant usage on schema extensions to anon, authenticated, service_role;

create table auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text unique,
  raw_user_meta_data  jsonb not null default '{}',
  created_at          timestamptz not null default now()
);
grant select, references, trigger on auth.users to migrator;

-- Same behaviour as Supabase's auth.uid(): reads the JWT "sub" claim.
create function auth.uid() returns uuid
language sql stable
as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    ), ''
  )::uuid;
$$;
grant execute on function auth.uid() to anon, authenticated, service_role, migrator;

-- Supabase's default privileges: API roles can use public objects; RLS decides rows.
alter schema public owner to migrator;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges for role migrator in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role migrator in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges for role migrator in schema public
  grant execute on functions to anon, authenticated, service_role;

-- pgcrypto must be installed by a superuser in plain Postgres.
create extension if not exists pgcrypto with schema extensions;

-- Mirror Supabase: auth.users has Row Level Security enabled, so our functions
-- must not depend on reading it directly.
alter table auth.users enable row level security;
