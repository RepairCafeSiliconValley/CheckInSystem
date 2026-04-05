-- ============================================
-- Repair Cafe Check-In — Migration V3
-- ============================================
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- Prerequisite: supabase-migration.sql, supabase-rls-migration.sql, and
--               supabase-migration-v2.sql must have been run first
--
-- Changes:
--   1. Add printed_at and completed_at timestamp columns to work_orders
--   2. Rename statuses: reviewed → pending_assignment, in-progress → pending_assignment
--   3. Update submit_fixer_outcome RPC to set completed_at
--   4. Backfill completed_at for existing completed work orders

-- ─── 1. Add timestamp columns ───
ALTER TABLE work_orders ADD COLUMN printed_at timestamptz;
ALTER TABLE work_orders ADD COLUMN completed_at timestamptz;

-- ─── 2. Rename statuses ───
UPDATE work_orders SET status = 'pending_assignment' WHERE status = 'reviewed';
UPDATE work_orders SET status = 'pending_assignment' WHERE status = 'in-progress';

-- ─── 3. Backfill completed_at for existing completed orders ───
UPDATE work_orders SET completed_at = created_at WHERE status = 'completed' AND completed_at IS NULL;

-- ─── 4. Replace submit_fixer_outcome to set completed_at ───
DROP FUNCTION IF EXISTS submit_fixer_outcome(uuid, text, text);

CREATE OR REPLACE FUNCTION submit_fixer_outcome(
  p_work_order_id uuid,
  p_fixer_name text,
  p_outcome text
) returns void as $$
begin
  update work_orders
  set fixer_name = p_fixer_name,
      outcome = p_outcome,
      status = 'completed',
      completed_at = now()
  where id = p_work_order_id
    and status != 'completed';

  if not found then
    raise exception 'Work order not found or already completed';
  end if;
end;
$$ language plpgsql security definer;
