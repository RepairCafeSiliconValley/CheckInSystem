-- ============================================
-- Repair Cafe Check-In — Queue Role / Least-Privilege PII Split
-- ============================================
-- Run in the Supabase SQL Editor (Dashboard → SQL Editor → New Query).
-- Prerequisite: supabase-migration.sql + supabase-rls-migration.sql +
--               supabase-pii-rls-fix.sql already run.
--
-- Goal: split staff access into two Supabase Auth accounts and block the
-- front-desk (queue) account from attendee PII at the DATABASE layer, so
-- contact data never reaches the front-desk laptop — not even via the REST API.
--
--   admin@repaircafe.app  → full PII + admin actions
--   queue@repaircafe.app  → PII-free RPCs only (first name + last initial)
--
-- Create both Auth users in the Dashboard (Authentication → Users) before
-- relying on Part B. The queue user is required to test the /queue frontend.
--
-- ┌────────────────────────────────────────────────────────────────────────┐
-- │ This file has TWO independently-runnable parts. Run them separately.     │
-- │                                                                          │
-- │  PART A — additive. Only ADDS two RPCs. Nothing existing changes, and     │
-- │           main/production is unaffected. This is all the queue frontend   │
-- │           needs to work end-to-end. Safe to run anytime.                  │
-- │                                                                          │
-- │  PART B — restrictive. REPLACES RLS policies to lock PII to the admin     │
-- │           account. Takes effect on production the instant it runs, so     │
-- │           run it only once the frontend is verified and you're about to   │
-- │           merge. main authenticates as admin@repaircafe.app, so it keeps  │
-- │           working — PROVIDED the email strings below match exactly.       │
-- └────────────────────────────────────────────────────────────────────────┘


-- ══════════════════════════════════════════════════════════════════════════
-- PART A — PII-free queue RPCs (additive; safe to run now)
-- ══════════════════════════════════════════════════════════════════════════
-- Mirrors get_fixer_work_order (supabase-pii-rls-fix.sql): the surname is
-- abbreviated to an initial in SQL so the full last name never leaves the DB.
-- Only first name + last initial + volunteer flag are returned — no email,
-- phone, or zip. Granted to authenticated (both staff accounts); the queue
-- frontend is the intended caller.

-- All attendees for an event (drives the queue list).
create or replace function get_queue_attendees(p_event_id uuid)
returns table (
  id uuid,
  event_id uuid,
  first_name text,
  last_initial text,
  is_volunteer boolean
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select a.id,
         a.event_id,
         a.first_name,
         upper(left(coalesce(a.last_name, ''), 1)) || '.' as last_initial,
         a.is_volunteer
  from attendees a
  where a.event_id = p_event_id;
$$;

revoke all on function get_queue_attendees(uuid) from public;
grant execute on function get_queue_attendees(uuid) to authenticated;

-- Single attendee by id (drives the queue detail view).
create or replace function get_queue_attendee(p_id uuid)
returns table (
  id uuid,
  event_id uuid,
  first_name text,
  last_initial text,
  is_volunteer boolean
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select a.id,
         a.event_id,
         a.first_name,
         upper(left(coalesce(a.last_name, ''), 1)) || '.' as last_initial,
         a.is_volunteer
  from attendees a
  where a.id = p_id;
$$;

revoke all on function get_queue_attendee(uuid) from public;
grant execute on function get_queue_attendee(uuid) to authenticated;


-- ══════════════════════════════════════════════════════════════════════════
-- PART B — lock PII + admin writes to the admin account (restrictive)
-- ══════════════════════════════════════════════════════════════════════════
-- Run this only after the queue frontend is verified. It replaces the
-- "any authenticated staff" policies with "admin email only". work_orders
-- SELECT/UPDATE stay open to any authenticated user (no attendee PII there,
-- and the queue must manage them). events SELECT stays public (check-in page).

-- ─── Attendees: reads + updates → admin only ───
-- (Queue account reads attendees exclusively through the Part A RPCs.)
drop policy if exists "Staff can read attendees" on attendees;
create policy "Admin can read attendees"
  on attendees for select
  using (auth.jwt() ->> 'email' = 'admin@repaircafe.app');

drop policy if exists "Staff can update attendees" on attendees;
create policy "Admin can update attendees"
  on attendees for update
  using (auth.jwt() ->> 'email' = 'admin@repaircafe.app');

-- ─── Waiver acceptances: reads → admin only (linkable to PII) ───
drop policy if exists "Staff can read waivers" on waiver_acceptances;
create policy "Admin can read waivers"
  on waiver_acceptances for select
  using (auth.jwt() ->> 'email' = 'admin@repaircafe.app');

-- ─── Events: create / edit → admin only ───
-- (Public SELECT is unchanged; the check-in page still needs to read events.)
drop policy if exists "Staff can create events" on events;
create policy "Admin can create events"
  on events for insert
  with check (auth.jwt() ->> 'email' = 'admin@repaircafe.app');

drop policy if exists "Staff can update events" on events;
create policy "Admin can update events"
  on events for update
  using (auth.jwt() ->> 'email' = 'admin@repaircafe.app');
