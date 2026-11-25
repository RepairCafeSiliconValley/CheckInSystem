-- Print counting and CloudPRNT printing (supabase-cloudprnt-migration.sql):
-- normalize_mac(), the per-event print defaults, record_ticket_prints(),
-- queue_cloudprnt_jobs(), and RLS on event_printers, cloudprnt_printers and
-- print_jobs.
--
-- The central promise: printed_at records the FIRST print and never moves,
-- while print_count goes up on every print.
--
-- Runs in a transaction that is rolled back.
begin;
create extension if not exists pgtap with schema extensions;

select plan(31);

-- ── Fixtures (as postgres, bypassing RLS) ──
-- Pat is an admin (allowlisted, then created, which fires the trigger that
-- makes the app_users row).
insert into admin_allowlist (email) values ('pat@example.com');
insert into auth.users (id, email, raw_user_meta_data) values
  ('f0000000-0000-0000-0000-00000000000a', 'pat@example.com', '{"full_name":"Pat Admin"}');

insert into events (id, name, date, is_open) values
  ('f0000000-0000-0000-0000-000000000e01', 'Print Event A', '2030-01-01', true),
  ('f0000000-0000-0000-0000-000000000e02', 'Print Event B', '2030-01-01', true);
insert into attendees (id, event_id, first_name, last_name) values
  ('f0000000-0000-0000-0000-000000000a01', 'f0000000-0000-0000-0000-000000000e01', 'Ada', 'Visitor'),
  ('f0000000-0000-0000-0000-000000000a02', 'f0000000-0000-0000-0000-000000000e02', 'Bo', 'Visitor');
-- Each id has different first three groups: the ticket-code prefix is unique.
insert into work_orders (id, code, attendee_id, event_id, item_name, description, priority, status, printed_at, print_count) values
  ('f1000000-0000-0000-0000-000000000001', 'P1P-1', 'f0000000-0000-0000-0000-000000000a01', 'f0000000-0000-0000-0000-000000000e01',
   'Lamp', 'Flickers', 1, 'pending', null, 0),
  ('f2000000-0000-0000-0000-000000000001', 'P1P-2', 'f0000000-0000-0000-0000-000000000a01', 'f0000000-0000-0000-0000-000000000e01',
   'Radio', 'No sound', 2, 'pending_assignment', '2030-01-01 10:00+00', 1),
  ('f3000000-0000-0000-0000-000000000001', 'P1P-3', 'f0000000-0000-0000-0000-000000000a01', 'f0000000-0000-0000-0000-000000000e01',
   'Kettle', 'Leaks', 3, 'completed', '2030-01-01 10:00+00', 1),
  ('f4000000-0000-0000-0000-000000000001', 'P2P-1', 'f0000000-0000-0000-0000-000000000a02', 'f0000000-0000-0000-0000-000000000e02',
   'Fan', 'Rattles', 1, 'pending', null, 0);


-- ════ normalize_mac() ════
select is(public.normalize_mac('00-11-62-AA-BB-CC'), '00:11:62:aa:bb:cc', 'normalize_mac accepts dashes and upper case');
select is(public.normalize_mac('0011.62aa.bbcc'), '00:11:62:aa:bb:cc', 'normalize_mac accepts any separators');
select is(public.normalize_mac('not a mac'), null, 'normalize_mac gives null for anything else');


-- ════ Defaults for new events ════
insert into events (id, name, date) values ('f0000000-0000-0000-0000-000000000e03', 'Print Event C', '2030-01-01');
select is((select use_legacy_print from events where id = 'f0000000-0000-0000-0000-000000000e03'),
  false, 'a new event prints with CloudPRNT by default');
select is((select print_preview from events where id = 'f0000000-0000-0000-0000-000000000e03'),
  false, 'a new event prints without a preview by default');


-- ════ Anon can't print ════
set local role anon;
select throws_ok(
  $$ select * from public.record_ticket_prints(array['f1000000-0000-0000-0000-000000000001'::uuid]) $$,
  '42501', null, 'anon cannot execute record_ticket_prints');
