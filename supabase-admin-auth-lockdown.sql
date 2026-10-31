-- ============================================
-- Admin auth lockdown (PR 3)
-- ============================================
-- Design: docs/admin-auth-plan.md.
--
-- Prerequisite: supabase-admin-auth-migration.sql. Ship together with the
-- /admin Google login: after this, only admins can create or edit events, so
-- bootstrap the first admin in that environment first.
--
--   1. Events: create and update move from can_access_queue() to is_admin().
--   2. app_users: a signed-in user can read their own row, so /admin can tell
--      a disabled admin apart from someone who was never an admin.
--
-- Safe to re-run.
-- ============================================


-- ─── 1. Events: admins only ───

drop policy if exists "Volunteers and admins can create events" on public.events;
drop policy if exists "Volunteers and admins can update events" on public.events;

drop policy if exists "Admins can create events" on public.events;
create policy "Admins can create events"
  on public.events for insert to authenticated
  with check ((select public.is_admin()));

drop policy if exists "Admins can update events" on public.events;
create policy "Admins can update events"
  on public.events for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));


-- ─── 2. app_users: read your own row ───

drop policy if exists "Users can read their own row" on public.app_users;
create policy "Users can read their own row"
  on public.app_users for select to authenticated
  using (id = (select auth.uid()));
