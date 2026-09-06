-- ============================================
-- Migration v7: Explicit SMS consent (text_message_opt_in)
-- ============================================
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New Query).
-- Validate on the DEV project first, then run on prod.
-- Prerequisite: supabase-migration.sql + v2–v6 + rls + pii-rls-fix + status-overhaul.
--
-- The check-in form used to carry a passive disclaimer ("By providing your
-- number, you consent…"). Twilio's A2P 10DLC rules want an affirmative,
-- unchecked-by-default opt-in, so the form now shows a checkbox with the full
-- consent language and records the answer here.
--
-- BEFORE RUNNING: this does a full `create or replace` of checkin_visitor using
-- the v6 body. If prod has drifted from supabase-migration-v6.sql, replacing it
-- would silently revert that drift. Confirm first:
--   select pg_get_functiondef(oid) from pg_proc where proname = 'checkin_visitor';
-- and diff against supabase-migration-v6.sql:26-112.

-- ─── 1. Add the column ───
-- Default `false` so any insert that omits the field cannot accidentally
-- opt someone in. The check-in form always sends an explicit boolean, and the
-- UI default is unchecked — consent must be an affirmative act.
alter table attendees
  add column if not exists text_message_opt_in boolean not null default false;

-- ─── 1b. No backfill, by decision ───
-- Existing rows stay `false`. The SMS flow had not shipped to production when
-- this was written, so no attendee had meaningfully consented under the old
-- passive disclaimer and there is nothing to grandfather in. Anyone already in
-- the table must re-consent through the check-in form to be textable.

-- ─── 2. Drop the current 11-arg overload ───
-- PostgreSQL allows overloads, but supabase-js calls the RPC by named args —
-- leaving the old signature in place produces "function is not unique" errors
-- at runtime.
drop function if exists public.checkin_visitor(
  uuid, text, text, text, jsonb, text, text, text, text, text, boolean
);

-- ─── 3. Recreate with p_text_message_opt_in appended ───
-- Body is v6 verbatim (letter-digit-letter code generation) with the single
-- change marked below. `set search_path to 'public', 'extensions', 'pg_temp'`
-- must be preserved: gen_random_bytes lives in the `extensions` schema and
-- will not resolve under SECURITY DEFINER without it.
create or replace function public.checkin_visitor(
  p_event_id            uuid,
  p_first_name          text,
  p_last_name           text,
  p_email               text,
  p_items               jsonb,
  p_phone               text    default null,
  p_zip_code            text    default '',
  p_waiver_version      text    default null,
  p_waiver_text         text    default null,
  p_waiver_hash         text    default null,
  p_newsletter_opt_in   boolean default false,
  p_text_message_opt_in boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_attendee_id  uuid;
  v_base_code    text;
  v_letters      text    := 'ABCDEFGHJKLMNPQRSTUVWXYZ';  -- 24 chars, no I/O
  v_digits       text    := '23456789';                   --  8 chars, no 0/1
  v_result       jsonb;
  v_items_result jsonb   := '[]'::jsonb;
  v_item         jsonb;
  v_index        integer := 0;
  v_rand_bytes   bytea;
  v_wo_id        uuid;
begin
  -- Generate a unique 3-character base code in the format [letter][digit][letter],
  -- retrying on collision within this event.
  loop
    -- 3 random bytes:
    --   byte 0 → letter for position 0
    --   byte 1 → digit  for position 1 (always the middle)
    --   byte 2 → letter for position 2
    v_rand_bytes := gen_random_bytes(3);

    v_base_code :=
      substr(v_letters, (get_byte(v_rand_bytes, 0) % length(v_letters)) + 1, 1) ||
      substr(v_digits,  (get_byte(v_rand_bytes, 1) % length(v_digits))  + 1, 1) ||
      substr(v_letters, (get_byte(v_rand_bytes, 2) % length(v_letters)) + 1, 1);

    exit when not exists (
      select 1 from work_orders
      where code like v_base_code || '-%'
        and event_id = p_event_id
    );
  end loop;

  -- Insert the attendee.  ← only change from v6: text_message_opt_in
  insert into attendees (
    event_id, first_name, last_name, email, phone, zip_code,
    newsletter_opt_in, text_message_opt_in
  )
  values (
    p_event_id, p_first_name, p_last_name, p_email, p_phone, p_zip_code,
    p_newsletter_opt_in, p_text_message_opt_in
  )
  returning id into v_attendee_id;

  -- Record waiver acceptance if provided.
  if p_waiver_version is not null then
    insert into waiver_acceptances (attendee_id, waiver_version, waiver_text, content_hash)
    values (v_attendee_id, p_waiver_version, p_waiver_text, p_waiver_hash);
  end if;

  -- Create one work order per item with suffixed code (e.g. A3B-1, A3B-2).
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_index := v_index + 1;
    insert into work_orders (code, attendee_id, event_id, item_name, description, priority)
    values (
      v_base_code || '-' || v_index,
      v_attendee_id,
      p_event_id,
      v_item->>'item_name',
      v_item->>'description',
      (v_item->>'priority')::integer
    )
    returning id into v_wo_id;

    v_items_result := v_items_result || jsonb_build_object(
      'code',     v_base_code || '-' || v_index,
      'id',       v_wo_id,
      'itemName', v_item->>'item_name',
      'priority', (v_item->>'priority')::integer
    );
  end loop;

  v_result := jsonb_build_object('baseCode', v_base_code, 'items', v_items_result);
  return v_result;
end;
$function$;

-- ─── 4. NOT DONE HERE: gating the actual send ───
-- This migration only records consent. Until claim-and-notify checks the
-- column, it still texts anyone with a phone on file — see
-- supabase/functions/claim-and-notify/index.ts:96. Gating needs two edits
-- there: add text_message_opt_in to the `attendees ( … )` select, and bail with
-- done(false, "no_consent") when it is false. Deploy that separately.

-- ============================================
-- Verification queries (run after the above succeeds)
-- ============================================
-- Column exists and is NOT NULL DEFAULT false:
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'attendees'
--   and column_name = 'text_message_opt_in';
--
-- Exactly ONE overload, ending in `p_text_message_opt_in boolean DEFAULT false`:
-- select pg_get_function_arguments(oid) from pg_proc where proname = 'checkin_visitor';
--
-- End-to-end: submit a check-in with the box ticked, then confirm it stuck:
-- select first_name, phone, newsletter_opt_in, text_message_opt_in
-- from attendees order by created_at desc limit 5;
