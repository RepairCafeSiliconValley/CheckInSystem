-- ============================================
-- Repair Cafe Check-In — Seed Data
-- ============================================
-- Run this in the Supabase SQL Editor to populate mock data.
-- Safe to re-run: uses fixed UUIDs so it will error (not duplicate)
-- if data already exists. Delete rows first if you want to re-seed.

-- Insert a mock event
insert into events (id, name, date, location)
values ('00000000-0000-0000-0000-000000000001', 'Milpitas Library', '2026-03-15', 'Milpitas, CA');

-- Insert two mock attendees
insert into attendees (id, event_id, name, email)
values
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Maria Garcia', 'maria.g@email.com'),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'James Chen', 'jchen88@email.com');

-- Insert mock work orders
insert into work_orders (code, attendee_id, event_id, item_name, category, description, priority, status)
values
  ('R-M4K', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'KitchenAid Mixer', 'Appliances', 'Motor makes grinding noise, won''t turn on consistently', 1, 'pending'),
  ('R-G7P', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Winter jacket', 'Clothing & Textiles', 'Zipper is stuck halfway, pull tab broke off', 2, 'reviewed'),
  ('R-J2N', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Bluetooth speaker', 'Electronics', 'Charges but no sound comes out, tried resetting', 1, 'completed');

-- Update the completed one with outcome
update work_orders set outcome = 'Fixed', fixer_name = 'Sam' where code = 'R-J2N';

-- View everything joined together
select
  e.name as event,
  a.name as visitor,
  a.email,
  wo.code,
  wo.item_name,
  wo.category,
  wo.priority,
  wo.status,
  wo.outcome,
  wo.fixer_name
from work_orders wo
join attendees a on a.id = wo.attendee_id
join events e on e.id = wo.event_id
order by a.name, wo.priority;
