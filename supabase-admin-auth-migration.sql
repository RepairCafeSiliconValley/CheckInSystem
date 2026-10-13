-- ============================================
-- Admin auth: allowlist, admin users, access-level RLS (PR 2)
-- ============================================
-- Design: docs/admin-auth-plan.md.
--
-- Prerequisites: every earlier migration in scripts/db-reset.mjs, ending with
-- supabase-reason-notes-migration.sql.
--
-- Access levels: admin (personal login, row in app_users, not disabled),
-- volunteer (the shared account, VOLUNTEER_ACCOUNT_EMAIL in constants.js) and
-- client (anon). This file:
--   1. Adds admin_allowlist and app_users.
--   2. Adds is_admin() / is_volunteer() / can_access_queue().
--   3. Adds the Before User Created auth hook (rejects sign-ups that aren't
--      allowlisted) and the auth.users triggers that create app_users rows
--      and track last login.
--   4. Adds set_user_disabled() and delete_app_user().
--   5. Replaces the "any signed-in user" policies with access-level ones and
--      drops the open "Allow insert" policy on waiver_acceptances.
--
-- TRANSITION: events stay writable by the volunteer account until
-- supabase-admin-auth-lockdown.sql (PR 3) restricts them to admins.
--
-- After running this, enable the hook: Dashboard → Auth → Hooks → Before User
-- Created → public.hook_before_user_created (locally: supabase/config.toml).
-- Then bootstrap the first admin (see the end of this file).
-- ============================================


-- ─── 1. Tables ───

create table if not exists public.admin_allowlist (
  email       text primary key check (email = lower(email)),
  invited_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.app_users (
  id             uuid primary key references auth.users(id) on delete cascade,
  email          text not null unique,
  name           text not null check (length(trim(name)) > 0),
  phone          text,
  avatar_url     text,
  disabled       boolean not null default false,
  created_at     timestamptz not null default now(),
  last_login_at  timestamptz
);

alter table public.admin_allowlist enable row level security;
alter table public.app_users enable row level security;

-- Admins may change a user's name directly; everything else on app_users goes
-- through the RPCs below. Rows are only ever inserted by the auth trigger.
revoke insert, update, delete on public.app_users from anon, authenticated;
grant update (name) on public.app_users to authenticated;


-- ─── 2. Access-level checks ───

-- The shared volunteer account. Keep in step with VOLUNTEER_ACCOUNT_EMAIL.
create or replace function public.is_volunteer()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'volunteer@repaircafe.app';
$$;

-- An enabled admin. SECURITY DEFINER so policies can consult app_users
-- without the caller needing to read it.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.app_users
    where id = auth.uid() and not disabled
  );
$$;

-- Everything /queue reads and writes.
create or replace function public.can_access_queue()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select public.is_admin() or public.is_volunteer();
$$;


-- ─── 3. Auth hook and triggers ───

-- Before User Created hook: Supabase Auth calls this for every public
-- sign-up, whatever the sign-in method. Returning {} allows the sign-up;
-- returning an error object rejects it before any auth.users row exists.
-- Users created with the service-role admin API (dashboard, db-reset's
-- volunteer login) skip the hook; the trigger below still won't make them
-- admins unless they were allowlisted.
create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(event -> 'user' ->> 'email');
begin
  if v_email is not null
     and exists (select 1 from public.admin_allowlist where email = v_email) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'This email hasn''t been approved for admin access.'
    )
  );
end;
$$;

revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;

-- A new auth user who was allowlisted becomes an admin, and the invite is
-- used up. Checking the allowlist here too means a user created any other way
-- (hook disabled, dashboard) is never made an admin.
create or replace function public.handle_new_app_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(new.email);
begin
  delete from public.admin_allowlist where email = v_email;
  if not found then
    return new;
  end if;

  insert into public.app_users (id, email, name, phone, avatar_url, last_login_at)
  values (
    new.id,
    v_email,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(v_email, '@', 1)
    ),
    nullif(new.phone, ''),
    nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
    new.last_sign_in_at
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_app_user on auth.users;
create trigger on_auth_user_created_app_user
  after insert on auth.users
  for each row execute function public.handle_new_app_user();

create or replace function public.sync_last_login()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.app_users
  set last_login_at = new.last_sign_in_at
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_signed_in on auth.users;
create trigger on_auth_user_signed_in
  after update of last_sign_in_at on auth.users
  for each row
  when (new.last_sign_in_at is distinct from old.last_sign_in_at)
  execute function public.sync_last_login();


-- ─── 4. Admin RPCs ───
-- Both refuse non-admins and refuse targeting yourself. Because the caller
-- must be an enabled admin and can't target themselves, at least one enabled
-- admin (the caller) always remains, so these can't lock everyone out.

