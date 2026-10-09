-- Baseline: the public RPCs a CLIENT (no login) relies on. Check-in and the
-- fixer page must keep working for anon through every RLS change.
--
-- Runs in a transaction that is rolled back.
begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

-- ── Fixtures (as postgres) ──
insert into events (id, name, date, is_open)
values ('c0000000-0000-0000-0000-000000000001', 'Test Event', '2030-01-01', true);
insert into attendees (id, event_id, first_name, last_name, email, phone)
values ('c0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001',
        'Fixie', 'mcfixface', 'fixie@example.com', '5555550199');
insert into work_orders (id, code, attendee_id, event_id, item_name, description, priority, status)
values ('c0000000-0000-0000-0000-000000000003', 'T7T-1', 'c0000000-0000-0000-0000-000000000002',
        'c0000000-0000-0000-0000-000000000001', 'Radio', 'No sound', 1, 'pending_assignment');

-- Results captured while acting as anon, checked afterwards as postgres.
create temporary table checkin_result (result jsonb) on commit drop;
grant insert, select on checkin_result to anon;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

-- ── checkin_visitor ──
select lives_ok(
  $$ insert into checkin_result
     select checkin_visitor(
       p_event_id          => 'c0000000-0000-0000-0000-000000000001',
       p_first_name        => 'New',
       p_last_name         => 'Visitor',
       p_email             => 'new@example.com',
       p_items             => '[{"item_name":"Kettle","description":"Leaks","priority":1},
                               {"item_name":"Fan","description":"Rattles","priority":2}]',
       p_phone             => null,
       p_zip_code          => '95001',
       p_waiver_version    => 'test-v1',
       p_waiver_text       => 'waiver text',
       p_waiver_hash       => 'abc123',
       p_newsletter_opt_in => true) $$,
  'client can check in through checkin_visitor');

select matches(
  (select result->>'baseCode' from checkin_result),
  '^[A-HJ-NP-Z][2-9][A-HJ-NP-Z]$',
  'checkin_visitor returns a letter-digit-letter base code');
select is(
  (select jsonb_array_length(result->'items') from checkin_result), 2,
  'checkin_visitor returns one entry per item');

-- ── get_fixer_work_order ──
select results_eq(
  $$ select code, status, item_name, client_name
     from get_fixer_work_order('c0000000-0000-0000-0000-000000000003') $$,
  $$ values ('T7T-1'::text, 'pending_assignment'::text, 'Radio'::text, 'Fixie M.'::text) $$,
  'client can read a work order through get_fixer_work_order, with an abbreviated name');
select is_empty(
  $$ select 1 from get_fixer_work_order('c0000000-0000-0000-0000-0000000000ee') $$,
  'get_fixer_work_order returns nothing for an unknown id');

-- ── submit_fixer_outcome ──
select lives_ok(
  $$ select submit_fixer_outcome('c0000000-0000-0000-0000-000000000003', 'Pat Fixer',
                                 'Not Fixed', 'Other', 'needs a part') $$,
  'client can record an outcome through submit_fixer_outcome');
select throws_ok(
  $$ select submit_fixer_outcome('c0000000-0000-0000-0000-000000000003', 'Pat Fixer', 'Fixed') $$,
  'P0001', 'Work order not found or already completed',
  'submit_fixer_outcome refuses an already-completed work order');

-- ── Back as postgres: check what the RPCs wrote ──
reset role;

select results_eq(
  $$ select first_name, last_name, email, zip_code, newsletter_opt_in
     from attendees
     where event_id = 'c0000000-0000-0000-0000-000000000001' and first_name = 'New' $$,
  $$ values ('New'::text, 'Visitor'::text, 'new@example.com'::text, '95001'::text, true) $$,
  'checkin_visitor created the attendee');
select results_eq(
  $$ select w.code, w.item_name, w.priority, w.status
     from work_orders w join attendees a on a.id = w.attendee_id
     where a.first_name = 'New' and w.event_id = 'c0000000-0000-0000-0000-000000000001'
     order by w.priority $$,
  $$ select (select result->>'baseCode' from checkin_result) || '-' || n, item, n, 'pending'::text
     from (values (1, 'Kettle'::text), (2, 'Fan'::text)) v(n, item) $$,
  'checkin_visitor created one pending work order per item, coded <base>-<n>');
select results_eq(
  $$ select w.waiver_version, w.waiver_text, w.content_hash
     from waiver_acceptances w join attendees a on a.id = w.attendee_id
     where a.first_name = 'New' and a.event_id = 'c0000000-0000-0000-0000-000000000001' $$,
  $$ values ('test-v1'::text, 'waiver text'::text, 'abc123'::text) $$,
  'checkin_visitor recorded the waiver acceptance');
select results_eq(
  $$ select status, outcome, fixer_name, not_fixed_reason, not_fixed_note, completed_at is not null
     from work_orders where id = 'c0000000-0000-0000-0000-000000000003' $$,
  $$ values ('completed'::text, 'Not Fixed'::text, 'Pat Fixer'::text, 'Other'::text,
             'needs a part'::text, true) $$,
  'submit_fixer_outcome completed the work order with the outcome and reason');

-- The fixer RPC must never expose contact details.
select is(
  (select count(*)::int from information_schema.routines r
     join information_schema.parameters p
       on p.specific_name = r.specific_name and p.parameter_mode = 'OUT'
   where r.routine_schema = 'public' and r.routine_name = 'get_fixer_work_order'
     and p.parameter_name in ('email', 'phone', 'last_name', 'zip_code')),
  0, 'get_fixer_work_order returns no email, phone, last name or zip code');

select function_privs_are('public', 'checkin_visitor',
  array['uuid','text','text','text','jsonb','text','text','text','text','text','boolean'],
  'anon', array['EXECUTE'], 'anon can execute checkin_visitor');

select * from finish();
rollback;