select throws_ok(
  $$ select * from public.queue_cloudprnt_jobs('[{"work_order_id":"f1000000-0000-0000-0000-000000000001"}]') $$,
  '42501', null, 'anon cannot execute queue_cloudprnt_jobs');
select throws_ok(
  $$ select count(*) from print_jobs $$,
  '42501', null, 'anon cannot read print_jobs');
reset role;


-- ════ record_ticket_prints() as the volunteer ════
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"f0000000-0000-0000-0000-0000000000bb","email":"volunteer@repaircafe.app"}',
  true);

-- The completed item is skipped; the other two are counted.
select results_eq(
  $$ select * from public.record_ticket_prints(array[
       'f1000000-0000-0000-0000-000000000001'::uuid,
       'f2000000-0000-0000-0000-000000000001'::uuid,
       'f3000000-0000-0000-0000-000000000001'::uuid]) order by 1 $$,
  $$ values ('f1000000-0000-0000-0000-000000000001'::uuid, 1),
            ('f2000000-0000-0000-0000-000000000001'::uuid, 2) $$,
  'record_ticket_prints counts each printable item and returns the new counts');
reset role;

select results_eq(
  $$ select status, printed_at is not null from work_orders where id = 'f1000000-0000-0000-0000-000000000001' $$,
  $$ values ('pending_assignment'::text, true) $$,
  'a first print moves the item to Checked-In and stamps printed_at');
select is((select printed_at from work_orders where id = 'f2000000-0000-0000-0000-000000000001'),
  '2030-01-01 10:00+00'::timestamptz, 'a reprint leaves printed_at at the first print');
select is((select print_count from work_orders where id = 'f3000000-0000-0000-0000-000000000001'),
  1, 'an item off the board is not counted');

-- A second print of the first item: count goes up, printed_at stays.
update work_orders set printed_at = '2030-01-01 11:00+00' where id = 'f1000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"f0000000-0000-0000-0000-0000000000bb","email":"volunteer@repaircafe.app"}',
  true);
select lives_ok(
  $$ select * from public.record_ticket_prints(array['f1000000-0000-0000-0000-000000000001'::uuid]) $$,
  'the volunteer can print the same ticket again');
reset role;
select is((select print_count from work_orders where id = 'f1000000-0000-0000-0000-000000000001'),
  2, 'every print adds one to print_count');
select is((select printed_at from work_orders where id = 'f1000000-0000-0000-0000-000000000001'),
  '2030-01-01 11:00+00'::timestamptz, 'printed_at does not move on later prints');


-- ════ queue_cloudprnt_jobs() ════
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"f0000000-0000-0000-0000-0000000000bb","email":"volunteer@repaircafe.app"}',
  true);
select throws_ok(
  $$ select * from public.queue_cloudprnt_jobs('[{"work_order_id":"f1000000-0000-0000-0000-000000000001"}]') $$,
  'P0001', 'No printer is set up for this event',
  'queueing fails when the event has no printer');
reset role;

-- A printer is set, but it last checked in two minutes ago.
insert into event_printers (event_id, printer_mac) values ('f0000000-0000-0000-0000-000000000e01', '00:11:62:aa:bb:cc');
insert into cloudprnt_printers (printer_mac, last_poll_at) values ('00:11:62:aa:bb:cc', now() - interval '2 minutes');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"f0000000-0000-0000-0000-0000000000bb","email":"volunteer@repaircafe.app"}',
  true);
select throws_ok(
  $$ select * from public.queue_cloudprnt_jobs('[{"work_order_id":"f1000000-0000-0000-0000-000000000001"}]') $$,
  'P0001', 'No printer detected. Check that the printer is on and connected to the network.',
  'queueing fails when the printer has not checked in recently');
reset role;

