-- ============================================
-- Newsletter Opt-In — Supabase Migration
-- ============================================
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New Query).
--
-- Adds a `newsletter_opt_in` column to `attendees` so the check-in form can
-- capture whether the visitor wants Repair Café Silicon Valley newsletter
-- emails, and updates the `checkin_visitor` RPC to write the value.

-- 1. Add the column.
--    Column default is `false` (not `true`) so any direct insert that omits
--    the field doesn't accidentally subscribe people. The check-in form
--    always sends an explicit boolean — UI default is `true`.
alter table attendees
  add column newsletter_opt_in boolean not null default false;

-- 2. Drop the existing 10-arg checkin_visitor overload so the new 11-arg
--    signature is unambiguous for PostgREST. (PostgreSQL allows multiple
--    overloads with the same name, but supabase-js calls the RPC by named
--    args — keeping the old one around would cause "function not unique"
--    errors at runtime.)
drop function if exists public.checkin_visitor(
  uuid, text, text, text, jsonb, text, text, text, text, text
);

-- 3. Recreate the RPC with the new p_newsletter_opt_in param appended.
--    Preserves `SET search_path = 'public', 'extensions', 'pg_temp'`
--    (from migration 20260526011115 pii_rls_fix_searchpath_extensions),
--    which is required so `gen_random_bytes` (in the `extensions` schema)
--    still resolves under SECURITY DEFINER.
create or replace function public.checkin_visitor(
  p_event_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_items jsonb,
  p_phone text default null,
  p_zip_code text default '',
  p_waiver_version text default null,
  p_waiver_text text default null,
  p_waiver_hash text default null,
  p_newsletter_opt_in boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_attendee_id uuid;
  v_base_code text;
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_result jsonb;
  v_items_result jsonb := '[]'::jsonb;
  v_item jsonb;
  v_index integer := 0;
  v_i integer;
  v_rand_bytes bytea;
  v_wo_id uuid;
begin
  -- Generate a unique 3-character base code, retrying on collision within this event.
  loop
    v_base_code := '';
    v_rand_bytes := gen_random_bytes(3);
    for v_i in 0..2 loop
      v_base_code := v_base_code || substr(v_chars, (get_byte(v_rand_bytes, v_i) % length(v_chars)) + 1, 1);
    end loop;
    exit when not exists (
      select 1 from work_orders
      where code like v_base_code || '-%'
        and event_id = p_event_id
    );
  end loop;

  -- Insert the attendee with the new newsletter_opt_in value.
  insert into attendees (event_id, first_name, last_name, email, phone, zip_code, newsletter_opt_in)
  values (p_event_id, p_first_name, p_last_name, p_email, p_phone, p_zip_code, p_newsletter_opt_in)
  returning id into v_attendee_id;

  -- Record waiver acceptance if provided.
  if p_waiver_version is not null then
    insert into waiver_acceptances (attendee_id, waiver_version, waiver_text, content_hash)
    values (v_attendee_id, p_waiver_version, p_waiver_text, p_waiver_hash);
  end if;

  -- Create one work order per item with suffixed code (e.g. M4K-1, M4K-2).
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
      'code', v_base_code || '-' || v_index,
      'id', v_wo_id,
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
-- Should return one row:
-- select column_name from information_schema.columns
-- where table_schema='public' and table_name='attendees'
--   and column_name='newsletter_opt_in';
--
-- Should show a single overload ending in `p_newsletter_opt_in boolean DEFAULT false`:
-- select pg_get_function_arguments(oid) from pg_proc where proname='checkin_visitor';
