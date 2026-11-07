-- ============================================
-- Migration: short ticket codes for the ticket QR
-- ============================================
-- Run in the Supabase SQL Editor (DEV project first, then prod).
--
-- Prerequisites: supabase-migration.sql (work_orders). Adds two functions, a
-- column default and a unique index on work_orders. No new columns, no policy
-- changes.
--
-- Why: the ticket QR used to carry the whole work-order UUID
-- (/ticket/<36 chars>), which made a dense 37×37 code that some phones
-- struggled to read off wrinkled thermal paper. Tickets now print
--
--   HTTPS://<domain>/T/<first 16 hex digits of the UUID>
--
-- all in upper case, so the QR can use its compact alphanumeric mode and drops
-- to 29×29. resolve_ticket_code() turns that short code back into the full id;
-- the ticket page then carries on exactly as before, through
-- get_fixer_work_order, submit_fixer_outcome and the claim-and-notify Edge
-- Function, which all still take the full UUID.
--
-- The 16 hex digits are the UUID's first three groups (8-4-4), i.e. the first
-- 18 characters of id::text with its two dashes — called "the prefix" below.
--
-- Uniqueness is guaranteed, and invisible to users:
--   * work_orders_ticket_code_key, a unique index on the prefix, makes a
--     duplicate impossible.
--   * The id default is new_work_order_id(), which draws gen_random_uuid() and
--     draws again if that prefix is already taken, so an insert never trips the
--     index. Collisions are vanishingly rare (60 random bits: about 1 in 90
--     billion over 5,000 items), but when one happens nobody sees an error.
--   * Two check-ins at the same instant can't both pick one prefix: the
--     function holds a transaction lock on the prefix it chose until the insert
--     commits, so a racing draw waits, then sees the committed row and draws
--     again.
-- Only callers that supply their own id (test fixtures) can hit the index, and
-- that error is correct for them. A single multi-row INSERT is the one case
-- where two rows can't see each other's prefix; nothing in the app does that,
-- and the seed's few dozen rows would need a roughly 1-in-10^15 draw.
--
-- Before running on a database with data: the unique index can't be built if
-- two existing rows already share a prefix. This should return no rows:
--   select substr(id::text, 1, 18), count(*) from work_orders
--   group by 1 having count(*) > 1;
--
-- Safety: the code is the only thing protecting a no-login page, the same as
-- the full UUID was. 60 random bits can't be found by guessing.
-- resolve_ticket_code() returns the id and nothing else — no PII.
--
-- Safe to re-run.
-- ============================================


-- ─── 1. Draw a work-order id whose prefix is free ───
-- SECURITY DEFINER so the "is it taken?" check sees every row whatever the
-- caller's RLS allows; it only ever returns a fresh uuid.
--
-- p_first is a test seam: the candidate to try before random ones, so the
-- database tests can force a collision. The column default passes nothing.

create or replace function public.new_work_order_id(p_first uuid default null)
returns uuid
language plpgsql
volatile
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id     uuid := coalesce(p_first, gen_random_uuid());
  v_prefix text;
begin
  -- With a few thousand rows a draw hits a taken prefix about 1 time in 10^14,
  -- so this loop runs once.
  -- The cap only stops a broken generator from spinning forever.
  for attempt in 1..20 loop
    v_prefix := substr(v_id::text, 1, 18);

    -- Held until this transaction ends, i.e. until the row is committed (or
    -- rolled back), so a concurrent draw of the same prefix waits here and
    -- then sees the committed row below.
    perform pg_advisory_xact_lock(hashtextextended('work_order_ticket_code:' || v_prefix, 0));

    if not exists (select 1 from public.work_orders
                    where substr(id::text, 1, 18) = v_prefix) then
      return v_id;
    end if;

    v_id := gen_random_uuid();
  end loop;

  raise exception 'Could not find a free work-order id in 20 draws';
end;
$function$;

-- The default runs with the inserting role's privileges, so every role that
-- inserts work orders needs EXECUTE.
grant execute on function public.new_work_order_id(uuid) to anon, authenticated, service_role;


-- ─── 2. The guarantee ───

create unique index if not exists work_orders_ticket_code_key
  on public.work_orders (substr(id::text, 1, 18));

alter table public.work_orders
  alter column id set default public.new_work_order_id();


-- ─── 3. Short code → work-order id ───
-- Case and dashes don't matter: printed codes are upper case, and someone
-- typing one in might copy the dashes from a full UUID. Anything that isn't
-- exactly 16 hex digits, or matches nothing, gives null. The unique index
-- above both guarantees at most one match and serves this lookup.

create or replace function public.resolve_ticket_code(p_code text)
returns uuid
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_code text := lower(replace(coalesce(p_code, ''), '-', ''));
  v_id   uuid;
begin
  if v_code !~ '^[0-9a-f]{16}$' then
    return null;
  end if;

  select id into v_id
    from public.work_orders
   where substr(id::text, 1, 18) = substr(v_code, 1, 8) || '-'
                                   || substr(v_code, 9, 4) || '-'
                                   || substr(v_code, 13, 4);

  return v_id;
end;
$function$;

-- Public, like get_fixer_work_order: the ticket page needs no login.
revoke execute on function public.resolve_ticket_code(text) from public;
grant execute on function public.resolve_ticket_code(text) to anon, authenticated;
