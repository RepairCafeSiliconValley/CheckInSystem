-- New events start closed, and events.first_opened_at records the first time
-- an event opened — supabase-event-first-open-migration.sql. The Events tab
-- reads it to label the button "Open Check-In" (never opened) or "Reopen
-- Check-In".
--
-- Runs in a transaction that is rolled back.
begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

-- ── Fixtures (as postgres; the trigger fires whoever writes) ──
insert into events (id, name, date)
values ('f0e00000-0000-4000-8000-000000000001', 'Default Closed', '2030-03-03');
insert into events (id, name, date, is_open)
values ('f0e00000-0000-4000-8000-000000000002', 'Born Open', '2030-03-03', true);

select is((select is_open from events where id = 'f0e00000-0000-4000-8000-000000000001'),
  false, 'a new event is closed by default');
select is((select first_opened_at from events where id = 'f0e00000-0000-4000-8000-000000000001'),
  null, 'a never-opened event has no first_opened_at');
select isnt((select first_opened_at from events where id = 'f0e00000-0000-4000-8000-000000000002'),
  null, 'an event inserted open is stamped');

-- Opening stamps it.
update events set is_open = true where id = 'f0e00000-0000-4000-8000-000000000001';
select isnt((select first_opened_at from events where id = 'f0e00000-0000-4000-8000-000000000001'),
  null, 'opening an event stamps first_opened_at');

update events set first_opened_at = null where id = 'f0e00000-0000-4000-8000-000000000001';
select isnt((select first_opened_at from events where id = 'f0e00000-0000-4000-8000-000000000001'),
  null, 'first_opened_at cannot be cleared once set');

-- An explicit stamp on insert is kept (now() is fixed for the whole
-- transaction, so a known past value is what shows the stamp doesn't move).
insert into events (id, name, date, is_open, first_opened_at)
values ('f0e00000-0000-4000-8000-000000000004', 'Opened Long Ago', '2030-03-03',
        true, '2020-01-01 00:00Z');
update events set is_open = false where id = 'f0e00000-0000-4000-8000-000000000004';
select is((select first_opened_at from events where id = 'f0e00000-0000-4000-8000-000000000004'),
  '2020-01-01 00:00Z'::timestamptz, 'closing keeps first_opened_at');
update events set is_open = true, first_opened_at = now()
where id = 'f0e00000-0000-4000-8000-000000000004';
select is((select first_opened_at from events where id = 'f0e00000-0000-4000-8000-000000000004'),
  '2020-01-01 00:00Z'::timestamptz, 'reopening does not move first_opened_at');

-- Editing other settings on a never-opened event leaves it unstamped.
insert into events (id, name, date)
values ('f0e00000-0000-4000-8000-000000000003', 'Still Closed', '2030-03-03');
update events set max_items = 4 where id = 'f0e00000-0000-4000-8000-000000000003';
select is((select first_opened_at from events where id = 'f0e00000-0000-4000-8000-000000000003'),
  null, 'editing a closed, never-opened event does not stamp it');

select * from finish();
rollback;
