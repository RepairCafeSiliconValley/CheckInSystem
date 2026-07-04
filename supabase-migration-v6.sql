-- ============================================
-- Migration v6: Three-char code — digit always in the middle position
-- ============================================
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New Query).
--
-- Problem: The previous code generation picked 3 random chars from a combined
-- set of letters+digits, which occasionally produced all-letter codes that
-- spell out vulgar or offensive words.
--
-- Fix: The middle character (position 1) is always a digit (2–9); positions 0
-- and 2 are always letters. The digit acts as a fixed separator, guaranteeing
-- no two adjacent letters can form a recognizable word.
--
-- Code format: [letter][digit][letter]  e.g. A3B, K7M, X2P
--
-- Allowed letters: ABCDEFGHJKLMNPQRSTUVWXYZ  (24 chars — no I or O)
-- Allowed digits:  23456789                   (8 chars  — no 0 or 1)
--
-- Possible codes: 24 × 8 × 24 = 4,608  (ample for any single event)

-- Drop the current overload so the replacement is unambiguous.
drop function if exists public.checkin_visitor(
  uuid, text, text, text, jsonb, text, text, text, text, text, boolean
);

create or replace function public.checkin_visitor(
  p_event_id          uuid,
  p_first_name        text,
  p_last_name         text,
  p_email             text,
  p_items             jsonb,
  p_phone             text    default null,
  p_zip_code          text    default '',
  p_waiver_version    text    default null,
  p_waiver_text       text    default null,
  p_waiver_hash       text    default null,
  p_newsletter_opt_in boolean default false
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

  -- Insert the attendee.
  insert into attendees (event_id, first_name, last_name, email, phone, zip_code, newsletter_opt_in)
  values (p_event_id, p_first_name, p_last_name, p_email, p_phone, p_zip_code, p_newsletter_opt_in)
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

-- ============================================
-- Verification queries (run after the above succeeds)
-- ============================================
-- Confirm the function exists with the right signature:
-- select pg_get_function_arguments(oid) from pg_proc where proname = 'checkin_visitor';
--
-- Spot-check that generated codes always follow the [letter][digit][letter] format:
-- select checkin_visitor(...) a few times and confirm middle char is always a digit.