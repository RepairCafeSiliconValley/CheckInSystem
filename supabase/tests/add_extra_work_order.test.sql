-- add_extra_work_order() — the desk adds items to a visitor's check-in.
-- Added with supabase-extra-item-migration.sql.
--
-- Covers who may call it, that the event's max_items does not limit the desk
-- (below, at and over it all work), required fields, and what each new row
-- looks like: the visitor's code with the next suffix, the next priority,
-- status 'pending'.
--
-- Runs in a transaction that is rolled back.
begin;
create extension if not exists pgtap with schema extensions;

select plan(26);

-- ── Fixtures (as postgres, bypassing RLS) ──
-- A closed event: is_open only governs public check-in, so the desk can still
-- add items after doors close.
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
  ('f1000000-0000-0000-0000-000000000a04', 'f1000000-0000-0000-0000-000000000e01', 'Canceled', 'Visitor'),
  -- No work orders at all (check-in never makes this, but the RPC must cope).
  ('f1000000-0000-0000-0000-000000000a05', 'f1000000-0000-0000-0000-000000000e01', 'Empty', 'Visitor'),
  -- Older code shapes: the first check-in version's 'R-ABC-1', and the seed's
  -- bare 'R-ABC'.
  ('f1000000-0000-0000-0000-000000000a06', 'f1000000-0000-0000-0000-000000000e01', 'Legacy', 'Visitor'),
  ('f1000000-0000-0000-0000-000000000a07', 'f1000000-0000-0000-0000-000000000e01', 'Bare', 'Visitor');

