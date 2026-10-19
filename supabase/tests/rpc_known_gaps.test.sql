-- Known gaps in the public RPCs, pinned as the rule they SHOULD follow.
--
-- Each check is wrapped in todo_start()/todo_end(): it fails today, and
-- pg_prove reports that as an expected failure ("TODO"), so the suite still
-- passes. When an RPC is fixed, the check starts passing and pg_prove reports
-- it as "unexpectedly succeeded": remove its todo wrapper then, so the rule
-- stays enforced.
--
-- Runs in a transaction that is rolled back.
begin;
create extension if not exists pgtap with schema extensions;

select plan(6);

-- ── Fixtures (as postgres) ──
insert into events (id, name, date, is_open, max_items) values
  ('e0000000-0000-0000-0000-000000000001', 'Closed Event', '2030-01-01', false, 2),
  ('e0000000-0000-0000-0000-000000000002', 'Open Event',   '2030-01-02', true,  1);
insert into attendees (id, event_id, first_name, last_name)
values ('e0000000-0000-0000-0000-0000000000a1', 'e0000000-0000-0000-0000-000000000002', 'Gap', 'Tester');
insert into work_orders (id, code, attendee_id, event_id, item_name, description, priority, status, cancel_reason) values
  ('e0000000-0000-0000-0000-0000000000c1', 'G2G-1', 'e0000000-0000-0000-0000-0000000000a1',
   'e0000000-0000-0000-0000-000000000002', 'Lamp', 'Flickers', 1, 'canceled', 'Mistake'),
  ('e0000000-0000-0000-0000-0000000000c2', 'G2G-2', 'e0000000-0000-0000-0000-0000000000a1',
   'e0000000-0000-0000-0000-000000000002', 'Kettle', 'Leaks', 2, 'pending', null);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

-- ── checkin_visitor ──
select todo_start('checkin_visitor does not check is_open yet');
select throws_ok(
  $$ select checkin_visitor(
       p_event_id => 'e0000000-0000-0000-0000-000000000001',
       p_first_name => 'Late', p_last_name => 'Visitor', p_email => null,
       p_items => '[{"item_name":"Fan","description":"Rattles","priority":1}]',
       p_phone => null, p_zip_code => '95001', p_waiver_version => 'v', p_waiver_text => 't',
       p_waiver_hash => 'h', p_newsletter_opt_in => false) $$,
  null::char(5), null::text,
  'checkin_visitor refuses an event whose check-in is closed');
select todo_end();

select todo_start('checkin_visitor does not check max_items yet');
select throws_ok(
  $$ select checkin_visitor(
       p_event_id => 'e0000000-0000-0000-0000-000000000002',
       p_first_name => 'Greedy', p_last_name => 'Visitor', p_email => null,
       p_items => '[{"item_name":"Fan","description":"Rattles","priority":1},
                   {"item_name":"Clock","description":"Stopped","priority":2}]',
       p_phone => null, p_zip_code => '95001', p_waiver_version => 'v', p_waiver_text => 't',
       p_waiver_hash => 'h', p_newsletter_opt_in => false) $$,
  null::char(5), null::text,
  'checkin_visitor refuses more items than the event''s max_items');
select todo_end();

-- ── submit_fixer_outcome ──
select todo_start('submit_fixer_outcome only refuses completed items');
select throws_ok(
  $$ select submit_fixer_outcome('e0000000-0000-0000-0000-0000000000c1', 'Pat Fixer', 'Fixed') $$,
  null::char(5), null::text,
  'submit_fixer_outcome refuses a cancelled work order');
select todo_end();

select todo_start('submit_fixer_outcome only refuses completed items');
select throws_ok(
  $$ select submit_fixer_outcome('e0000000-0000-0000-0000-0000000000c2', 'Pat Fixer', 'Fixed') $$,
  null::char(5), null::text,
  'submit_fixer_outcome refuses a work order whose ticket was never printed');
select todo_end();

-- ── Back as postgres: whatever the RPCs did, a cancel must survive ──
reset role;

select todo_start('submit_fixer_outcome only refuses completed items');
select results_eq(
  $$ select status, outcome, cancel_reason from work_orders
     where id = 'e0000000-0000-0000-0000-0000000000c1' $$,
  $$ values ('canceled'::text, null::text, 'Mistake'::text) $$,
  'a fixer submission leaves a cancelled work order cancelled');
select todo_end();

-- Not a gap: the max_items range is enforced by a CHECK constraint.
select throws_ok(
  $$ update events set max_items = 11 where id = 'e0000000-0000-0000-0000-000000000002' $$,
  '23514', null::text,
  'events.max_items is limited to 1-10');

select * from finish();
rollback;
