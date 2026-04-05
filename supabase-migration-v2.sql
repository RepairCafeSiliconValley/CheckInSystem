-- ============================================
-- Repair Cafe Check-In — Migration V2
-- ============================================
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- Prerequisite: supabase-migration.sql and supabase-rls-migration.sql must have been run first
--
-- Changes:
--   1. Shorten attendee codes from R-XXX to XXX (remove prefix)
--   2. Scope code uniqueness per event (not global)
--   3. Add is_volunteer boolean to attendees
--   4. Return work order IDs in checkin RPC (for UUID-based QR codes)
--   5. Update submit_fixer_outcome to accept work order UUID instead of code

-- ─── 1. Add is_volunteer column ───
ALTER TABLE attendees ADD COLUMN is_volunteer boolean NOT NULL DEFAULT false;

-- ─── 2. Change unique constraint from global to per-event ───
ALTER TABLE work_orders DROP CONSTRAINT work_orders_code_key;
ALTER TABLE work_orders ADD CONSTRAINT work_orders_code_event_unique UNIQUE (code, event_id);

-- ─── 3. Replace checkin_visitor with shorter codes + per-event uniqueness + UUID returns ───
CREATE OR REPLACE FUNCTION checkin_visitor(
  p_event_id uuid,
  p_name text,
  p_email text,
  p_items jsonb,
  p_phone text default null,
  p_zip_code text default '',
  p_waiver_version text default null,
  p_waiver_text text default null,
  p_waiver_hash text default null
) returns jsonb as $$
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
  -- Generate unique 3-character base code (retry on collision within this event)
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

  -- Insert attendee
  insert into attendees (event_id, name, email, phone, zip_code)
  values (p_event_id, p_name, p_email, p_phone, p_zip_code)
  returning id into v_attendee_id;

  -- Insert waiver acceptance (if waiver data provided)
  if p_waiver_version is not null then
    insert into waiver_acceptances (attendee_id, waiver_version, waiver_text, content_hash)
    values (v_attendee_id, p_waiver_version, p_waiver_text, p_waiver_hash);
  end if;

  -- Insert each work order with suffixed code (M4K-1, M4K-2)
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

  v_result := jsonb_build_object(
    'baseCode', v_base_code,
    'items', v_items_result
  );

  return v_result;
end;
$$ language plpgsql security definer;

-- ─── 4. Replace submit_fixer_outcome to use work order UUID ───
DROP FUNCTION IF EXISTS submit_fixer_outcome(text, text, text);

CREATE OR REPLACE FUNCTION submit_fixer_outcome(
  p_work_order_id uuid,
  p_fixer_name text,
  p_outcome text
) returns void as $$
begin
  update work_orders
  set fixer_name = p_fixer_name,
      outcome = p_outcome,
      status = 'completed'
  where id = p_work_order_id
    and status != 'completed';

  if not found then
    raise exception 'Work order not found or already completed';
  end if;
end;
$$ language plpgsql security definer;
