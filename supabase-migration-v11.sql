-- ============================================
-- Migration v11: sms_notifications reads follow the access levels
-- ============================================
-- Run in the Supabase SQL Editor (DEV project first, then prod).
--
-- Prerequisites: supabase-sms-notifications-migration.sql (creates the table)
-- and supabase-admin-auth-migration.sql (defines can_access_queue()). This
-- MUST run after the latter — can_access_queue() does not exist before it.
--
-- Problem: the table's read policy was written when the shared password was the
-- only login, so `auth.role() = 'authenticated'` was a faithful proxy for
-- "staff". With Google admin sign-in, volunteer / admin / disabled / none are
-- all the same Postgres role `authenticated`, so that predicate no longer
-- distinguishes them — and in particular it ignores `disabled`, which is how
-- admin access is revoked.
--
-- sms_notifications holds to_phone and a body containing the client's first
-- name: the same client PII that attendees / work_orders / waiver_acceptances
-- restrict to can_access_queue(). This aligns it with them, so volunteers and
-- enabled admins can read it and nobody else can.
--
-- Writes are unaffected: they only ever happen from the claim-and-notify Edge
-- Function under the service role, which bypasses RLS. No app code reads this
-- table today, so nothing in the UI changes.
--
-- Safe to re-run.
-- ============================================

drop policy if exists "Staff can read sms notifications" on public.sms_notifications;
drop policy if exists "Volunteers and admins can read sms notifications" on public.sms_notifications;
create policy "Volunteers and admins can read sms notifications"
  on public.sms_notifications for select to authenticated
  using ((select public.can_access_queue()));
