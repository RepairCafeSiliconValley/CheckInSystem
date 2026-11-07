-- unclaim_work_order() — putting a With Fixer item back on the board.
-- Added with supabase-migration-v12.sql.
--
-- Covers the privilege gate, the work-order revert, and the part that isn't
-- obvious: superseding the prior summons so the next claim can text the client
-- again, which the sms_notifications_sent_once index would otherwise forbid.
--
-- Runs in a transaction that is rolled back.
begin;
create extension if not exists pgtap with schema extensions;

select plan(15);

-- ── Fixtures (as postgres, bypassing RLS) ──
insert into events (id, name, date, is_open, collect_phone)
values ('e0000000-0000-0000-0000-000000000001', 'Unclaim Event', '2030-01-01', true, true);
insert into attendees (id, event_id, first_name, last_name, phone, text_message_opt_in)
values ('e0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001',
        'Clem', 'Client', '4155550123', true);
-- Already claimed: this is the state the button acts on.
insert into work_orders (id, code, attendee_id, event_id, item_name, description,
                         priority, status, fixer_name, assigned_at)
values ('e0000000-0000-0000-0000-000000000003', 'U1U-1', 'e0000000-0000-0000-0000-000000000002',
        'e0000000-0000-0000-0000-000000000001', 'Blender', 'Leaks', 1,
        'assigned', 'Oscar Fixer', now());
-- The summons that already went out for that claim.
insert into sms_notifications (work_order_id, attendee_id, event_id, to_phone,
                               message_type, body, status)
values ('e0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000002',
        'e0000000-0000-0000-0000-000000000001', '+14155550123',
        'summon', 'Hi Clem, your Blender is ready.', 'queued');

-- A second active summons is impossible before the unclaim.
select throws_ok(
  $$ insert into sms_notifications (work_order_id, message_type, status)
     values ('e0000000-0000-0000-0000-000000000003', 'summon', 'queued') $$,
  '23505', null, 'a second active summons is blocked while the first stands');


-- ════ Anon cannot unclaim ════
set local role anon;
select throws_ok(
  $$ select public.unclaim_work_order('e0000000-0000-0000-0000-000000000003') $$,
  '42501', 'Only volunteers and admins can unclaim items',
  'anon cannot unclaim a work order');
reset role;


-- ════ Volunteer can ════
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"e0000000-0000-0000-0000-0000000000aa","email":"volunteer@repaircafe.app"}',
  true);

select lives_ok(
  $$ select public.unclaim_work_order('e0000000-0000-0000-0000-000000000003') $$,
  'volunteer can put a With Fixer item back on the board');

-- Only 'assigned' items can be unclaimed, so a second call finds nothing.
select throws_ok(
  $$ select public.unclaim_work_order('e0000000-0000-0000-0000-000000000003') $$,
  'P0001', 'Work order is not with a fixer',
  'unclaiming an item that is not with a fixer raises');
select throws_ok(
  $$ select public.unclaim_work_order('e0000000-0000-0000-0000-0000000000ee') $$,
  'P0001', 'Work order is not with a fixer',
  'unclaiming an unknown work order raises');

reset role;


-- ── Back as postgres: check what the RPC wrote ──
select results_eq(
  $$ select status, fixer_name, assigned_at
     from work_orders where id = 'e0000000-0000-0000-0000-000000000003' $$,
  $$ values ('pending_assignment'::text, null::text, null::timestamptz) $$,
  'the item is back to Checked-In with the fixer and claim time cleared');

select is(
  (select count(*)::int from sms_notifications
   where work_order_id = 'e0000000-0000-0000-0000-000000000003'
     and superseded_at is not null),
  1, 'the prior summons is marked superseded');
select is(
  (select count(*)::int from sms_notifications
   where work_order_id = 'e0000000-0000-0000-0000-000000000003'
     and superseded_at is null),
  0, 'no active summons is left standing');
-- Nothing is deleted: the ledger still has the original send.
select is(
  (select body from sms_notifications
   where work_order_id = 'e0000000-0000-0000-0000-000000000003'),
  'Hi Clem, your Blender is ready.', 'the original send is kept, not deleted');

-- The point of the whole exercise: the next claim can summon the client again.
select lives_ok(
  $$ insert into sms_notifications (work_order_id, message_type, status)
     values ('e0000000-0000-0000-0000-000000000003', 'summon', 'queued') $$,
  'a fresh summons is allowed once the prior one is superseded');
select is(
  (select count(*)::int from sms_notifications
   where work_order_id = 'e0000000-0000-0000-0000-000000000003'),
  2, 'both summonses are on the ledger');


-- ════ Round two: the cycle repeats without limit ════
-- Nothing is special about the first put-back. The index only ever constrains
-- the one *active* summons, so claim → summon → unclaim can run any number of
-- times; this pins that rather than leaving it to inference.
update work_orders
   set status = 'assigned', fixer_name = 'Pat Fixer', assigned_at = now()
 where id = 'e0000000-0000-0000-0000-000000000003';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"e0000000-0000-0000-0000-0000000000aa","email":"volunteer@repaircafe.app"}',
  true);
select lives_ok(
  $$ select public.unclaim_work_order('e0000000-0000-0000-0000-000000000003') $$,
  'a re-claimed item can be put back on the board again');
reset role;

select is(
  (select count(*)::int from sms_notifications
   where work_order_id = 'e0000000-0000-0000-0000-000000000003'
     and superseded_at is null),
  0, 'the second summons is superseded too, leaving none active');
select lives_ok(
  $$ insert into sms_notifications (work_order_id, message_type, status)
     values ('e0000000-0000-0000-0000-000000000003', 'summon', 'queued') $$,
  'a third summons is allowed after the second put-back');
select is(
  (select count(*)::int from sms_notifications
   where work_order_id = 'e0000000-0000-0000-0000-000000000003'),
  3, 'the ledger keeps every summons across repeated put-backs');

select * from finish();
rollback;
