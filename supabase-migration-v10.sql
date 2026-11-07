-- ============================================
-- Repair Cafe Check-In — Migration V10
-- ============================================
-- Run in the Supabase SQL Editor (Dashboard → SQL Editor → New Query).
-- Validate on the DEV project first, then run on prod.
-- Prerequisite: everything through v9 (text_message_template).
--
-- Adds can_text_client to get_fixer_work_order so the public /claim/:id screen
-- can label its button honestly — "Claim this item & text client" only when a
-- text is actually going to be sent, otherwise just "Claim this item".
--
-- Why this has to live in the function: the claim page is public, so the
-- browser reads with the anon key, and RLS blocks anon from work_orders and
-- attendees entirely (events is readable, but the page has no event_id to look
-- one up with). This SECURITY DEFINER function is the only keyhole that page
-- sees through. It collapses three values the page may not read — the event's
-- collect_phone, the attendee's phone, and their consent — into a single
-- harmless boolean. No phone number or consent flag is ever exposed.
--
-- Nothing is stored: can_text_client is computed per request.

-- ─── 1. Recreate the function with the extra column ───
-- Postgres won't let CREATE OR REPLACE change a function's return columns, so
-- this has to be a drop and recreate (same as v7 did to checkin_visitor).
drop function if exists public.get_fixer_work_order(uuid);

create function public.get_fixer_work_order(p_id uuid)
returns table(
  id               uuid,
  code             text,
  priority         integer,
  status           text,
  item_name        text,
  category         text,
  description      text,
  outcome          text,
  not_fixed_reason text,
  fixer_name       text,
  client_name      text,
  can_text_client  boolean
)
language sql
security definer
-- Must stay pinned. The body is plain joins and string operations, so it does
-- not need 'extensions' — but dropping 'public' would break every table
-- reference below.
set search_path to 'public', 'pg_temp'
as $function$
  select w.id, w.code, w.priority, w.status,
         w.item_name, w.category, w.description,
         w.outcome, w.not_fixed_reason, w.fixer_name,
         a.first_name || ' ' || upper(left(coalesce(a.last_name, ''), 1)) || '.',
         -- The same three gates claim-and-notify applies, in the same order.
         -- The phone test mirrors that function's toE164(): exactly 10 digits,
         -- or 11 beginning with 1. A half-typed number must not promise a text.
         coalesce(e.collect_phone, false)
           and coalesce(a.text_message_opt_in, false)
           and (
             length(regexp_replace(coalesce(a.phone, ''), '\D', '', 'g')) = 10
             or regexp_replace(coalesce(a.phone, ''), '\D', '', 'g') ~ '^1\d{10}$'
           )
  -- LEFT JOIN on purpose: work_orders.event_id is NOT NULL today, but an inner
  -- join would make a missing event return zero rows, which would blank the
  -- whole claim screen rather than just suppressing the text promise.
  from work_orders w
  join attendees a on a.id = w.attendee_id
  left join events e on e.id = w.event_id
  where w.id = p_id;
$function$;

-- ─── 2. Restore the ACL the dropped function had ───
-- A newly created function grants EXECUTE to PUBLIC by default. The original
-- had PUBLIC revoked with explicit role grants, so recreating without this
-- would quietly widen access.
revoke execute on function public.get_fixer_work_order(uuid) from public;
grant execute on function public.get_fixer_work_order(uuid)
  to anon, authenticated, service_role;

-- ============================================
-- Verification queries (run after the above succeeds)
-- ============================================
-- Twelve columns, ending in can_text_client boolean:
-- select pg_get_function_result(oid) from pg_proc
-- where proname = 'get_fixer_work_order';
--
-- ACL matches the old one — no bare "=X/postgres" entry for PUBLIC:
-- select proacl::text from pg_proc where proname = 'get_fixer_work_order';
--
-- Spot-check against the underlying data:
-- select w.id, f.can_text_client, e.collect_phone,
--        a.text_message_opt_in, a.phone is not null as has_phone
-- from work_orders w
-- cross join lateral get_fixer_work_order(w.id) f
-- join attendees a on a.id = w.attendee_id
-- join events e on e.id = w.event_id
-- limit 10;
