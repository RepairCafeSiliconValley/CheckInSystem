-- Baseline: what a SIGNED-IN user can do today. Every non-public policy is
-- `auth.role() = 'authenticated'`, so any session counts, whatever its email.
-- The admin-auth plan (docs/admin-auth-plan.md, PR 2) deliberately narrows
-- this to the volunteer account and admins; update these expectations then.
--
-- Runs in a transaction that is rolled back.
begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

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

-- ── Act as a signed-in user (any email; today's policies don't check it) ──
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"b0000000-0000-0000-0000-0000000000ff","email":"someone@example.com"}',
  true);

-- PII tables: readable.
select isnt_empty(
  $$ select 1 from attendees where id = 'b0000000-0000-0000-0000-000000000002' $$,
  'signed-in user can read attendees');
select isnt_empty(
  $$ select 1 from work_orders where id = 'b0000000-0000-0000-0000-000000000003' $$,
  'signed-in user can read work_orders');
select isnt_empty(
  $$ select 1 from waiver_acceptances where attendee_id = 'b0000000-0000-0000-0000-000000000002' $$,
  'signed-in user can read waiver_acceptances');

-- PII tables: updatable (queue edits are direct table updates).
with u as (update attendees set first_name = 'Edited'
           where id = 'b0000000-0000-0000-0000-000000000002' returning 1)
select is(count(*)::int, 1, 'signed-in user can update attendees') from u;
with u as (update work_orders set category = 'Electronics'
           where id = 'b0000000-0000-0000-0000-000000000003' returning 1)
select is(count(*)::int, 1, 'signed-in user can update work_orders') from u;

-- PII tables: no direct inserts, no deletes, waivers immutable.
select throws_ok(
  $$ insert into attendees (event_id, first_name, last_name)
     values ('b0000000-0000-0000-0000-000000000001', 'Direct', 'Insert') $$,
  '42501', null, 'signed-in user cannot insert attendees directly');
with d as (delete from attendees
           where id = 'b0000000-0000-0000-0000-000000000002' returning 1)
select is(count(*)::int, 0, 'signed-in user cannot delete attendees') from d;
with d as (delete from work_orders
           where id = 'b0000000-0000-0000-0000-000000000003' returning 1)
select is(count(*)::int, 0, 'signed-in user cannot delete work_orders') from d;
with u as (update waiver_acceptances set waiver_text = 'tampered'
           where attendee_id = 'b0000000-0000-0000-0000-000000000002' returning 1)
select is(count(*)::int, 0, 'signed-in user cannot alter waiver_acceptances') from u;

-- Events: create and update allowed, delete not.
select lives_ok(
  $$ insert into events (id, name, date)
     values ('b0000000-0000-0000-0000-000000000004', 'Created Event', '2030-03-03') $$,
  'signed-in user can create events');
with u as (update events set is_open = false
           where id = 'b0000000-0000-0000-0000-000000000001' returning 1)
select is(count(*)::int, 1, 'signed-in user can update events') from u;
with d as (delete from events
           where id = 'b0000000-0000-0000-0000-000000000004' returning 1)
select is(count(*)::int, 0, 'signed-in user cannot delete events') from d;

-- ── Back as postgres: the edits really landed ──
reset role;
select is(
  (select first_name from attendees where id = 'b0000000-0000-0000-0000-000000000002'),
  'Edited', 'signed-in update to attendees was saved');

select * from finish();
rollback;
