-- ============================================
-- Repair Cafe Check-In — Migration V8
-- ============================================
-- Run in the Supabase SQL Editor (Dashboard → SQL Editor → New Query).
-- Prerequisite: supabase-migration.sql, supabase-rls-migration.sql,
--   supabase-pii-rls-fix.sql, v2–v6, and supabase-status-overhaul.sql (V7)
--   already run.
--
-- Adds per-event check-in settings so each event decides what it collects:
--   • collect_email  — show the Email Address field on the public check-in form
--   • collect_phone  — show the Cell Phone field on the public check-in form
--   • collect_weight — show a per-item Weight (kg) field at the front desk
--
-- Additive only, safe to run in one shot. collect_email/collect_phone default
-- to true so every existing event keeps its current behavior; collect_weight
-- defaults to false because it is new behavior nobody has opted into yet.
--
-- No RLS changes needed: events already grants public SELECT / authenticated
-- UPDATE at table level, and work_orders writes go through the same
-- authenticated path already used by the coordinator screens.

-- ─── 1. Per-event collection toggles ───
ALTER TABLE events
  ADD COLUMN collect_email  boolean NOT NULL DEFAULT true,
  ADD COLUMN collect_phone  boolean NOT NULL DEFAULT true,
  ADD COLUMN collect_weight boolean NOT NULL DEFAULT false;

-- ─── 2. Per-item weight ───
-- Nullable: an item can always be left unweighed. numeric(6,2) is exact
-- decimal (no float rounding when these get summed for reporting) and holds
-- 0.00–9999.99 kg at 10-gram resolution.
ALTER TABLE work_orders
  ADD COLUMN weight_kg numeric(6,2)
    CHECK (weight_kg IS NULL OR weight_kg >= 0);
