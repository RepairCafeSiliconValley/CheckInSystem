-- ============================================
-- Repair Cafe Check-In — Migration V7
-- ============================================
-- Run in the Supabase SQL Editor (Dashboard → SQL Editor → New Query).
-- Prerequisite: supabase-migration.sql, supabase-rls-migration.sql,
--   supabase-pii-rls-fix.sql, and v2–v6 already run.
--
-- Overhauls the Status ↔ Outcome model so status is derived from outcome:
--   • Canceled (item left before it was worked): status='canceled',
--     outcome=NULL, cancel_reason=<why>. Can happen at any point before an
--     outcome is recorded (including while still 'pending', pre-print).
--   • Completed (any outcome recorded): status='completed',
--     outcome ∈ {Fixed, Diagnosed, Not Fixed, Taken Home}.
--   • Not Fixed additionally carries not_fixed_reason=<why>.
-- outcome stays NULL for canceled rows (status already says 'canceled').
--
-- The four steps below are INDEPENDENT and can be run in stages:
--   Step 1 alone unblocks all coordinator-side testing (cancel + not-fixed
--     reasons write via a direct table UPDATE, not an RPC).
--   Steps 3–4 are only needed before testing the public /fix/ page's
--     not-fixed-reason submission.
--   Step 2 (backfill) touches only old rows — run it whenever.

-- ─── 1. Add reason columns (run first) ───
ALTER TABLE work_orders ADD COLUMN cancel_reason text;
ALTER TABLE work_orders ADD COLUMN not_fixed_reason text;

-- ─── 2. Backfill legacy Languished/Abandoned outcomes into the canceled model ───
-- Languished maps to itself; Abandoned is remapped to 'No Show' (both are values
-- in the new CANCEL_REASONS picker). completed_at is left as-is (terminal time).
UPDATE work_orders
  SET status = 'canceled',
      cancel_reason = CASE WHEN outcome = 'Abandoned' THEN 'No Show' ELSE outcome END,
      outcome = NULL
  WHERE outcome IN ('Languished', 'Abandoned');

-- ─── 3. Replace submit_fixer_outcome to capture not_fixed_reason ───
-- Signature changes (adds p_not_fixed_reason), so drop the old 3-arg version
-- first to avoid an ambiguous overload. Fixers never cancel — always completed.
DROP FUNCTION IF EXISTS submit_fixer_outcome(uuid, text, text);

CREATE OR REPLACE FUNCTION submit_fixer_outcome(
  p_work_order_id uuid,
  p_fixer_name text,
  p_outcome text,
  p_not_fixed_reason text default null
) returns void as $$
begin
  update work_orders
  set fixer_name = p_fixer_name,
      outcome = p_outcome,
      not_fixed_reason = p_not_fixed_reason,
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
-- (see supabase-pii-rls-fix.sql; no extensions schema needed — no pgcrypto here).
revoke all on function submit_fixer_outcome(uuid, text, text, text) from public;
grant execute on function submit_fixer_outcome(uuid, text, text, text) to anon, authenticated;
alter function public.submit_fixer_outcome(uuid, text, text, text)
  set search_path = public, pg_temp;

-- ─── 4. Replace get_fixer_work_order to return not_fixed_reason ───
-- Lets the public /fix/ "Already Completed" screen show why an item wasn't
-- fixed. No cancel_reason exposed — the canceled screen uses only status.
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
  not_fixed_reason text,
  fixer_name text,
  client_name text
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select w.id, w.code, w.priority, w.status,
         w.item_name, w.category, w.description,
         w.outcome, w.not_fixed_reason, w.fixer_name,
         a.first_name || ' ' || upper(left(coalesce(a.last_name, ''), 1)) || '.'
  from work_orders w
  join attendees a on a.id = w.attendee_id
  where w.id = p_id;
$$;

revoke all on function get_fixer_work_order(uuid) from public;
grant execute on function get_fixer_work_order(uuid) to anon, authenticated;
