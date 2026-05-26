-- ============================================
-- Repair Cafe Check-In — PII RLS Fix
-- ============================================
-- Run in the Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- Prerequisite: supabase-migration.sql + supabase-rls-migration.sql already run.
--
-- Problem: the anon key ships in every browser, and the SELECT policies on the
-- PII tables were `USING (true)` for the public role — so anyone could read
-- every attendee's name, email, phone, and zip via the REST API.
--
-- This migration:
--   1. Locks attendees / work_orders / waiver_acceptances reads to staff only.
--   2. Adds get_fixer_work_order() so the public /fix/:id page still works,
--      returning only the fields it needs with the surname abbreviated in SQL.
--   3. Pins search_path on the in-use SECURITY DEFINER functions (hardening).

-- ─── 1. Lock PII / linkable tables to authenticated reads ───

drop policy if exists "Anyone can read attendees" on attendees;
create policy "Staff can read attendees"
  on attendees for select
  using (auth.role() = 'authenticated');

drop policy if exists "Anyone can read work orders" on work_orders;
create policy "Staff can read work orders"
  on work_orders for select
  using (auth.role() = 'authenticated');

drop policy if exists "Allow read" on waiver_acceptances;
create policy "Staff can read waivers"
  on waiver_acceptances for select
  using (auth.role() = 'authenticated');

-- events stays public (no PII; the public check-in page needs it).

-- ─── 2. Public fixer RPC (SECURITY DEFINER — narrow, read-only gate) ───
-- Returns only the fields /fix/:id renders. The last name is abbreviated here
-- so the full surname never leaves the database.

create or replace function get_fixer_work_order(p_id uuid)
returns table (
  id uuid,
  code text,
  priority int,
  status text,
  item_name text,
  category text,
  description text,
  outcome text,
  fixer_name text,
  client_name text
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select w.id, w.code, w.priority, w.status,
         w.item_name, w.category, w.description,
         w.outcome, w.fixer_name,
         a.first_name || ' ' || upper(left(coalesce(a.last_name, ''), 1)) || '.'
  from work_orders w
  join attendees a on a.id = w.attendee_id
  where w.id = p_id;
$$;

revoke all on function get_fixer_work_order(uuid) from public;
grant execute on function get_fixer_work_order(uuid) to anon, authenticated;

-- ─── 3. Hardening: pin search_path on the in-use SECURITY DEFINER functions ───

alter function public.checkin_visitor(
  uuid, text, text, text, jsonb, text, text, text, text, text
) set search_path = public, pg_temp;

alter function public.submit_fixer_outcome(uuid, text, text)
  set search_path = public, pg_temp;
