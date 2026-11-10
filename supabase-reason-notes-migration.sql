-- ============================================
-- Repair Cafe Check-In — Reason Notes Migration
-- ============================================
-- Run in the Supabase SQL Editor (Dashboard → SQL Editor → New Query).
-- Prerequisite: the full chain through supabase-metrics-migration.sql
--   (needs supabase-status-overhaul.sql's 4-arg submit_fixer_outcome).
--
-- Adds an "Other" catch-all to CANCEL_REASONS and NOT_FIXED_REASONS
-- (src/lib/constants.js). When "Other" is picked, staff/fixers may type an
-- optional note. The note lives in its own column so cancel_reason /
-- not_fixed_reason keep holding only canonical values for the Metrics tab.
--
-- The notes are free text and may contain PII. They are deliberately NOT
-- returned by get_fixer_work_order (public) and NOT selected by the metrics
-- query or CSV export.
--
-- RUN ON THE DEV PROJECT FIRST, then prod — and on prod BEFORE the app
-- release that uses these columns ships.

-- ─── 1. Note columns ───
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS cancel_note text;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS not_fixed_note text;

-- ─── 2. Replace submit_fixer_outcome to capture not_fixed_note ───
-- Signature changes (adds p_not_fixed_note), so drop the old 4-arg version
-- first to avoid an ambiguous overload.
DROP FUNCTION IF EXISTS submit_fixer_outcome(uuid, text, text, text);

CREATE OR REPLACE FUNCTION submit_fixer_outcome(
  p_work_order_id uuid,
  p_fixer_name text,
  p_outcome text,
  p_not_fixed_reason text default null,
  p_not_fixed_note text default null
) returns void as $$
begin
  update work_orders
  set fixer_name = p_fixer_name,
      outcome = p_outcome,
      not_fixed_reason = p_not_fixed_reason,
      not_fixed_note = p_not_fixed_note,
      status = 'completed',
      completed_at = now()
  where id = p_work_order_id
    and status != 'completed';

  if not found then
    raise exception 'Work order not found or already completed';
  end if;
end;
$$ language plpgsql security definer;

-- Re-apply the public grants + pinned search_path for the new signature
-- (same as supabase-status-overhaul.sql).
revoke all on function submit_fixer_outcome(uuid, text, text, text, text) from public;
grant execute on function submit_fixer_outcome(uuid, text, text, text, text) to anon, authenticated;
alter function public.submit_fixer_outcome(uuid, text, text, text, text)
  set search_path = public, pg_temp;

-- ─── 3. Verify ───
-- Expect two rows (the new columns) and one function with 5 args.
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'work_orders' AND column_name IN ('cancel_note', 'not_fixed_note');
SELECT oid::regprocedure FROM pg_proc WHERE proname = 'submit_fixer_outcome';
