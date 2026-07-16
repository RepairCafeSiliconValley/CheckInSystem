-- ============================================
-- Repair Cafe Check-In — SMS Notifications
-- ============================================
-- Run in the Supabase SQL Editor (Dashboard → SQL Editor → New Query).
-- Validate on the DEV project first, then run on prod.
-- Prerequisite: supabase-migration.sql + v2–v6 + rls + pii-rls-fix + status-overhaul.
--
-- Backs the "call the client over" flow: when a fixer scans the ticket's claim QR
-- and taps "Start work & call client over", the claim-and-notify Edge Function
--   1. sets the work order to 'assigned' (With Fixer) + records the fixer name, and
--   2. best-effort texts the client via Twilio (only if a phone is on file).
--
-- This table is the audit trail AND the once-only ledger: the Edge Function refuses
-- to send a second 'summon' SMS for a work order that already has one logged here,
-- so a re-scanned/re-shared QR can't double-charge or spam the client.
--
-- The Edge Function writes here with the service-role key (bypasses RLS); no anon
-- or authenticated INSERT policy is granted. Staff can read for auditing.

-- ─── 1. (Optional) record when an item was picked up by a fixer ───
-- Lets you report on wait-time-to-first-touch. Safe to skip; the flow works without it.
alter table work_orders add column if not exists assigned_at timestamptz;

-- ─── 2. SMS notification ledger ───
create table if not exists sms_notifications (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references work_orders(id) on delete cascade,
  attendee_id uuid references attendees(id) on delete set null,
  event_id uuid references events(id) on delete set null,
  to_phone text,
  message_type text not null default 'summon',
  body text,
  twilio_sid text,
  status text,           -- Twilio message status, or 'skipped' / 'failed'
  error text,            -- populated when the send fails
  created_at timestamptz not null default now()
);

-- One send per (work order, message type): the Edge Function checks this before
-- calling Twilio, and the DB enforces it as a backstop. Failed attempts are logged
-- separately so they don't block a genuine retry (see partial index below).
create unique index if not exists sms_notifications_sent_once
  on sms_notifications (work_order_id, message_type)
  where status is distinct from 'failed';

-- Fast lookup of a work order's notification history.
create index if not exists sms_notifications_work_order_idx
  on sms_notifications (work_order_id);

-- ─── 3. RLS: staff-only reads; writes happen via the service role only ───
alter table sms_notifications enable row level security;

drop policy if exists "Staff can read sms notifications" on sms_notifications;
create policy "Staff can read sms notifications"
  on sms_notifications for select
  using (auth.role() = 'authenticated');
