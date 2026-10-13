-- The VOLUNTEER access level (the shared account, volunteer@repaircafe.app),
-- and a signed-in session that is neither the volunteer nor an admin.
-- Since supabase-admin-auth-migration.sql, "signed in" alone grants nothing:
-- PII needs can_access_queue(). Since supabase-admin-auth-lockdown.sql,
-- events are read-only for the volunteer (admins only).
--
-- Runs in a transaction that is rolled back.
begin;
create extension if not exists pgtap with schema extensions;

select plan(23);

-- ── Fixtures (as postgres, bypassing RLS) ──
insert into events (id, name, date, is_open)
values ('b0000000-0000-0000-0000-000000000001', 'Test Event', '2030-01-01', true);
insert into attendees (id, event_id, first_name, last_name, email)
values ('b0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001',
        'Testy', 'Visitor', 'testy@example.com');
insert into work_orders (id, code, attendee_id, event_id, item_name, description, priority)
values ('b0000000-0000-0000-0000-000000000003', 'T8T-1', 'b0000000-0000-0000-0000-000000000002',
        'b0000000-0000-0000-0000-000000000001', 'Lamp', 'Flickers', 1);
insert into waiver_acceptances (attendee_id, waiver_version, waiver_text, content_hash)
values ('b0000000-0000-0000-0000-000000000002', 'test', 'text', 'hash');
insert into admin_allowlist (email) values ('pending-invite@example.com');

-- ════ Volunteer ════
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"b0000000-0000-0000-0000-0000000000aa","email":"volunteer@repaircafe.app"}',
  true);

select ok(public.is_volunteer(), 'volunteer: is_volunteer() is true');
select ok(not public.is_admin(), 'volunteer: is_admin() is false');

-- PII tables: readable and updatable.
select isnt_empty(
  $$ select 1 from attendees where id = 'b0000000-0000-0000-0000-000000000002' $$,
  'volunteer can read attendees');
select isnt_empty(
  $$ select 1 from work_orders where id = 'b0000000-0000-0000-0000-000000000003' $$,
  'volunteer can read work_orders');
select isnt_empty(
  $$ select 1 from waiver_acceptances where attendee_id = 'b0000000-0000-0000-0000-000000000002' $$,
  'volunteer can read waiver_acceptances');
with u as (update attendees set first_name = 'Edited'
           where id = 'b0000000-0000-0000-0000-000000000002' returning 1)
select is(count(*)::int, 1, 'volunteer can update attendees') from u;
with u as (update work_orders set category = 'Electronics'
           where id = 'b0000000-0000-0000-0000-000000000003' returning 1)
select is(count(*)::int, 1, 'volunteer can update work_orders') from u;

-- PII tables: no direct inserts, no deletes, waivers immutable.
select throws_ok(
  $$ insert into attendees (event_id, first_name, last_name)
     values ('b0000000-0000-0000-0000-000000000001', 'Direct', 'Insert') $$,
  '42501', null, 'volunteer cannot insert attendees directly');
with d as (delete from attendees
           where id = 'b0000000-0000-0000-0000-000000000002' returning 1)
select is(count(*)::int, 0, 'volunteer cannot delete attendees') from d;
with u as (update waiver_acceptances set waiver_text = 'tampered'
           where attendee_id = 'b0000000-0000-0000-0000-000000000002' returning 1)
select is(count(*)::int, 0, 'volunteer cannot alter waiver_acceptances') from u;

-- Events: readable, but no create, update or delete (admins only).
select isnt_empty(
  $$ select 1 from events where id = 'b0000000-0000-0000-0000-000000000001' $$,
  'volunteer can read events');
select throws_ok(
  $$ insert into events (id, name, date)
     values ('b0000000-0000-0000-0000-000000000004', 'Created Event', '2030-03-03') $$,
  '42501', null, 'volunteer cannot create events');
with u as (update events set is_open = false
           where id = 'b0000000-0000-0000-0000-000000000001' returning 1)
select is(count(*)::int, 0, 'volunteer cannot update events') from u;
with d as (delete from events
           where id = 'b0000000-0000-0000-0000-000000000001' returning 1)
select is(count(*)::int, 0, 'volunteer cannot delete events') from d;

-- Admin tables: invisible and not writable.
select is_empty($$ select 1 from admin_allowlist $$, 'volunteer cannot read the allowlist');
select is_empty($$ select 1 from app_users $$,       'volunteer cannot read app_users');
select throws_ok(
  $$ insert into admin_allowlist (email) values ('sneaky@example.com') $$,
  '42501', null, 'volunteer cannot add to the allowlist');

-- ════ Signed in, but neither volunteer nor admin ════
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"b0000000-0000-0000-0000-0000000000bb","email":"stray@example.com"}',
  true);

select is_empty($$ select 1 from attendees $$,          'stray user cannot read attendees');
select is_empty($$ select 1 from work_orders $$,        'stray user cannot read work_orders');
select is_empty($$ select 1 from waiver_acceptances $$, 'stray user cannot read waiver_acceptances');
select throws_ok(
  $$ insert into events (name, date) values ('Stray Event', '2030-04-04') $$,
  '42501', null, 'stray user cannot create events');

-- ── Back as postgres: the volunteer's edits landed, the stray user's didn't ──
reset role;
select is(
  (select first_name from attendees where id = 'b0000000-0000-0000-0000-000000000002'),
  'Edited', 'volunteer update to attendees was saved');
select is(
  (select count(*)::int from admin_allowlist where email = 'pending-invite@example.com'),
  1, 'the allowlist row is untouched');

select * from finish();
rollback;