-- No explicit ids: new_work_order_id() keeps each ticket-code prefix unique.
insert into work_orders (code, attendee_id, event_id, item_name, description, priority, status, cancel_reason) values
  -- At the limit: two live items.
  ('X1X-1', 'f1000000-0000-0000-0000-000000000a01', 'f1000000-0000-0000-0000-000000000e01', 'Lamp',  'Flickers', 1, 'pending', null),
  ('X1X-2', 'f1000000-0000-0000-0000-000000000a01', 'f1000000-0000-0000-0000-000000000e01', 'Radio', 'Silent',   2, 'pending', null),
  -- Below the limit: one item.
  ('X2X-1', 'f1000000-0000-0000-0000-000000000a02', 'f1000000-0000-0000-0000-000000000e01', 'Fan',   'Wobbles',  1, 'pending', null),
  -- Already over (check-in doesn't enforce max_items yet).
  ('X3X-1', 'f1000000-0000-0000-0000-000000000a03', 'f1000000-0000-0000-0000-000000000e01', 'Iron',  'Cold',     1, 'pending', null),
  ('X3X-2', 'f1000000-0000-0000-0000-000000000a03', 'f1000000-0000-0000-0000-000000000e01', 'Kettle','Leaks',    2, 'pending', null),
  ('X3X-3', 'f1000000-0000-0000-0000-000000000a03', 'f1000000-0000-0000-0000-000000000e01', 'Clock', 'Stopped',  3, 'pending', null),
  -- Two checked in, the second since canceled.
  ('X4X-1', 'f1000000-0000-0000-0000-000000000a04', 'f1000000-0000-0000-0000-000000000e01', 'Drill', 'Sparks',   1, 'pending', null),
  ('X4X-2', 'f1000000-0000-0000-0000-000000000a04', 'f1000000-0000-0000-0000-000000000e01', 'Toy',   'Broken',   2, 'canceled', 'client_left'),
  ('R-K2P-1', 'f1000000-0000-0000-0000-000000000a06', 'f1000000-0000-0000-0000-000000000e01', 'Vase', 'Chipped', 1, 'pending', null),
  ('R-K2P-2', 'f1000000-0000-0000-0000-000000000a06', 'f1000000-0000-0000-0000-000000000e01', 'Bowl', 'Cracked', 2, 'pending', null),
  ('R-Q7Z',   'f1000000-0000-0000-0000-000000000a07', 'f1000000-0000-0000-0000-000000000e01', 'Chair', 'Wobbles', 1, 'pending', null);

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

-- Visitors the RPC can't add to.
select throws_ok(
  $$ select public.add_extra_work_order('f1000000-0000-0000-0000-0000000000ff', 'Toaster', 'Electronics', 'No heat') $$,
  'P0001', 'Visitor not found', 'an unknown visitor is refused');
select throws_ok(
  $$ select public.add_extra_work_order('f1000000-0000-0000-0000-000000000a05', 'Toaster', 'Electronics', 'No heat') $$,
  'P0001', 'Visitor has no items to add to', 'a visitor with no ticket code to extend is refused');

-- max_items doesn't limit the desk: below, at and over it all work, on a
-- closed event, as many times as needed.
select lives_ok(
  $$ select public.add_extra_work_order('f1000000-0000-0000-0000-000000000a02', 'Toaster', 'Electronics', 'No heat') $$,
  'a visitor below the limit can get another item');
select lives_ok(
  $$ select public.add_extra_work_order('f1000000-0000-0000-0000-000000000a04', 'Toaster', 'Electronics', 'No heat') $$,
  'a visitor with a canceled item can get another item');
select lives_ok(
  $$ select public.add_extra_work_order('f1000000-0000-0000-0000-000000000a01', '  Toaster ', 'Electronics', ' No heat ', 1.5) $$,
  'a visitor at the limit can get another item');
select lives_ok(
  $$ select public.add_extra_work_order('f1000000-0000-0000-0000-000000000a01', 'Blender', 'Electronics', 'Stuck') $$,
  'and another');
select lives_ok(
  $$ select public.add_extra_work_order('f1000000-0000-0000-0000-000000000a03', 'Toaster', 'Electronics', 'No heat') $$,
  'a visitor already over the limit can get another item');
select lives_ok(
  $$ select public.add_extra_work_order('f1000000-0000-0000-0000-000000000a06', 'Toaster', 'Electronics', 'No heat') $$,
  'a visitor with R-ABC-1 style codes can get another item');
select lives_ok(
  $$ select public.add_extra_work_order('f1000000-0000-0000-0000-000000000a07', 'Toaster', 'Electronics', 'No heat') $$,
  'a visitor with a bare R-ABC code can get another item');

reset role;


-- ── Back as postgres: check what the RPC wrote ──
select results_eq(
  $$ select code, item_name, category, description, priority, status, weight_kg, event_id
     from work_orders where code = 'X1X-3' $$,
  $$ values ('X1X-3'::text, 'Toaster'::text, 'Electronics'::text, 'No heat'::text, 3,
             'pending'::text, 1.50::numeric(6,2), 'f1000000-0000-0000-0000-000000000e01'::uuid) $$,
  'the new item takes the next code suffix and priority, trimmed, as a pending item');
select results_eq(
  $$ select code, item_name, priority from work_orders
      where attendee_id = 'f1000000-0000-0000-0000-000000000a01' order by priority $$,
  $$ values ('X1X-1'::text, 'Lamp'::text, 1), ('X1X-2', 'Radio', 2), ('X1X-3', 'Toaster', 3),
            ('X1X-4', 'Blender', 4) $$,
  'each added item takes the next code and priority in turn');
select results_eq(
  $$ select code, priority from work_orders
      where attendee_id = 'f1000000-0000-0000-0000-000000000a02' order by priority $$,
  $$ values ('X2X-1'::text, 1), ('X2X-2', 2) $$,
  'a one-item visitor''s addition becomes item 2');
select is(
  (select code from work_orders where attendee_id = 'f1000000-0000-0000-0000-000000000a04' and item_name = 'Toaster'),
  'X4X-3', 'a canceled item''s code number is not reused');
select is(
  (select priority from work_orders where code = 'X3X-4'),
  4, 'an over-limit visitor''s addition follows their highest priority');
select is(
  (select code from work_orders where attendee_id = 'f1000000-0000-0000-0000-000000000a06' and item_name = 'Toaster'),
  'R-K2P-3', 'an R-ABC-1 code keeps its R- base and takes the next number');
select is(
  (select code from work_orders where attendee_id = 'f1000000-0000-0000-0000-000000000a07' and item_name = 'Toaster'),
  'R-Q7Z-2', 'a bare code gets a number past the visitor''s item count');
select is(
  (select printed_at from work_orders where code = 'X1X-3'),
  null::timestamptz, 'the new item is not printed yet');
select is(
  (select count(distinct substr(id::text, 1, 18))::int from work_orders
    where attendee_id = 'f1000000-0000-0000-0000-000000000a01'),
  4, 'every item has its own ticket-code prefix');


-- ════ Admin ════
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"f1000000-0000-0000-0000-0000000000ad","email":"ada.extra@example.com"}',
  true);
select ok(public.is_admin(), 'Ada is an admin');
select lives_ok(
  $$ select public.add_extra_work_order('f1000000-0000-0000-0000-000000000a02', 'Kettle', 'Electronics', 'Leaks') $$,
  'admin can add an item too');
reset role;

select * from finish();
rollback;
