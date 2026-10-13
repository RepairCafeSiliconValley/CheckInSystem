-- The ADMIN access level (supabase-admin-auth-migration.sql): the sign-up
-- hook, the auth.users triggers, is_admin(), the admin tables and RPCs, and
-- what a disabled admin loses.
--
-- The hook is called by Supabase Auth, not SQL, so it is called directly
-- here; the real sign-up path is checked by hand (docs/admin-auth-plan.md §8).
-- Users are created by inserting into auth.users as postgres, which fires the
-- same triggers a real sign-up does.
--
-- Runs in a transaction that is rolled back.
begin;
create extension if not exists pgtap with schema extensions;

select plan(49);

-- ── Fixtures ──
-- Ada and Bea are admins (allowlisted, then created). Cal is created without
-- an invite. Dee is still only on the allowlist, invited by Bea.
insert into admin_allowlist (email) values ('ada@example.com'), ('bea@example.com');
insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-00000000000a', 'ada@example.com', '{"full_name":"Ada Admin","avatar_url":"https://example.com/a.png"}'),
  ('d0000000-0000-0000-0000-00000000000b', 'Bea@Example.com', '{}'),
  ('d0000000-0000-0000-0000-00000000000c', 'cal@example.com', '{"full_name":"Cal Uninvited"}');
insert into admin_allowlist (email, invited_by)
values ('dee@example.com', 'd0000000-0000-0000-0000-00000000000b');

insert into events (id, name, date)
values ('d0000000-0000-0000-0000-000000000e01', 'Test Event', '2030-01-01');
insert into attendees (id, event_id, first_name, last_name)
values ('d0000000-0000-0000-0000-000000000a01', 'd0000000-0000-0000-0000-000000000e01', 'Testy', 'Visitor');


-- ════ Hook (called directly) ════
select is(public.hook_before_user_created('{"user":{"email":"dee@example.com"}}'),
  '{}'::jsonb, 'hook allows an allowlisted email');
select is(public.hook_before_user_created('{"user":{"email":"DEE@Example.COM"}}'),
  '{}'::jsonb, 'hook matches the allowlist case-insensitively');
select is(public.hook_before_user_created('{"user":{"email":"volunteer@repaircafe.app"}}') #>> '{error,http_code}',
  '403', 'hook rejects public sign-up as the volunteer account (it is created via the admin API)');
select is(public.hook_before_user_created('{"user":{"email":"stranger@example.com"}}') #>> '{error,http_code}',
  '403', 'hook rejects an email that is not allowlisted');
select is(public.hook_before_user_created('{"user":{"phone":"15555550100"}}') #>> '{error,http_code}',
  '403', 'hook rejects a sign-up with no email');
select is(public.hook_before_user_created('{"user":{"email":"stranger@example.com"}}') #>> '{error,message}',
  'This email has not been approved for admin access.', 'the rejection carries the message shown on /admin');
select function_privs_are('public', 'hook_before_user_created', array['jsonb'],
  'anon', array[]::text[], 'anon cannot execute the hook');
select function_privs_are('public', 'hook_before_user_created', array['jsonb'],
  'authenticated', array[]::text[], 'authenticated cannot execute the hook');
select function_privs_are('public', 'hook_before_user_created', array['jsonb'],
  'supabase_auth_admin', array['EXECUTE'], 'supabase_auth_admin can execute the hook');


-- ════ Triggers ════
select results_eq(
  $$ select email, name, avatar_url, disabled from app_users
     where id = 'd0000000-0000-0000-0000-00000000000a' $$,
  $$ values ('ada@example.com'::text, 'Ada Admin'::text, 'https://example.com/a.png'::text, false) $$,
  'an allowlisted sign-up creates an enabled app_users row with the Google name');
select results_eq(
  $$ select email, name from app_users where id = 'd0000000-0000-0000-0000-00000000000b' $$,
  $$ values ('bea@example.com'::text, 'bea'::text) $$,
  'with no name in the metadata, the name falls back to the email prefix (lower-cased)');
select is_empty(
  $$ select 1 from admin_allowlist where email in ('ada@example.com', 'bea@example.com') $$,
  'the used invites are removed from the allowlist');
select is_empty(
  $$ select 1 from app_users where id = 'd0000000-0000-0000-0000-00000000000c' $$,
  'a user created without an invite gets no app_users row');

update auth.users set last_sign_in_at = '2030-05-05 10:00+00'
where id = 'd0000000-0000-0000-0000-00000000000a';
select is(
  (select last_login_at from app_users where id = 'd0000000-0000-0000-0000-00000000000a'),
  '2030-05-05 10:00+00'::timestamptz, 'signing in copies last_sign_in_at to last_login_at');


-- ════ Enabled admin (Ada) ════
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d0000000-0000-0000-0000-00000000000a","email":"ada@example.com"}',
  true);

select ok(public.is_admin(),          'admin: is_admin() is true');
select ok(not public.is_volunteer(),  'admin: is_volunteer() is false');
select ok(public.can_access_queue(),  'admin: can_access_queue() is true');

-- Queue data and events.
select isnt_empty(
  $$ select 1 from attendees where id = 'd0000000-0000-0000-0000-000000000a01' $$,
  'admin can read attendees');
with u as (update attendees set first_name = 'Edited'
           where id = 'd0000000-0000-0000-0000-000000000a01' returning 1)
select is(count(*)::int, 1, 'admin can update attendees') from u;
select lives_ok(
  $$ insert into events (name, date) values ('Admin Event', '2030-02-02') $$,
  'admin can create events');
with u as (update events set is_open = false
           where id = 'd0000000-0000-0000-0000-000000000e01' returning 1)
