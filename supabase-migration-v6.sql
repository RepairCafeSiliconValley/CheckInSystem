-- ============================================
-- Migration v6: Three-char code — exactly one digit in a random position
-- ============================================
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New Query).
--
-- Problem: The previous code generation picked 3 random chars from a combined
-- set of letters+digits, which occasionally produced all-letter codes that
-- spell out vulgar or offensive words.
--
-- Fix: Enforce that exactly one of the three positions holds a digit (2–9),
-- and the digit's position is itself random — so it's never locked to a fixed
-- slot. The two remaining positions always receive letters.
--
-- Allowed letters: ABCDEFGHJKLMNPQRSTUVWXYZ  (24 chars — no I or O)
-- Allowed digits:  23456789                   (8 chars  — no 0 or 1)
--
-- Possible codes: 3 positions × 8 digits × 24² letters = 13,824
-- (down from 32³ = 32,768 with the old approach, but ample for any event)

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
  v_digit_pos    integer;  -- which of the 3 positions (0/1/2) holds the digit
  v_char0        text;
  v_char1        text;
  v_char2        text;
  v_wo_id        uuid;
begin
  -- Generate a unique 3-character base code with exactly one digit in a
  -- random position, retrying on collision within this event.
  loop
    -- 4 random bytes:
    --   byte 0 → digit position (mod 3)
    --   bytes 1-3 → character selection for positions 0, 1, 2 respectively
    v_rand_bytes := gen_random_bytes(4);
    v_digit_pos  := get_byte(v_rand_bytes, 0) % 3;

    if v_digit_pos = 0 then
      v_char0 := substr(v_digits,  (get_byte(v_rand_bytes, 1) % length(v_digits))  + 1, 1);
      v_char1 := substr(v_letters, (get_byte(v_rand_bytes, 2) % length(v_letters)) + 1, 1);
      v_char2 := substr(v_letters, (get_byte(v_rand_bytes, 3) % length(v_letters)) + 1, 1);
    elsif v_digit_pos = 1 then
      v_char0 := substr(v_letters, (get_byte(v_rand_bytes, 1) % length(v_letters)) + 1, 1);
      v_char1 := substr(v_digits,  (get_byte(v_rand_bytes, 2) % length(v_digits))  + 1, 1);
      v_char2 := substr(v_letters, (get_byte(v_rand_bytes, 3) % length(v_letters)) + 1, 1);
    else
      v_char0 := substr(v_letters, (get_byte(v_rand_bytes, 1) % length(v_letters)) + 1, 1);
      v_char1 := substr(v_letters, (get_byte(v_rand_bytes, 2) % length(v_letters)) + 1, 1);
      v_char2 := substr(v_digits,  (get_byte(v_rand_bytes, 3) % length(v_digits))  + 1, 1);
    end if;

    v_base_code := v_char0 || v_char1 || v_char2;

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
-- Spot-check that generated codes always have exactly one digit:
-- do $$
-- declare
--   v_letters text := 'ABCDEFGHJKLMNPQRSTUVWXYZ';
--   v_digits  text := '23456789';
--   v_code    text;
--   v_digit_count integer;
--   i integer;
-- begin
--   for i in 1..1000 loop
--     -- simulate: one random digit in a random position, two random letters
--     v_code := '';
--     -- (just a quick sanity comment — run the real RPC for a live test)
--   end loop;
-- end;
-- $$;