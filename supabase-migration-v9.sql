-- ============================================
-- Repair Cafe Check-In — Migration V9
-- ============================================
-- Run in the Supabase SQL Editor (Dashboard → SQL Editor → New Query).
-- Prerequisite: supabase-migration.sql, supabase-rls-migration.sql,
--   supabase-pii-rls-fix.sql, v2–v6, supabase-status-overhaul.sql (V7), v8,
--   and supabase-metrics-migration.sql already run.
--
-- Adds the supply inventory index that backs the public /inventory page and the
-- Supplies tab in the staff portal. Replaces the printed paper index of
-- "which bin is this item in" that had to be re-printed after every change.
--
-- Additive only — a brand-new table, nothing else is touched — so it is safe to
-- run before the frontend ships. RUN ON THE DEV PROJECT FIRST, verify with
-- step 4, then run on prod.
--
-- Load the starting list with supabase-inventory-seed.sql after this.

-- ─── 1. Table ───
-- Trailer-wide, not per-event: the trailer and its bins are the same at every
-- event, so there is deliberately no event_id here.
--
-- bin is free text, not an enum or a foreign key to a bins table. The bins are
-- physical boxes whose codes change when the trailer gets rearranged, and the
-- index has no rows that exist independently of an item — a bin whose label was
-- all the information it carried (B3 "Power Strips") is stored as an item named
-- "Power strips" in bin B3, which is also what makes it findable by search.
CREATE TABLE IF NOT EXISTS inventory_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  bin        text NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT inventory_items_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT inventory_items_bin_not_blank  CHECK (btrim(bin)  <> '')
);

-- ─── 2. Indexes ───
-- The page reads the whole table and sorts A–Z; lower(name) so "Allen keys" and
-- "allen keys" sort together regardless of how they were typed in.
CREATE INDEX IF NOT EXISTS inventory_items_name_idx
  ON inventory_items (lower(name));

-- Stops the same item being listed in the same bin twice — the main way a
-- hand-maintained index rots. The same item in two DIFFERENT bins is still
-- allowed, and is real: the first aid kit is genuinely in both A1 and D1.
CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_name_bin_idx
  ON inventory_items (lower(name), bin);

-- ─── 3. Row level security ───
-- Same shape as events (supabase-rls-migration.sql): public read, staff write.
-- Public read is intentional and safe — an inventory index carries no PII, and
-- the whole point is that anyone at the event can look up a bin from their
-- phone without logging in.
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read inventory items"
  ON inventory_items FOR SELECT
  USING (true);

CREATE POLICY "Staff can create inventory items"
  ON inventory_items FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Staff can update inventory items"
  ON inventory_items FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Deliberate departure: every other table in this schema denies deletes with
-- USING (false), because their rows are event records that must not vanish.
-- This table is a working document — supplies genuinely leave the trailer — and
-- nothing references these rows, so a delete is self-contained and recoverable
-- by re-adding the item. Still staff-only.
CREATE POLICY "Staff can delete inventory items"
  ON inventory_items FOR DELETE
  USING (auth.role() = 'authenticated');

-- Deliberately NOT added to the supabase_realtime publication, same as events:
-- the inventory changes a few times a year, and both screens refetch on load.

-- ─── 4. Verification (read-only) ───
-- Every column should come back true.
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'inventory_items'
  ) AS table_exists,
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'inventory_items')
    AS rls_enabled,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'inventory_items') = 4
    AS four_policies,
  (SELECT count(*) FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'inventory_items'
      AND indexname IN ('inventory_items_name_idx', 'inventory_items_name_bin_idx')) = 2
    AS both_indexes;

-- After running supabase-inventory-seed.sql, this should report 229 items
-- across 34 bins:
-- SELECT count(*) AS items, count(DISTINCT bin) AS bins FROM inventory_items;