create or replace function public.set_user_disabled(target uuid, value boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can change users' using errcode = '42501';
  end if;
  if target = auth.uid() then
    raise exception 'You can''t disable or enable yourself';
  end if;

  update public.app_users set disabled = value where id = target;
  if not found then
    raise exception 'User not found';
  end if;
end;
$$;

-- Removes the login itself; app_users goes with it (on delete cascade) and
-- invites they sent keep their row with invited_by set to null. Coming back
-- needs a new allowlist entry. Needs a postgres-owned function on hosted
-- Supabase; see docs/admin-auth-plan.md §5.2 for the Edge Function fallback.
create or replace function public.delete_app_user(target uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can delete users' using errcode = '42501';
  end if;
  if target = auth.uid() then
    raise exception 'You can''t delete yourself';
  end if;
  if not exists (select 1 from public.app_users where id = target) then
    raise exception 'User not found';
  end if;

  delete from auth.users where id = target;
end;
$$;

revoke execute on function public.set_user_disabled(uuid, boolean) from public, anon;
revoke execute on function public.delete_app_user(uuid) from public, anon;
grant execute on function public.set_user_disabled(uuid, boolean) to authenticated;
grant execute on function public.delete_app_user(uuid) to authenticated;


-- ─── 5. Policies ───

-- PII tables: the volunteer account and enabled admins, instead of any
-- signed-in session.
drop policy if exists "Staff can read attendees" on public.attendees;
drop policy if exists "Staff can update attendees" on public.attendees;
drop policy if exists "Volunteers and admins can read attendees" on public.attendees;
create policy "Volunteers and admins can read attendees"
  on public.attendees for select to authenticated
  using ((select public.can_access_queue()));
drop policy if exists "Volunteers and admins can update attendees" on public.attendees;
create policy "Volunteers and admins can update attendees"
  on public.attendees for update to authenticated
  using ((select public.can_access_queue()))
  with check ((select public.can_access_queue()));

drop policy if exists "Staff can read work orders" on public.work_orders;
drop policy if exists "Staff can update work orders" on public.work_orders;
drop policy if exists "Volunteers and admins can read work orders" on public.work_orders;
create policy "Volunteers and admins can read work orders"
  on public.work_orders for select to authenticated
  using ((select public.can_access_queue()));
drop policy if exists "Volunteers and admins can update work orders" on public.work_orders;
create policy "Volunteers and admins can update work orders"
  on public.work_orders for update to authenticated
  using ((select public.can_access_queue()))
  with check ((select public.can_access_queue()));

drop policy if exists "Staff can read waivers" on public.waiver_acceptances;
drop policy if exists "Volunteers and admins can read waivers" on public.waiver_acceptances;
create policy "Volunteers and admins can read waivers"
  on public.waiver_acceptances for select to authenticated
  using ((select public.can_access_queue()));

-- Waivers are written only by checkin_visitor (SECURITY DEFINER). The open
-- insert policy from supabase-migration.sql let anyone forge waiver rows.
drop policy if exists "Allow insert" on public.waiver_acceptances;

-- Events: TRANSITION. The volunteer account keeps write access until the
-- PR 3 lockdown migration switches these to is_admin().
drop policy if exists "Staff can create events" on public.events;
drop policy if exists "Staff can update events" on public.events;
drop policy if exists "Volunteers and admins can create events" on public.events;
create policy "Volunteers and admins can create events"
  on public.events for insert to authenticated
  with check ((select public.can_access_queue()));
drop policy if exists "Volunteers and admins can update events" on public.events;
create policy "Volunteers and admins can update events"
  on public.events for update to authenticated
  using ((select public.can_access_queue()))
  with check ((select public.can_access_queue()));

-- Admin tables.
drop policy if exists "Admins can read the allowlist" on public.admin_allowlist;
create policy "Admins can read the allowlist"
  on public.admin_allowlist for select to authenticated
  using ((select public.is_admin()));
drop policy if exists "Admins can add to the allowlist" on public.admin_allowlist;
create policy "Admins can add to the allowlist"
  on public.admin_allowlist for insert to authenticated
  with check ((select public.is_admin()));
drop policy if exists "Admins can remove from the allowlist" on public.admin_allowlist;
create policy "Admins can remove from the allowlist"
  on public.admin_allowlist for delete to authenticated
  using ((select public.is_admin()));

drop policy if exists "Admins can read users" on public.app_users;
create policy "Admins can read users"
  on public.app_users for select to authenticated
  using ((select public.is_admin()));
drop policy if exists "Admins can rename users" on public.app_users;
create policy "Admins can rename users"
  on public.app_users for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));


-- ─── Bootstrap (once per environment, after enabling the hook) ───
-- The first admin can't be invited from the UI:
--   insert into public.admin_allowlist (email) values ('you@example.com');
-- They become an admin the first time they sign in.
