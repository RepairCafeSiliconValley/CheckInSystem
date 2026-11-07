-- Short ticket codes — supabase-ticket-code-migration.sql.
--
-- The code on the ticket QR is the first 16 hex digits of the work-order UUID
-- (its first three groups, "the prefix"). Pins:
--   * the guarantee: no two work orders can share a prefix, and the id default
--     quietly draws again instead of failing when a prefix is taken;
--   * resolve_ticket_code(): a visitor with no login can turn a code into the
--     id; case and dashes don't matter; bad or unknown codes give null; it
--     returns the id only.
--
-- Runs in a transaction that is rolled back.
begin;
create extension if not exists pgtap with schema extensions;

select plan(20);

-- ── Fixtures (as postgres, bypassing RLS) ──
insert into events (id, name, date, is_open)
values ('f1c0de00-0000-4000-8000-0000000000e1', 'Ticket Code Event', '2030-01-01', true);
insert into attendees (id, event_id, first_name, last_name)
values ('f1c0de00-0000-4000-8000-0000000000a1', 'f1c0de00-0000-4000-8000-0000000000e1',
        'Tia', 'Ticket');
insert into work_orders (id, code, attendee_id, event_id, item_name, description, priority)
values
  -- Its prefix is f1c0de00-0000-4abc.
  ('f1c0de00-0000-4abc-8000-000000000001', 'TC1-1', 'f1c0de00-0000-4000-8000-0000000000a1',
   'f1c0de00-0000-4000-8000-0000000000e1', 'Kettle', 'No heat', 1),
  -- Neighbours on either side of that prefix, so a lookup that leaked past it
  -- would return the wrong row.
  ('f1c0de00-0000-4abb-ffff-ffffffffffff', 'TC1-2', 'f1c0de00-0000-4000-8000-0000000000a1',
   'f1c0de00-0000-4000-8000-0000000000e1', 'Lamp', 'Flickers', 2),
  ('f1c0de00-0000-4abd-0000-000000000000', 'TC1-3', 'f1c0de00-0000-4000-8000-0000000000a1',
   'f1c0de00-0000-4000-8000-0000000000e1', 'Fan', 'Wobbles', 3);


-- ════ The guarantee ════

select index_is_unique('public', 'work_orders', 'work_orders_ticket_code_key',
  'the ticket-code prefix has a unique index');

select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'work_orders' and column_name = 'id'),
  'new_work_order_id()',
  'work_orders.id defaults to new_work_order_id()');

-- A caller that supplies its own id gets no retry, so the index stops it.
select throws_ok(
  $$ insert into work_orders (id, code, attendee_id, event_id, item_name, description, priority)
     values ('f1c0de00-0000-4abc-9999-999999999999', 'TC1-9',
             'f1c0de00-0000-4000-8000-0000000000a1', 'f1c0de00-0000-4000-8000-0000000000e1',
             'Clash', 'Same prefix', 9) $$,
  '23505', null,
  'an explicit id that shares a prefix is rejected by the index');

-- The retry: offered a candidate whose prefix is taken, it draws a new id.
select isnt(public.new_work_order_id('f1c0de00-0000-4abc-8000-00000000ffff'),
  'f1c0de00-0000-4abc-8000-00000000ffff'::uuid,
  'a candidate with a taken prefix is replaced');
select isnt(substr(public.new_work_order_id('f1c0de00-0000-4abc-8000-00000000ffff')::text, 1, 18),
  'f1c0de00-0000-4abc',
  'the replacement has a different prefix');
select is(public.new_work_order_id('f1c0de00-0000-4abe-8000-000000000000'),
  'f1c0de00-0000-4abe-8000-000000000000'::uuid,
  'a candidate with a free prefix is kept as is');
select is(substr(public.new_work_order_id()::text, 15, 1), '4',
  'with no candidate it draws a random (version 4) UUID');

-- End to end, the way check-in inserts: no id given, so the default runs.
select lives_ok(
  $$ insert into work_orders (code, attendee_id, event_id, item_name, description, priority)
     select 'TCB-' || g, 'f1c0de00-0000-4000-8000-0000000000a1',
            'f1c0de00-0000-4000-8000-0000000000e1', 'Bulk', 'x', g
       from generate_series(1, 200) g $$,
  'inserts that leave id to the default succeed');
select is(
  (select count(distinct substr(id::text, 1, 18))::int from work_orders where code like 'TCB-%'),
  200, 'and every one gets its own prefix');


-- ════ resolve_ticket_code(): anon, because the ticket page has no login ════
set local role anon;

select is(public.resolve_ticket_code('F1C0DE0000004ABC'),
  'f1c0de00-0000-4abc-8000-000000000001'::uuid,
  'anon resolves the upper-case code printed on the ticket');
select is(public.resolve_ticket_code('f1c0de0000004abc'),
  'f1c0de00-0000-4abc-8000-000000000001'::uuid,
  'a lower-case code resolves too');
select is(public.resolve_ticket_code('F1C0DE00-0000-4ABC'),
  'f1c0de00-0000-4abc-8000-000000000001'::uuid,
  'dashes are ignored, so the first three UUID groups work as typed');

select is(public.resolve_ticket_code('F1C0DE0000004ABF'), null,
  'an unknown code gives null');
select is(public.resolve_ticket_code('F1C0DE0000004AB'), null,
  'a 15-digit code gives null');
select is(public.resolve_ticket_code('F1C0DE0000004ABCD'), null,
  'a 17-digit code gives null');
select is(public.resolve_ticket_code('G1C0DE0000004ABC'), null,
  'a non-hex code gives null');
select is(public.resolve_ticket_code(''), null, 'an empty code gives null');
select is(public.resolve_ticket_code(null), null, 'a null code gives null');

-- Resolving gives the id, not access: anon still can't read the row directly.
select is_empty(
  $$ select 1 from work_orders where id = 'f1c0de00-0000-4abc-8000-000000000001' $$,
  'anon still cannot select the work order itself');

reset role;

select function_returns('public', 'resolve_ticket_code', array['text'], 'uuid',
  'resolve_ticket_code returns a bare uuid — no name, phone or any other column');

select * from finish();
rollback;