update cloudprnt_printers set last_poll_at = now() where printer_mac = '00:11:62:aa:bb:cc';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"f0000000-0000-0000-0000-0000000000bb","email":"volunteer@repaircafe.app"}',
  true);
select throws_ok(
  $$ select * from public.queue_cloudprnt_jobs('[{"work_order_id":"f1000000-0000-0000-0000-000000000001"},
                                                {"work_order_id":"f4000000-0000-0000-0000-000000000001"}]') $$,
  'P0001', 'Tickets must all belong to one event',
  'one call prints for one event only');
select throws_ok(
  $$ select * from public.queue_cloudprnt_jobs('[{"work_order_id":"f3000000-0000-0000-0000-000000000001"}]') $$,
  'P0001', 'None of these items can be printed',
  'an item off the board cannot be queued');

-- Sent Radio first, then Lamp: the jobs keep that order.
select results_eq(
  $$ select * from public.queue_cloudprnt_jobs(
       '[{"work_order_id":"f2000000-0000-0000-0000-000000000001","item_name":"Radio"},
         {"work_order_id":"f1000000-0000-0000-0000-000000000001","item_name":"Lamp"}]') order by 1 $$,
  $$ values ('f1000000-0000-0000-0000-000000000001'::uuid, 3),
            ('f2000000-0000-0000-0000-000000000001'::uuid, 3) $$,
  'queueing counts the print and returns the new counts');

-- The desk can see what it sent, but can't write jobs or see printer settings.
select results_eq(
  $$ select work_order_id, print_count, ticket ->> 'item_name', printer_mac, state from print_jobs order by seq $$,
  $$ values ('f2000000-0000-0000-0000-000000000001'::uuid, 3, 'Radio'::text, '00:11:62:aa:bb:cc'::text, 'queued'::text),
            ('f1000000-0000-0000-0000-000000000001'::uuid, 3, 'Lamp'::text, '00:11:62:aa:bb:cc'::text, 'queued'::text) $$,
  'one queued job per ticket, in the order sent, carrying the snapshot and count');
select throws_ok(
  $$ insert into print_jobs (printer_mac, event_id, work_order_id, print_count, ticket)
     values ('00:11:62:aa:bb:cc', 'f0000000-0000-0000-0000-000000000e01', 'f1000000-0000-0000-0000-000000000001', 1, '{}') $$,
  '42501', null, 'the volunteer cannot insert print jobs directly');
select is((select count(*)::int from event_printers), 0, 'the volunteer cannot read event printers');
select throws_ok(
  $$ insert into event_printers (event_id, printer_mac) values ('f0000000-0000-0000-0000-000000000e02', '00:11:62:aa:bb:dd') $$,
  '42501', null, 'the volunteer cannot set an event printer');
select is((select count(*)::int from cloudprnt_printers), 0, 'the volunteer cannot read printer check-ins');
reset role;


-- ════ Admin ════
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"f0000000-0000-0000-0000-00000000000a","email":"pat@example.com"}',
  true);
select is((select count(*)::int from event_printers), 1, 'an admin can read event printers');
select lives_ok(
  $$ insert into event_printers (event_id, printer_mac) values ('f0000000-0000-0000-0000-000000000e02', '00:11:62:aa:bb:dd') $$,
  'an admin can set an event printer');
select throws_ok(
  $$ insert into event_printers (event_id, printer_mac) values ('f0000000-0000-0000-0000-000000000e03', '00-11-62-AA-BB-EE') $$,
  '23514', null, 'an event printer must be stored in canonical form');
select is((select count(*)::int from cloudprnt_printers), 1, 'an admin can read printer check-ins');
select throws_ok(
  $$ update cloudprnt_printers set last_poll_at = now() $$,
  '42501', null, 'an admin cannot fake a printer check-in');
reset role;

select function_privs_are('public', 'queue_cloudprnt_jobs', array['jsonb'],
  'anon', array[]::text[], 'anon has no EXECUTE on queue_cloudprnt_jobs');

select * from finish();
rollback;
