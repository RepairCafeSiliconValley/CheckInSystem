-- add_extra_work_order() — the desk adds one item over the event's limit.
-- Added with supabase-extra-item-migration.sql.
--
-- Covers who may call it, the limit rule (non-canceled items must equal
-- max_items, so canceled items free a slot), required fields, and what the new
-- row looks like: the visitor's code with the next suffix, the next priority,
-- status 'pending'.
--
-- Runs in a transaction that is rolled back.
begin;
create extension if not exists pgtap with schema extensions;

select plan(21);

-- ── Fixtures (as postgres, bypassing RLS) ──
-- A closed event: is_open only governs public check-in, so the desk can still
-- add an extra after doors close.
insert into events (id, name, date, is_open, max_items)
values ('f1000000-0000-0000-0000-000000000e01', 'Extra Item Event', '2030-01-01', false, 2);

-- Ada is an enabled admin (allowlisted, then created; the trigger adds her
-- app_users row).
insert into admin_allowlist (email) values ('ada.extra@example.com');
insert into auth.users (id, email, raw_user_meta_data)
values ('f1000000-0000-0000-0000-0000000000ad', 'ada.extra@example.com', '{"full_name":"Ada Admin"}');

insert into attendees (id, event_id, first_name, last_name) values
  ('f1000000-0000-0000-0000-000000000a01', 'f1000000-0000-0000-0000-000000000e01', 'Atlimit', 'Visitor'),
  ('f1000000-0000-0000-0000-000000000a02', 'f1000000-0000-0000-0000-000000000e01', 'Below', 'Visitor'),
  ('f1000000-0000-0000-0000-000000000a03', 'f1000000-0000-0000-0000-000000000e01', 'Over', 'Visitor'),
  ('f1000000-0000-0000-0000-000000000a04', 'f1000000-0000-0000-0000-000000000e01', 'Canceled', 'Visitor');

-- No explicit ids: new_work_order_id() keeps each ticket-code prefix unique.
insert into work_orders (code, attendee_id, event_id, item_name, description, priority, status, cancel_reason) values
  -- At the limit: two live items.
  ('X1X-1', 'f1000000-0000-0000-0000-000000000a01', 'f1000000-0000-0000-0000-000000000e01', 'Lamp',  'Flickers', 1, 'pending', null),
  ('X1X-2', 'f1000000-0000-0000-0000-000000000a01', 'f1000000-0000-0000-0000-000000000e01', 'Radio', 'Silent',   2, 'pending', null),
  -- Below the limit.
  ('X2X-1', 'f1000000-0000-0000-0000-000000000a02', 'f1000000-0000-0000-0000-000000000e01', 'Fan',   'Wobbles',  1, 'pending', null),
  -- Already over (check-in doesn't enforce max_items yet).
  ('X3X-1', 'f1000000-0000-0000-0000-000000000a03', 'f1000000-0000-0000-0000-000000000e01', 'Iron',  'Cold',     1, 'pending', null),
  ('X3X-2', 'f1000000-0000-0000-0000-000000000a03', 'f1000000-0000-0000-0000-000000000e01', 'Kettle','Leaks',    2, 'pending', null),
  ('X3X-3', 'f1000000-0000-0000-0000-000000000a03', 'f1000000-0000-0000-0000-000000000e01', 'Clock', 'Stopped',  3, 'pending', null),
  -- Two checked in, one since canceled: only one live item.
  ('X4X-1', 'f1000000-0000-0000-0000-000000000a04', 'f1000000-0000-0000-0000-000000000e01', 'Drill', 'Sparks',   1, 'pending', null),
  ('X4X-2', 'f1000000-0000-0000-0000-000000000a04', 'f1000000-0000-0000-0000-000000000e01', 'Toy',   'Broken',   2, 'canceled', 'client_left');

select function_privs_are('public', 'add_extra_work_order',
  array['uuid', 'text', 'text', 'text', 'numeric'],
  'anon', array[]::text[], 'anon cannot execute add_extra_work_order');


-- ════ A signed-in user who is neither volunteer nor admin cannot ════
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"f1000000-0000-0000-0000-0000000000cc","email":"stray@example.com"}',
  true);
select throws_ok(
  $$ select public.add_extra_work_order('f1000000-0000-0000-0000-000000000a01', 'Toaster', 'Electronics', 'No heat') $$,
  '42501', 'Only volunteers and admins can add items',
  'a stray signed-in user cannot add an item');
reset role;


-- ════ Volunteer ════
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"f1000000-0000-0000-0000-0000000000aa","email":"volunteer@repaircafe.app"}',
  true);

-- Required fields.
select throws_ok(
  $$ select public.add_extra_work_order('f1000000-0000-0000-0000-000000000a01', '  ', 'Electronics', 'No heat') $$,
  'P0001', 'Item name, category and issue are required', 'a blank item name is refused');
select throws_ok(
  $$ select public.add_extra_work_order('f1000000-0000-0000-0000-000000000a01', 'Toaster', '', 'No heat') $$,
  'P0001', 'Item name, category and issue are required', 'a blank category is refused');
