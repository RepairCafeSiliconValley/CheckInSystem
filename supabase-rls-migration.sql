-- ============================================
-- Repair Cafe Check-In — RLS Migration
-- ============================================
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- Prerequisite: supabase-migration.sql must have been run first

-- ─── 1. Events table RLS ───

alter table events enable row level security;

-- Anyone can read events (public check-in page needs event info)
create policy "Anyone can read events"
  on events for select
  using (true);

-- Only authenticated staff can create events
create policy "Staff can create events"
  on events for insert
  with check (auth.role() = 'authenticated');

-- Only authenticated staff can update events (toggle open/closed, etc.)
create policy "Staff can update events"
  on events for update
  using (auth.role() = 'authenticated');

-- No one can delete events
create policy "No event deletion"
  on events for delete
  using (false);

-- ─── 2. Attendees table RLS ───

alter table attendees enable row level security;

-- Anyone can read attendees (coordinator queue + RPC joins)
create policy "Anyone can read attendees"
  on attendees for select
  using (true);

-- Block direct inserts (checkin_visitor RPC is SECURITY DEFINER, bypasses RLS)
create policy "No direct attendee inserts"
  on attendees for insert
  with check (false);

-- Only authenticated staff can update attendee info
create policy "Staff can update attendees"
  on attendees for update
  using (auth.role() = 'authenticated');

-- No one can delete attendees
create policy "No attendee deletion"
  on attendees for delete
  using (false);

-- ─── 3. Work orders table RLS ───

alter table work_orders enable row level security;

-- Anyone can read work orders (fixer page + coordinator queue)
create policy "Anyone can read work orders"
  on work_orders for select
  using (true);

-- Block direct inserts (checkin_visitor RPC is SECURITY DEFINER, bypasses RLS)
create policy "No direct work order inserts"
  on work_orders for insert
  with check (false);

-- Only authenticated staff can update work orders directly
create policy "Staff can update work orders"
  on work_orders for update
  using (auth.role() = 'authenticated');

-- No one can delete work orders
create policy "No work order deletion"
  on work_orders for delete
  using (false);

-- ─── 4. Fixer outcome RPC (SECURITY DEFINER — bypasses RLS) ───
-- Allows the public fixer page to submit an outcome without auth

create or replace function submit_fixer_outcome(
  p_code text,
  p_fixer_name text,
  p_outcome text
) returns void as $$
begin
  update work_orders
  set fixer_name = p_fixer_name,
      outcome = p_outcome,
      status = 'completed'
  where code = p_code
    and status != 'completed';

  if not found then
    raise exception 'Work order not found or already completed';
  end if;
end;
$$ language plpgsql security definer;
