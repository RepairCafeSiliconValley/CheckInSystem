-- ============================================
-- Repair Cafe Check-In — Seed Data (dev)
-- ============================================
-- Run this in the Supabase SQL Editor (or via the MCP) to populate a
-- DEV database with realistic mock data. NOT for production.
--
-- Safe to re-run: it truncates the four app tables first, then re-inserts.
-- Uses fixed UUIDs for events/attendees so rows are easy to reference.
--
-- Coverage:
--   • 3 events  — a past/closed event, today's open event, an upcoming one
--   • 11 attendees — visitors + volunteers (is_volunteer)
--   • 14 work orders — every status (pending / pending_assignment / completed)
--     and every outcome (Fixed, Diagnosed, Not Fixed, Taken Home,
--     Languished, Abandoned), across categories from src/lib/constants.js
--   • 8 waiver acceptances — one per visitor, with real SHA-256 content_hash
--     matching computeWaiverHash() ("WAIVER_VERSION|" + full waiver text)
--
-- Requires the pgcrypto extension (installed by default on Supabase in the
-- `extensions` schema) for the waiver hash.
-- ============================================

begin;

truncate work_orders, waiver_acceptances, attendees, events cascade;

-- ── Events ──
insert into events (id, name, date, location, is_open, max_items, created_at) values
  ('11111111-1111-1111-1111-111111111111', 'Milpitas Library',            '2026-03-15', 'Milpitas, CA',      false, 2, '2026-02-20 12:00-07'),
  ('22222222-2222-2222-2222-222222222222', 'Sunnyvale Community Center',   '2026-05-25', 'Sunnyvale, CA',     true,  3, '2026-05-01 12:00-07'),
  ('33333333-3333-3333-3333-333333333333', 'Mountain View Senior Center', '2026-06-20', 'Mountain View, CA', true,  2, '2026-05-15 12:00-07');

-- ── Attendees ──
insert into attendees (id, event_id, first_name, last_name, email, phone, zip_code, is_volunteer, created_at) values
  -- Event 1 (past)
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Maria',  'Garcia',   'maria.g@email.com',     '408-555-0101', '95035', false, '2026-03-15 09:10-07'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'James',  'Chen',     'jchen88@email.com',     '408-555-0102', '95035', false, '2026-03-15 09:25-07'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Priya',  'Patel',    'priya.patel@email.com', '408-555-0103', '95132', false, '2026-03-15 09:40-07'),
  ('aaaaaaaa-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Sam',    'Rivera',   'sam.rivera@email.com',  '408-555-0104', '95035', true,  '2026-03-15 08:30-07'),
  -- Event 2 (today)
  ('aaaaaaaa-0000-0000-0000-000000000005', '22222222-2222-2222-2222-222222222222', 'David',  'Kim',      'dkim@email.com',        '650-555-0105', '94086', false, '2026-05-25 09:30-07'),
  ('aaaaaaaa-0000-0000-0000-000000000006', '22222222-2222-2222-2222-222222222222', 'Aisha',  'Mohammed', 'aisha.m@email.com',     '650-555-0106', '94087', false, '2026-05-25 09:45-07'),
  ('aaaaaaaa-0000-0000-0000-000000000007', '22222222-2222-2222-2222-222222222222', 'Robert', 'Johnson',  'rjohnson@email.com',    '650-555-0107', '94086', false, '2026-05-25 10:05-07'),
  ('aaaaaaaa-0000-0000-0000-000000000008', '22222222-2222-2222-2222-222222222222', 'Linda',  'Nguyen',   'linda.n@email.com',     '650-555-0108', '94089', true,  '2026-05-25 08:45-07'),
  ('aaaaaaaa-0000-0000-0000-000000000009', '22222222-2222-2222-2222-222222222222', 'Tom',    'Becker',   'tom.becker@email.com',  '650-555-0109', '94086', true,  '2026-05-25 08:50-07'),
  -- Event 3 (upcoming)
  ('aaaaaaaa-0000-0000-0000-000000000010', '33333333-3333-3333-3333-333333333333', 'Emily',  'Davis',    'emily.davis@email.com', '650-555-0110', '94040', false, '2026-05-22 14:00-07'),
  ('aaaaaaaa-0000-0000-0000-000000000011', '33333333-3333-3333-3333-333333333333', 'Carlos', 'Mendez',   'carlos.m@email.com',    '650-555-0111', '94041', false, '2026-05-23 16:20-07');