select throws_ok(
  $$ select public.add_extra_work_order('f1000000-0000-0000-0000-000000000a01', 'Toaster', 'Electronics', null) $$,
  'P0001', 'Item name, category and issue are required', 'a missing issue is refused');
select throws_ok(
  $$ select public.add_extra_work_order('f1000000-0000-0000-0000-000000000a01', 'Toaster', 'Electronics', 'No heat', -1) $$,
  'P0001', 'Weight cannot be negative', 'a negative weight is refused');

-- The limit rule.
select throws_ok(
  $$ select public.add_extra_work_order('f1000000-0000-0000-0000-000000000a02', 'Toaster', 'Electronics', 'No heat') $$,
  'P0001', 'An extra item can only be added when the visitor is at the item limit',
  'refused below the limit');
select throws_ok(
  $$ select public.add_extra_work_order('f1000000-0000-0000-0000-000000000a03', 'Toaster', 'Electronics', 'No heat') $$,
  'P0001', 'An extra item can only be added when the visitor is at the item limit',
  'refused when already over the limit');
select throws_ok(
  $$ select public.add_extra_work_order('f1000000-0000-0000-0000-000000000a04', 'Toaster', 'Electronics', 'No heat') $$,
  'P0001', 'An extra item can only be added when the visitor is at the item limit',
  'a canceled item does not count toward the limit');
select throws_ok(
  $$ select public.add_extra_work_order('f1000000-0000-0000-0000-0000000000ff', 'Toaster', 'Electronics', 'No heat') $$,
  'P0001', 'Visitor not found', 'an unknown visitor is refused');

-- At the limit, on a closed event: allowed.
select lives_ok(
  $$ select public.add_extra_work_order('f1000000-0000-0000-0000-000000000a01', '  Toaster ', 'Electronics', ' No heat ', 1.5) $$,
  'volunteer can add one extra item at the limit, even on a closed event');

-- The extra is used up.
select throws_ok(
  $$ select public.add_extra_work_order('f1000000-0000-0000-0000-000000000a01', 'Blender', 'Electronics', 'Stuck') $$,
  'P0001', 'An extra item can only be added when the visitor is at the item limit',
  'a second extra is refused');

reset role;


-- ── Back as postgres: check what the RPC wrote ──
select results_eq(
  $$ select code, item_name, category, description, priority, status, weight_kg, event_id
     from work_orders where attendee_id = 'f1000000-0000-0000-0000-000000000a01' and code = 'X1X-3' $$,
  $$ values ('X1X-3'::text, 'Toaster'::text, 'Electronics'::text, 'No heat'::text, 3,
             'pending'::text, 1.50::numeric(6,2), 'f1000000-0000-0000-0000-000000000e01'::uuid) $$,
  'the extra takes the next code suffix and priority, trimmed, as a pending item');
select is(
  (select count(*)::int from work_orders where attendee_id = 'f1000000-0000-0000-0000-000000000a01'),
  3, 'exactly one item was added');
select is(
  (select printed_at from work_orders where code = 'X1X-3'),
  null::timestamptz, 'the extra is not printed yet');
select is(
  (select substr(id::text, 1, 18) from work_orders where code = 'X1X-3')
    = any (select substr(id::text, 1, 18) from work_orders where code in ('X1X-1', 'X1X-2')),
  false, 'the extra has its own ticket-code prefix');


-- ════ Canceling the extra frees the slot; an admin can add a replacement ════
update work_orders set status = 'canceled', cancel_reason = 'client_left'
 where code = 'X1X-3';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"f1000000-0000-0000-0000-0000000000ad","email":"ada.extra@example.com"}',
  true);
select ok(public.is_admin(), 'Ada is an admin');
select lives_ok(
  $$ select public.add_extra_work_order('f1000000-0000-0000-0000-000000000a01', 'Blender', 'Electronics', 'Stuck') $$,
  'admin can add a replacement once the extra is canceled');
select throws_ok(
  $$ select public.add_extra_work_order('f1000000-0000-0000-0000-000000000a01', 'Mixer', 'Electronics', 'Slow') $$,
  'P0001', 'An extra item can only be added when the visitor is at the item limit',
  'the replacement uses the slot up again');
reset role;

select results_eq(
  $$ select code, priority, weight_kg from work_orders where item_name = 'Blender' $$,
  $$ values ('X1X-4'::text, 4, null::numeric(6,2)) $$,
  'codes and priorities never reuse a canceled item''s number');

-- Not part of this feature: checkin_visitor still accepts more than max_items
-- (rpc_known_gaps.test.sql). The extra rule stays exact so that gap can't be
-- stacked on.
select is(
  (select count(*)::int from work_orders
    where attendee_id = 'f1000000-0000-0000-0000-000000000a01' and status <> 'canceled'),
  3, 'the visitor ends with max_items + 1 live items');

select * from finish();
rollback;