select is(count(*)::int, 1, 'admin can update events') from u;

-- Allowlist.
-- Filtered to this file's fixtures, so real local data doesn't affect it.
select results_eq(
  $$ select email from admin_allowlist
     where email in ('ada@example.com', 'bea@example.com', 'dee@example.com')
     order by email $$,
  $$ values ('dee@example.com'::text) $$,
  'admin can read the allowlist');
select lives_ok(
  $$ insert into admin_allowlist (email) values ('eve@example.com') $$,
  'admin can add to the allowlist');
select is(
  (select invited_by from admin_allowlist where email = 'eve@example.com'),
  'd0000000-0000-0000-0000-00000000000a'::uuid, 'invited_by defaults to the inviting admin');
select throws_ok(
  $$ insert into admin_allowlist (email) values ('Mixed@Example.com') $$,
  '23514', null, 'the allowlist only accepts lower-case emails');
with d as (delete from admin_allowlist where email = 'eve@example.com' returning 1)
select is(count(*)::int, 1, 'admin can remove from the allowlist') from d;

-- Users table: read all, rename only.
select results_eq(
  $$ select email from app_users
     where email in ('ada@example.com', 'bea@example.com', 'cal@example.com')
     order by email $$,
  $$ values ('ada@example.com'::text), ('bea@example.com'::text) $$,
  'admin can read app_users, including other admins');
with u as (update app_users set name = 'Bea Renamed'
           where id = 'd0000000-0000-0000-0000-00000000000b' returning 1)
select is(count(*)::int, 1, 'admin can rename a user') from u;
select throws_ok(
  $$ update app_users set name = '  ' where id = 'd0000000-0000-0000-0000-00000000000b' $$,
  '23514', null, 'an empty name is rejected');
select throws_ok(
  $$ update app_users set disabled = true where id = 'd0000000-0000-0000-0000-00000000000b' $$,
  '42501', null, 'admin cannot change disabled directly');
select throws_ok(
  $$ update app_users set email = 'x@example.com' where id = 'd0000000-0000-0000-0000-00000000000b' $$,
  '42501', null, 'admin cannot change email directly');
select throws_ok(
  $$ insert into app_users (id, email, name) values ('d0000000-0000-0000-0000-00000000000c', 'cal@example.com', 'Cal') $$,
  '42501', null, 'admin cannot insert app_users rows directly');

-- RPC guards.
select throws_ok(
  $$ select public.set_user_disabled('d0000000-0000-0000-0000-00000000000a', true) $$,
  'P0001', 'You can''t disable or enable yourself', 'admin cannot disable themselves');
select throws_ok(
  $$ select public.delete_app_user('d0000000-0000-0000-0000-00000000000a') $$,
  'P0001', 'You can''t delete yourself', 'admin cannot delete themselves');
select throws_ok(
  $$ select public.delete_app_user('d0000000-0000-0000-0000-00000000000c') $$,
  'P0001', 'User not found', 'delete_app_user refuses a login that is not an app user');
select lives_ok(
  $$ select public.set_user_disabled('d0000000-0000-0000-0000-00000000000b', true) $$,
  'admin can disable another admin');


-- ════ Disabled admin (Bea) ════
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d0000000-0000-0000-0000-00000000000b","email":"bea@example.com"}',
  true);

select ok(not public.is_admin(),   'disabled admin: is_admin() is false');
select results_eq(
  $$ select email, disabled from app_users $$,
  $$ values ('bea@example.com'::text, true) $$,
  'disabled admin sees only their own row, marked disabled');
select throws_ok(
  $$ insert into events (name, date) values ('Disabled Event', '2030-03-03') $$,
  '42501', null, 'disabled admin cannot create events');
select is_empty($$ select 1 from attendees $$,       'disabled admin cannot read attendees');
select is_empty($$ select 1 from admin_allowlist $$, 'disabled admin cannot read the allowlist');
select throws_ok(
  $$ select public.set_user_disabled('d0000000-0000-0000-0000-00000000000a', true) $$,
  '42501', null, 'disabled admin cannot use set_user_disabled');
select throws_ok(
  $$ select public.delete_app_user('d0000000-0000-0000-0000-00000000000a') $$,
  '42501', null, 'disabled admin cannot use delete_app_user');


-- ════ Ada re-enables, then deletes Bea ════
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d0000000-0000-0000-0000-00000000000a","email":"ada@example.com"}',
  true);
select lives_ok(
  $$ select public.set_user_disabled('d0000000-0000-0000-0000-00000000000b', false) $$,
  'admin can re-enable a disabled admin');
select lives_ok(
  $$ select public.delete_app_user('d0000000-0000-0000-0000-00000000000b') $$,
  'admin can delete another admin');

-- ════ Client (anon) ════
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$ select public.set_user_disabled('d0000000-0000-0000-0000-00000000000a', true) $$,
  '42501', null, 'client cannot call set_user_disabled');


-- ── Back as postgres: what the RPCs did ──
reset role;
select is_empty(
  $$ select 1 from auth.users where id = 'd0000000-0000-0000-0000-00000000000b'
     union all
     select 1 from app_users where id = 'd0000000-0000-0000-0000-00000000000b' $$,
  'delete_app_user removed the login and its app_users row');
select is(
  (select invited_by from admin_allowlist where email = 'dee@example.com'),
  null, 'invites sent by a deleted admin stay, with invited_by cleared');
select is(
  (select name from app_users where id = 'd0000000-0000-0000-0000-00000000000a'),
  'Ada Admin', 'the remaining admin is untouched');

select * from finish();
rollback;
