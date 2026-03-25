-- ============================================
-- Repair Cafe Check-In — Supabase Migration
-- ============================================
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New Query)

-- 1. Events table
create table events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  date date not null,
  location text,
  is_open boolean not null default true,
  created_at timestamptz default now()
);

-- 2. Attendees table
create table attendees (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) not null,
  name text not null,
  email text,
  phone text,
  zip_code text not null default '',
  created_at timestamptz default now()
);

-- 3. Work orders table
create table work_orders (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  attendee_id uuid references attendees(id) not null,
  event_id uuid references events(id) not null,
  item_name text not null,
  category text not null,
  description text not null,
  priority integer not null default 1,
  status text not null default 'pending',
  outcome text,
  fixer_name text default '',
  created_at timestamptz default now()
);

-- 4. Atomic check-in RPC function (codes generated server-side)
-- Returns: { "baseCode": "R-M4K", "items": [{ "code": "R-M4K-1", "itemName": "...", "priority": 1 }, ...] }
create or replace function checkin_visitor(
  p_event_id uuid,
  p_name text,
  p_email text,
  p_items jsonb,
  p_phone text default null,
  p_zip_code text default ''
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
begin
  -- Generate unique base code server-side (retry on collision)
  loop
    v_base_code := 'R-';
    v_rand_bytes := gen_random_bytes(3);
    for v_i in 0..2 loop
      v_base_code := v_base_code || substr(v_chars, (get_byte(v_rand_bytes, v_i) % length(v_chars)) + 1, 1);
    end loop;
    exit when not exists (
      select 1 from work_orders where code like v_base_code || '-%'
    );
  end loop;

  -- Insert attendee
  insert into attendees (event_id, name, email, phone, zip_code)
  values (p_event_id, p_name, p_email, p_phone, p_zip_code)
  returning id into v_attendee_id;

  -- Insert each work order with suffixed code (R-M4K-1, R-M4K-2)
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_index := v_index + 1;
    insert into work_orders (code, attendee_id, event_id, item_name, category, description, priority)
    values (
      v_base_code || '-' || v_index,
      v_attendee_id,
      p_event_id,
      v_item->>'item_name',
      v_item->>'category',
      v_item->>'description',
      (v_item->>'priority')::integer
    );

    v_items_result := v_items_result || jsonb_build_object(
      'code', v_base_code || '-' || v_index,
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

-- 5. Enable Realtime for live queue updates
alter publication supabase_realtime add table attendees;
alter publication supabase_realtime add table work_orders;

-- ============================================
-- MANUAL STEPS (do these in the Supabase Dashboard):
--
-- 1. Go to Authentication → Users → Add User
--    Email: admin@repaircafe.app
--    Password: (your shared staff password)
--
-- 2. RLS is disabled by default on new tables — leave it
--    disabled for now (per the brief). You can add policies later.
-- ============================================
