-- ============================================
-- Migration: new events start closed; remember when an event first opened
-- ============================================
-- Run in the Supabase SQL Editor (DEV project first, then prod).
--
-- Prerequisites: supabase-migration.sql (the events table). No function
-- dependencies, so it can run at any point after the base migration.
--
-- Why: an admin sets an event up ahead of time, so a new event should not be
-- accepting public check-ins until someone opens it. The Events tab labels its
-- button "Open Check-In" for an event that has never been open and "Reopen
-- Check-In" after that, which needs a record of whether it ever opened.
--
--   • events.is_open now defaults to false.
--   • events.first_opened_at is stamped by a trigger the first time is_open is
--     true (on insert or update), and never changed after that. A trigger
--     rather than the app, so an event opened by any path (SQL Editor, test
--     helpers) is recorded the same way.
--   • Backfill: every existing event was created under the old default (open),
--     so each one has been open at some point; it gets its created_at.
--
-- Safe to re-run.
-- ============================================

alter table public.events alter column is_open set default false;

alter table public.events add column if not exists first_opened_at timestamptz;

update public.events
set first_opened_at = coalesce(created_at, now())
where first_opened_at is null;

create or replace function public.stamp_event_first_opened()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  -- Once set, it stays: closing and reopening doesn't move it, and a client
  -- can't clear it to make an event look never-opened.
  if tg_op = 'UPDATE' and old.first_opened_at is not null then
    new.first_opened_at := old.first_opened_at;
  elsif new.is_open and new.first_opened_at is null then
    new.first_opened_at := now();
  end if;
  return new;
end;
$function$;

drop trigger if exists events_stamp_first_opened on public.events;
create trigger events_stamp_first_opened
  before insert or update on public.events
  for each row execute function public.stamp_event_first_opened();
