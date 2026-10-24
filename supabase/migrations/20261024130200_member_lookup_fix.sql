-- =============================================================================
-- Look members up by email in public.profiles instead of auth.users.
-- Supabase's auth.users table has Row Level Security enabled, so reading it
-- from our functions is unreliable. profiles is filled by handle_new_user()
-- and kept in sync below.
-- =============================================================================

-- Backfill profiles for any accounts created before this migration.
insert into public.profiles (id, full_name, email)
select u.id, nullif(u.raw_user_meta_data ->> 'full_name', ''), u.email
from auth.users u
on conflict (id) do update set email = excluded.email;

create index if not exists profiles_email_idx on public.profiles (lower(email));

-- Keep profiles.email current when someone changes their login email.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.handle_user_email_change() from public, anon, authenticated;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

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

  select id into v_user from public.profiles where lower(email) = lower(trim(p_email)) limit 1;
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
