-- ============================================
-- Repair Cafe Check-In — Migration V9
-- ============================================
-- Run in the Supabase SQL Editor (Dashboard → SQL Editor → New Query).
-- Validate on the DEV project first, then run on prod.
-- Prerequisite: supabase-migration.sql + v2–v6 + rls + pii-rls-fix +
--   status-overhaul + v7 (text_message_opt_in) + v8 (collect_* / weight_kg).
--
-- Per-event wording for the text a client gets when a fixer claims their item.
-- Until now the copy was hardcoded in the claim-and-notify Edge Function, so
-- every event sent identical text. Coordinators asked to word it themselves —
-- different venues, different instructions about where to go.
--
-- The template supports three tokens, substituted at send time by the Edge
-- Function (NOT by Postgres):
--   [item_name]          → work_orders.item_name
--   [client_first_name]  → attendees.first_name
--   [fixer_name]         → the name the fixer typed on the claim screen
-- An unrecognised [token] is left in the message verbatim, so a typo is
-- visible in the delivered text rather than silently vanishing.
--
-- Additive only, safe to run in one shot.

-- ─── 1. Per-event message template ───
-- NOT NULL DEFAULT does three jobs at once: Postgres backfills every existing
-- event row with this text, inserts that omit the column still get a valid
-- value, and the Edge Function is guaranteed a string to work with.
--
-- The default is also duplicated in src/lib/textMessage.js, which pre-fills the
-- Create Event form. This copy becomes a frozen historical artifact the moment
-- the migration runs — the JS constant is the one to keep up to date.
--
-- Note the doubled apostrophe in 'It''s', and that the straight apostrophe is
-- deliberate: a curly one (U+2019) is outside GSM-7 and would push every
-- message into UCS-2, halving the per-segment limit from 160 to 70 characters
-- and billing two segments instead of one.
alter table events
  add column if not exists text_message_template text not null
  default 'It''s your turn! Come to the check-in desk to meet the Repair Café volunteer who will help you fix your [item_name].';

-- ─── 2. A blank template must be impossible ───
-- An empty body is rejected by Twilio, so the send would fail at the worst
-- possible moment. Same guard style as inventory_items.name.
alter table events
  drop constraint if exists events_text_message_template_not_blank;
alter table events
  add constraint events_text_message_template_not_blank
  check (btrim(text_message_template) <> '');

-- ─── 3. No RLS changes needed ───
-- events already has "Anyone can read events" (SELECT, true) and "Staff can
-- update events" (UPDATE, auth.role() = 'authenticated'). Note this makes the
-- template world-readable; that's acceptable for message copy, but it is not
-- staff-only and shouldn't be used to hold anything sensitive.

-- ============================================
-- Verification queries (run after the above succeeds)
-- ============================================
-- Column exists, NOT NULL, defaulted, and every existing row was backfilled:
-- select name, text_message_template from events;
--
-- The blank guard actually bites (this must ERROR):
-- update events set text_message_template = '   ';
