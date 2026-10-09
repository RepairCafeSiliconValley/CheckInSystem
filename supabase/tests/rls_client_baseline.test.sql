-- Baseline: what the CLIENT access level (no login, the `anon` role) can do
-- today. Pins current behavior so the admin-auth RLS rewrite
-- (docs/admin-auth-plan.md) can't change it by accident.
--
-- Runs in a transaction that is rolled back; fixtures use fixed UUIDs that
-- don't collide with supabase-seed.sql.
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

-- ── Fixtures (as postgres, bypassing RLS) ──
insert into events (id, name, date, is_open)
values ('a0000000-0000-0000-0000-000000000001', 'Test Event', '2030-01-01', true);
insert into attendees (id, event_id, first_name, last_name, email, phone, zip_code)
values ('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
        'Testy', 'Visitor', 'testy@example.com', '5555550100', '95000');
insert into work_orders (id, code, attendee_id, event_id, item_name, description, priority)
values ('a0000000-0000-0000-0000-000000000003', 'T9T-1', 'a0000000-0000-0000-0000-000000000002',
        'a0000000-0000-0000-0000-000000000001', 'Lamp', 'Flickers', 1);
insert into waiver_acceptances (attendee_id, waiver_version, waiver_text, content_hash)
values ('a0000000-0000-0000-0000-000000000002', 'test', 'text', 'hash');

-- ── Act as a client ──
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

-- PII tables: nothing readable.
select is_empty($$ select 1 from attendees $$,          'client cannot read attendees');
select is_empty($$ select 1 from work_orders $$,        'client cannot read work_orders');
select is_empty($$ select 1 from waiver_acceptances $$, 'client cannot read waiver_acceptances');

-- PII tables: updates and deletes match no rows.
with u as (update attendees set first_name = 'X'
           where id = 'a0000000-0000-0000-0000-000000000002' returning 1)
select is(count(*)::int, 0, 'client cannot update attendees') from u;
with u as (update work_orders set status = 'canceled'
           where id = 'a0000000-0000-0000-0000-000000000003' returning 1)
select is(count(*)::int, 0, 'client cannot update work_orders') from u;
with d as (delete from attendees
           where id = 'a0000000-0000-0000-0000-000000000002' returning 1)
select is(count(*)::int, 0, 'client cannot delete attendees') from d;
with d as (delete from work_orders
           where id = 'a0000000-0000-0000-0000-000000000003' returning 1)
select is(count(*)::int, 0, 'client cannot delete work_orders') from d;
with d as (delete from waiver_acceptances
           where attendee_id = 'a0000000-0000-0000-0000-000000000002' returning 1)
select is(count(*)::int, 0, 'client cannot delete waiver_acceptances') from d;

-- PII tables: direct inserts are refused (check-in goes through the RPC).
select throws_ok(
  $$ insert into attendees (event_id, first_name, last_name)
     values ('a0000000-0000-0000-0000-000000000001', 'Direct', 'Insert') $$,
  '42501', null, 'client cannot insert attendees directly');
select throws_ok(
  $$ insert into work_orders (code, attendee_id, event_id, item_name, description)
     values ('T9T-2', 'a0000000-0000-0000-0000-000000000002',
             'a0000000-0000-0000-0000-000000000001', 'Toaster', 'Dead') $$,
  '42501', null, 'client cannot insert work_orders directly');

-- Known gap, not fixed here: supabase-migration.sql's "Allow insert" policy
-- (with check true) still lets a client insert waiver rows directly for any
-- attendee id. Marked TODO so the suite passes and the gap stays visible.
select todo('waiver_acceptances still has an open "Allow insert" policy', 1);
select throws_ok(
  $$ insert into waiver_acceptances (attendee_id, waiver_version, waiver_text, content_hash)
     values ('a0000000-0000-0000-0000-000000000002', 'forged', 'text', 'hash') $$,
  '42501', null, 'client cannot insert waiver_acceptances directly');

-- Events: readable (the public check-in page needs them), not writable.
select isnt_empty(
  $$ select 1 from events where id = 'a0000000-0000-0000-0000-000000000001' $$,
  'client can read events');
select throws_ok(
  $$ insert into events (name, date) values ('Client Event', '2030-02-02') $$,
  '42501', null, 'client cannot create events');
with u as (update events set is_open = false
           where id = 'a0000000-0000-0000-0000-000000000001' returning 1)
select is(count(*)::int, 0, 'client cannot update events') from u;
with d as (delete from events
           where id = 'a0000000-0000-0000-0000-000000000001' returning 1)
select is(count(*)::int, 0, 'client cannot delete events') from d;

-- ── Back as postgres: confirm nothing above changed the fixtures ──
reset role;
select results_eq(
  $$ select first_name, (select status from work_orders
                         where id = 'a0000000-0000-0000-0000-000000000003')
     from attendees where id = 'a0000000-0000-0000-0000-000000000002' $$,
  $$ values ('Testy'::text, 'pending'::text) $$,
  'client attempts left the fixture rows unchanged');
select is(
  (select is_open from events where id = 'a0000000-0000-0000-0000-000000000001'),
  true, 'client attempts left the event unchanged');

select * from finish();
rollback;
