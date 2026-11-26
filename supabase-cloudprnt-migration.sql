-- ============================================
-- Migration: Star CloudPRNT printing and REPRINT tickets
-- ============================================
-- Run in the Supabase SQL Editor (DEV project first, then prod).
--
-- Prerequisites: supabase-admin-auth-migration.sql (is_admin(),
-- can_access_queue()) and supabase-status-overhaul.sql (the pending /
-- pending_assignment statuses). In the MIGRATIONS list in
-- scripts/db-reset.mjs this runs last.
--
-- What it adds:
--   1. Clean-up of an earlier draft of this file that counted prints.
--   2. Per-event print settings: events.use_legacy_print (window.print()
--      instead of CloudPRNT) and events.print_preview (show the ticket
--      preview before printing). Events that exist when this runs keep
--      today's behaviour (legacy print with a preview); events created
--      afterwards default to CloudPRNT without a preview.
--   3. event_printers — which CloudPRNT printer (by MAC address) an event
--      prints to. Its own admin-only table, because events can be read by
--      anyone.
--   4. cloudprnt_printers — when each printer last checked in with the
--      cloudprnt Edge Function, so the desk can say "No printer detected"
--      instead of queueing a ticket that never prints.
--   5. print_jobs — tickets waiting for (or already handed to) a printer.
--   6. queue_cloudprnt_jobs() — stamps the print and queues it for the
--      event's CloudPRNT printer, in one transaction.
--
-- printed_at records the FIRST print and never moves: queue_cloudprnt_jobs()
-- sets it only when it is empty, and so does markTicketsPrinted() in
-- src/lib/store.js for window.print(). A print of an item that already has
-- printed_at is a reprint, and its ticket says REPRINT.
--
-- Safe to re-run.
-- ============================================


-- ─── 1. Clean-up of an earlier draft ───
-- A first draft of this migration counted prints (work_orders.print_count,
-- record_ticket_prints(), print_jobs.print_count) and never reached PROD.
-- Wherever it ran (DEV, a local stack) these drop what it left; elsewhere
-- they do nothing.

drop function if exists public.record_ticket_prints(uuid[]);
alter table public.work_orders drop column if exists print_count;


-- ─── 2. Per-event print settings ───
-- Added with a default of true so every existing event keeps window.print()
-- and its preview, then the default flips to false for new events.

alter table public.events
  add column if not exists use_legacy_print boolean not null default true;
alter table public.events alter column use_legacy_print set default false;

alter table public.events
  add column if not exists print_preview boolean not null default true;
alter table public.events alter column print_preview set default false;


-- ─── MAC address helper ───
-- Canonical form: twelve hex digits, lower case, colon separated
-- ("00:11:62:aa:bb:cc"), which is how CloudPRNT printers report themselves.
-- Accepts dashes, dots, no separators or upper case; anything that isn't
-- twelve hex digits gives null. Mirrored by normalizeMac() in
-- src/lib/printing.js and in the cloudprnt Edge Function.

