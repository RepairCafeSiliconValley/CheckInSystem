-- ============================================
-- Repair Cafe Check-In — Metrics Migration
-- ============================================
-- Run in the Supabase SQL Editor (Dashboard → SQL Editor → New Query).
-- Prerequisite: supabase-migration.sql, supabase-rls-migration.sql,
--   supabase-pii-rls-fix.sql, v2–v6, and supabase-status-overhaul.sql already run.
--
-- Supports the Metrics tab. Two independent concerns:
--   • Step 1 fixes a data-drift bug: commit 4574071 renamed the cancel reason
--     'No Show' → 'Client left' in src/lib/constants.js without backfilling the
--     rows. Left alone, the cancel-reason breakdown splits one reason into two.
--   • Step 2 adds the indexes every per-event query wants. The queue's realtime
--     handler refetches a whole event on EVERY row change and currently
--     sequential-scans each time.
--
-- The steps below are INDEPENDENT and can be run in stages.
-- RUN ON THE DEV PROJECT FIRST, then prod. Re-run step 0 on each project
-- separately — they are different databases and their legacy values may differ.

-- ─── 0. Audit (read-only — run first, on each project) ───
-- Shows every distinct value currently stored, so you can see what you are
-- about to change. Expect 'No Show' to appear under cancel_reason; anything
-- else unexpected is worth investigating before running step 1.
SELECT 'cancel_reason' AS column_name, COALESCE(cancel_reason, '(null)') AS value, count(*) AS rows
  FROM work_orders GROUP BY 2
UNION ALL
SELECT 'outcome', COALESCE(outcome, '(null)'), count(*)
  FROM work_orders GROUP BY 2
UNION ALL
SELECT 'not_fixed_reason', COALESCE(not_fixed_reason, '(null)'), count(*)
  FROM work_orders GROUP BY 2
UNION ALL
SELECT 'status', COALESCE(status, '(null)'), count(*)
  FROM work_orders GROUP BY 2
ORDER BY 1, 3 DESC;

-- ─── 1. Backfill the renamed cancel reason ───
-- 'No Show' was the old label for what the picker now calls 'Client left'.
-- Idempotent: touches only rows that still hold the old value, so it is safe
-- to re-run and safe on a project that has none.
-- Note: supabase-status-overhaul.sql step 2 mapped the legacy 'Abandoned'
-- outcome to cancel_reason='No Show', so older projects may hold more of these
-- than a freshly seeded one.
UPDATE work_orders
  SET cancel_reason = 'Client left'
  WHERE cancel_reason = 'No Show';

-- ─── 2. Indexes on event_id ───
-- Every per-event read filters on event_id: fetchVisitorGroups,
-- fetchMetricsRows, exportWorkOrdersCSV, exportAttendeesCSV and the live-event
-- refresh. Neither table has an index for it today — work_orders_code_event_unique
-- is on (code, event_id), and a btree can't serve a filter on its second column
-- alone — so all of those sequential-scan the table.
--
-- This is insurance, not a fix for anything currently slow: at a few dozen rows
-- Postgres will still (correctly) choose a seq scan. It matters as events
-- accumulate, because the queue's realtime handler refetches the whole event on
-- EVERY row change, for every connected staff device.
--
-- Deliberately NO index on work_orders(status): nothing filters by status in
-- SQL — the queue chips and every metric filter it in JS after the rows arrive.
-- An unused index costs write throughput on every insert and update and buys
-- nothing back.
--
-- Plain CREATE INDEX, not CONCURRENTLY — the SQL Editor wraps statements in a
-- transaction, and these tables are small enough that the brief write lock
-- isn't worth working around. IF NOT EXISTS makes this re-runnable.
CREATE INDEX IF NOT EXISTS work_orders_event_id_idx ON work_orders (event_id);
CREATE INDEX IF NOT EXISTS attendees_event_id_idx   ON attendees (event_id);

-- ─── 3. Verification (read-only) ───
-- Every row should come back ok=true. Any cancel_reason not in the current
-- CANCEL_REASONS list (src/lib/constants.js) means new drift to look at.
SELECT
  (SELECT count(*) FROM work_orders WHERE cancel_reason = 'No Show') = 0
    AS no_show_rows_cleared,
  NOT EXISTS (
    SELECT 1 FROM work_orders
    WHERE cancel_reason IS NOT NULL
      AND cancel_reason NOT IN (
        'Disallowed Item', 'Registration Closed', 'Mistake',
        'Never Checked In', 'Client left', 'Languished'
      )
  ) AS all_cancel_reasons_known,
  NOT EXISTS (
    SELECT 1 FROM work_orders
    WHERE outcome IS NOT NULL
      AND outcome NOT IN ('Fixed', 'Diagnosed', 'Not Fixed', 'Taken Home')
  ) AS all_outcomes_known,
  NOT EXISTS (
    SELECT 1 FROM work_orders WHERE status = 'canceled' AND outcome IS NOT NULL
  ) AS canceled_rows_have_no_outcome;