-- ── Work orders ──
insert into work_orders (code, attendee_id, event_id, item_name, category, description, priority, status, outcome, fixer_name, created_at, printed_at, completed_at) values
  -- Event 1: all completed, covers all 6 outcomes
  ('R-M4K', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'KitchenAid stand mixer',   'Basic Appliances / Lamp', 'Motor makes a grinding noise and won''t turn on consistently.',  1, 'completed', 'Fixed',      'Sam Rivera',   '2026-03-15 10:05-07', '2026-03-15 10:08-07', '2026-03-15 11:20-07'),
  ('R-J8T', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Winter jacket',            'Sewing / Textiles',       'Zipper is stuck halfway and the pull tab broke off.',            2, 'completed', 'Not Fixed',  'Sam Rivera',   '2026-03-15 10:06-07', '2026-03-15 10:09-07', '2026-03-15 11:55-07'),
  ('R-B2P', 'aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Bluetooth speaker',        'Electronics',             'Charges but no sound comes out; already tried a factory reset.', 1, 'completed', 'Diagnosed',  'Sam Rivera',   '2026-03-15 10:30-07', '2026-03-15 10:33-07', '2026-03-15 12:10-07'),
  ('R-R5L', 'aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Vintage transistor radio', 'Electronics',             'Crackles and cuts out; suspect a bad capacitor.',               2, 'completed', 'Languished', '',             '2026-03-15 10:31-07', '2026-03-15 10:34-07', '2026-03-15 13:30-07'),
  ('R-L9C', 'aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Brass table lamp',         'Basic Appliances / Lamp', 'Flickers when switched on; cord looks frayed near the base.',    1, 'completed', 'Taken Home', 'Lee Park',     '2026-03-15 10:50-07', '2026-03-15 10:52-07', '2026-03-15 12:05-07'),
  ('R-W3X', 'aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Pocket watch',             'Jewelry',                 'Winds up but the second hand does not move.',                   2, 'completed', 'Abandoned',  '',             '2026-03-15 10:51-07', '2026-03-15 10:53-07', '2026-03-15 13:45-07'),

  -- Event 2: today, live mix of statuses
  ('R-K7M', 'aaaaaaaa-0000-0000-0000-000000000005', '22222222-2222-2222-2222-222222222222', 'Laptop',         'Computer / Phone',        'Fan runs constantly and it overheats within minutes of booting.', 1, 'pending',            null, '', '2026-05-25 09:32-07', null,                  null),
  ('R-C4F', 'aaaaaaaa-0000-0000-0000-000000000005', '22222222-2222-2222-2222-222222222222', 'Office chair',   'Furniture / Wood',        'Gas lift no longer holds; seat sinks down when sat on.',          2, 'pending',            null, '', '2026-05-25 09:33-07', null,                  null),
  ('R-S6N', 'aaaaaaaa-0000-0000-0000-000000000006', '22222222-2222-2222-2222-222222222222', 'Sewing machine', 'Sewing / Textiles',       'Needle thread keeps bunching up underneath the fabric.',          1, 'pending_assignment', null, '', '2026-05-25 09:47-07', '2026-05-25 09:50-07', null),
  ('R-T2A', 'aaaaaaaa-0000-0000-0000-000000000006', '22222222-2222-2222-2222-222222222222', 'Toaster',        'Basic Appliances / Lamp', 'Lever will not stay down; nothing heats up.',                     2, 'completed', 'Fixed', 'Linda Nguyen',  '2026-05-25 09:48-07', '2026-05-25 09:51-07', '2026-05-25 10:40-07'),
  ('R-Q9R', 'aaaaaaaa-0000-0000-0000-000000000006', '22222222-2222-2222-2222-222222222222', 'Silver necklace','Jewelry',                 'Clasp spring is broken; will not stay closed.',                   3, 'pending',            null, '', '2026-05-25 09:49-07', null,                  null),
  ('R-D5B', 'aaaaaaaa-0000-0000-0000-000000000007', '22222222-2222-2222-2222-222222222222', 'Mountain bike',  'Bikes',                   'Rear derailleur skips gears; chain slips under load.',            1, 'pending_assignment', null, '', '2026-05-25 10:07-07', '2026-05-25 10:10-07', null),

  -- Event 3: upcoming, pre-registered (pending, not yet printed)
  ('R-F3W', 'aaaaaaaa-0000-0000-0000-000000000010', '33333333-3333-3333-3333-333333333333', 'Wooden dining chair', 'Furniture / Wood', 'Joint at the back leg is loose and wobbles.', 1, 'pending', null, '', '2026-05-22 14:02-07', null, null),
  ('R-H8K', 'aaaaaaaa-0000-0000-0000-000000000011', '33333333-3333-3333-3333-333333333333', 'Tube radio',          'Electronics',      'Hums loudly and the dial light is out.',      1, 'pending', null, '', '2026-05-23 16:22-07', null, null);

-- ── Waiver acceptances (one per visitor; volunteers excluded) ──
-- content_hash mirrors src/lib/constants.js computeWaiverHash():
--   sha256( WAIVER_VERSION || '|' || getWaiverFullText() )
-- Keep waiver text + version in sync with constants.js if either changes.
with waiver as (
  select '1.0'::text as version,
    E'No Guarantee of Repair: I understand that I will be assisted by volunteers, and there is no guarantee that my item will be successfully repaired or function properly after the repair attempt.\n\nAssumption of Risk: I acknowledge that any repair attempt carries the risk of further damage to my item and that the organizers and volunteers are not responsible for any resulting damage or loss of function.\n\nRelease of Liability: I release and hold harmless Repair Café Silicon Valley, its volunteers, and any affiliated entities from any and all claims, liabilities, damages, or losses related to the repair attempt, including but not limited to accidental damage or failure of the item.\n\nPersonal Safety: I acknowledge that I am responsible for my own safety and agree to follow all safety guidelines provided by the organizers during the repair process.\n\nNo Warranty: I understand that any repairs made during the event are performed as a goodwill service and do not come with any warranty or guarantee.\n\nItem Ownership & Responsibility: I affirm that I am the rightful owner of the item being repaired and take full responsibility for it during and after the repair attempt.\n\nUnrepairable Items: I understand that if my item cannot be repaired, I am responsible for taking it with me and properly disposing of or recycling it myself.\n\nPhoto Release: I grant permission to photograph or record me during the event and to use my image, likeness, or voice for promotional, educational, or informational purposes.'::text as txt
)
insert into waiver_acceptances (attendee_id, waiver_version, waiver_text, content_hash, accepted_at)
select v.id, w.version, w.txt,
       encode(extensions.digest(w.version || '|' || w.txt, 'sha256'), 'hex'),
       v.accepted_at
from (values
  ('aaaaaaaa-0000-0000-0000-000000000001'::uuid, timestamptz '2026-03-15 09:10-07'),
  ('aaaaaaaa-0000-0000-0000-000000000002'::uuid, timestamptz '2026-03-15 09:25-07'),
  ('aaaaaaaa-0000-0000-0000-000000000003'::uuid, timestamptz '2026-03-15 09:40-07'),
  ('aaaaaaaa-0000-0000-0000-000000000005'::uuid, timestamptz '2026-05-25 09:30-07'),
  ('aaaaaaaa-0000-0000-0000-000000000006'::uuid, timestamptz '2026-05-25 09:45-07'),
  ('aaaaaaaa-0000-0000-0000-000000000007'::uuid, timestamptz '2026-05-25 10:05-07'),
  ('aaaaaaaa-0000-0000-0000-000000000010'::uuid, timestamptz '2026-05-22 14:00-07'),
  ('aaaaaaaa-0000-0000-0000-000000000011'::uuid, timestamptz '2026-05-23 16:20-07')
) v(id, accepted_at)
cross join waiver w;

commit;

-- ── Verify ──
select
  e.name as event,
  to_char(e.date, 'YYYY-MM-DD') as date,
  e.is_open,
  a.first_name || ' ' || a.last_name as person,
  case when a.is_volunteer then 'volunteer' else 'visitor' end as role,
  wo.code,
  wo.item_name,
  wo.category,
  wo.priority,
  wo.status,
  wo.outcome,
  wo.fixer_name
from events e
join attendees a on a.event_id = e.id
left join work_orders wo on wo.attendee_id = a.id
order by e.date, a.last_name, wo.priority;