create or replace function public.normalize_mac(p_mac text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case when length(h) = 12 then
           substr(h, 1, 2) || ':' || substr(h, 3, 2) || ':' || substr(h, 5, 2) || ':' ||
           substr(h, 7, 2) || ':' || substr(h, 9, 2) || ':' || substr(h, 11, 2)
         end
    from (select lower(regexp_replace(coalesce(p_mac, ''), '[^0-9A-Fa-f]', '', 'g')) as h) s;
$$;


-- ─── 3. Which printer each event uses ───

create table if not exists public.event_printers (
  event_id     uuid primary key references public.events(id) on delete cascade,
  printer_mac  text not null check (printer_mac = public.normalize_mac(printer_mac)),
  updated_at   timestamptz not null default now()
);

alter table public.event_printers enable row level security;

drop policy if exists "Admins can read event printers" on public.event_printers;
create policy "Admins can read event printers"
  on public.event_printers for select to authenticated
  using ((select public.is_admin()));
drop policy if exists "Admins can add event printers" on public.event_printers;
create policy "Admins can add event printers"
  on public.event_printers for insert to authenticated
  with check ((select public.is_admin()));
drop policy if exists "Admins can change event printers" on public.event_printers;
create policy "Admins can change event printers"
  on public.event_printers for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
drop policy if exists "Admins can remove event printers" on public.event_printers;
create policy "Admins can remove event printers"
  on public.event_printers for delete to authenticated
  using ((select public.is_admin()));

revoke all on public.event_printers from anon;


-- ─── 4. Printer check-ins ───
-- Written only by the cloudprnt Edge Function (service role). Admins can read
-- it, so Configure Event can show when a printer was last seen.

create table if not exists public.cloudprnt_printers (
  printer_mac           text primary key check (printer_mac = public.normalize_mac(printer_mac)),
  last_poll_at          timestamptz not null default now(),
  status_code           text,
  printing_in_progress  boolean
);

alter table public.cloudprnt_printers enable row level security;

drop policy if exists "Admins can read printer check-ins" on public.cloudprnt_printers;
create policy "Admins can read printer check-ins"
  on public.cloudprnt_printers for select to authenticated
  using ((select public.is_admin()));

revoke all on public.cloudprnt_printers from anon;
revoke insert, update, delete on public.cloudprnt_printers from authenticated;


-- ─── 5. Print jobs ───
-- One row per ticket sent to a CloudPRNT printer. `ticket` is the snapshot
-- the desk built (the same fields the preview shows); the Edge Function turns
-- it into printer commands when the printer asks for it. `reprint` says
-- whether the item had been printed before this job, so the ticket says
-- REPRINT.
--
-- state: queued → printed, or failed after three failed attempts, or expired
-- when no printer took it within ten minutes (see the Edge Function).

create table if not exists public.print_jobs (
  id             uuid primary key default gen_random_uuid(),
  seq            bigint generated always as identity,
  printer_mac    text not null,
  event_id       uuid not null references public.events(id) on delete cascade,
  work_order_id  uuid not null references public.work_orders(id) on delete cascade,
  reprint        boolean not null default false,
  ticket         jsonb not null,
  state          text not null default 'queued',
  attempts       integer not null default 0,
  result_code    text,
  created_at     timestamptz not null default now(),
  fetched_at     timestamptz,
  completed_at   timestamptz
);

-- For a DEV table made by the earlier draft (see 1).
alter table public.print_jobs add column if not exists reprint boolean not null default false;
alter table public.print_jobs drop column if exists print_count;

create index if not exists print_jobs_queued_idx
  on public.print_jobs (printer_mac, seq)
  where state = 'queued';

alter table public.print_jobs enable row level security;

-- The desk may see what it sent; only the RPC below and the Edge Function
-- write here.
drop policy if exists "Volunteers and admins can read print jobs" on public.print_jobs;
create policy "Volunteers and admins can read print jobs"
  on public.print_jobs for select to authenticated
  using ((select public.can_access_queue()));

revoke all on public.print_jobs from anon;
revoke insert, update, delete on public.print_jobs from authenticated;


-- ─── 6. Stamp a print and queue it for CloudPRNT ───
-- p_tickets is a JSON array, one object per ticket, each carrying at least
-- "work_order_id"; the whole object is kept as the job's ticket snapshot.
-- All tickets must belong to one event. Fails, changing nothing, when the
-- event has no printer set up or its printer hasn't checked in within the
-- last 30 seconds — the printer polls every few seconds while it's on.
--
-- For each item still on the board (not printed, or Checked-In) it sets
-- printed_at if it is empty, moves a not-yet-printed item to Checked-In and
-- queues one job. Returns each queued item and whether it was a reprint
-- (printed_at was already set).

drop function if exists public.queue_cloudprnt_jobs(jsonb);
create function public.queue_cloudprnt_jobs(p_tickets jsonb)
returns table (work_order_id uuid, reprint boolean)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ids uuid[];
  v_event_ids uuid[];
  v_mac text;
  v_last_poll timestamptz;
begin
  if not public.can_access_queue() then
    raise exception 'Only volunteers and admins can print tickets'
      using errcode = '42501';
  end if;

  if p_tickets is null or jsonb_typeof(p_tickets) <> 'array'
     or jsonb_array_length(p_tickets) = 0 then
    raise exception 'No tickets to print'
      using errcode = 'P0001';
  end if;

  select array_agg(distinct (t.elem ->> 'work_order_id')::uuid)
    into v_ids
    from jsonb_array_elements(p_tickets) as t(elem);

  select array_agg(distinct w.event_id)
    into v_event_ids
    from public.work_orders w
   where w.id = any(v_ids)
     and w.status in ('pending', 'pending_assignment');

  if v_event_ids is null then
    raise exception 'None of these items can be printed'
      using errcode = 'P0001';
  end if;
  if array_length(v_event_ids, 1) <> 1 then
    raise exception 'Tickets must all belong to one event'
      using errcode = 'P0001';
  end if;

  select p.printer_mac into v_mac
    from public.event_printers p
   where p.event_id = v_event_ids[1];

  if v_mac is null then
    raise exception 'No printer is set up for this event'
      using errcode = 'P0001';
  end if;

  select c.last_poll_at into v_last_poll
    from public.cloudprnt_printers c
   where c.printer_mac = v_mac;

  if v_last_poll is null or v_last_poll < now() - interval '30 seconds' then
    raise exception 'No printer detected. Check that the printer is on and connected to the network.'
      using errcode = 'P0001';
  end if;

  return query
  with stamped as (
    -- `prev` keeps printed_at as it was before this print; RETURNING alone
    -- would only show the new value.
    update public.work_orders w
       set printed_at = coalesce(w.printed_at, now()),
           status     = case when w.status = 'pending' then 'pending_assignment' else w.status end
      from (select x.id, x.printed_at
              from public.work_orders x
             where x.id = any(v_ids)
               and x.status in ('pending', 'pending_assignment')
               for update) prev
     where w.id = prev.id
    returning w.id, prev.printed_at is not null as reprint
  ),
  tickets as (
    -- First occurrence of each item, in the order the desk sent them, so the
    -- tickets come out of the printer in priority order.
    select distinct on ((t.elem ->> 'work_order_id')::uuid)
           (t.elem ->> 'work_order_id')::uuid as id, t.elem, t.ord
      from jsonb_array_elements(p_tickets) with ordinality as t(elem, ord)
     order by (t.elem ->> 'work_order_id')::uuid, t.ord
  ),
  queued as (
    insert into public.print_jobs (printer_mac, event_id, work_order_id, reprint, ticket)
    select v_mac, v_event_ids[1], c.id, c.reprint, tk.elem
      from stamped c
      join tickets tk on tk.id = c.id
     order by tk.ord
    returning 1
  )
  select c.id, c.reprint from stamped c;
end;
$function$;

revoke execute on function public.queue_cloudprnt_jobs(jsonb) from public, anon;
grant execute on function public.queue_cloudprnt_jobs(jsonb) to authenticated;
