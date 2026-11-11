-- ============================================
-- Migration: the front desk adds one item over the event's limit
-- ============================================
-- Run in the Supabase SQL Editor (DEV project first, then prod).
--
-- Prerequisites: supabase-admin-auth-migration.sql (defines
-- can_access_queue()), supabase-migration-v5.sql (events.max_items) and
-- supabase-migration-v8.sql (work_orders.weight_kg). This MUST run after all
-- three.
--
-- Why: an event caps how many items a visitor may enter at check-in
-- (events.max_items). A visitor who filled every slot sometimes turns up at the
-- desk with one more. This lets the volunteer account or an admin add exactly
-- one more item for them, which then prints with the others.
--
-- The rule: the visitor's items that aren't canceled must number exactly
-- max_items. Below the limit there is nothing to bend; above it the extra has
-- already been used. A canceled item frees its slot, so canceling the extra
-- lets the desk add a different one. Whether the event is open doesn't matter:
-- is_open only governs public check-in.
--
-- Direct inserts on work_orders are blocked by RLS ("No direct work order
-- inserts"), so this is SECURITY DEFINER with its own can_access_queue() check,
-- the same shape as unclaim_work_order().
--
-- Safe to re-run.
-- ============================================

create or replace function public.add_extra_work_order(
  p_attendee_id uuid,
  p_item_name text,
  p_category text,
  p_description text,
  p_weight_kg numeric default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_event_id uuid;
  v_max_items integer;
  v_live integer;
  v_base_code text;
  v_next_index integer;
  v_next_priority integer;
  v_id uuid;
begin
  if not public.can_access_queue() then
    raise exception 'Only volunteers and admins can add items'
      using errcode = '42501';
  end if;

  if coalesce(btrim(p_item_name), '') = ''
     or coalesce(btrim(p_category), '') = ''
     or coalesce(btrim(p_description), '') = '' then
    raise exception 'Item name, category and issue are required'
      using errcode = 'P0001';
  end if;

  if p_weight_kg is not null and p_weight_kg < 0 then
    raise exception 'Weight cannot be negative'
      using errcode = 'P0001';
  end if;

  -- Locking the attendee row serializes two desks (or a double tap) adding an
  -- extra for the same visitor, so the count below can't go stale.
  select a.event_id into v_event_id
    from public.attendees a
   where a.id = p_attendee_id
     for update;

  if not found then
    raise exception 'Visitor not found'
      using errcode = 'P0001';
  end if;

  select e.max_items into v_max_items
    from public.events e
   where e.id = v_event_id;

  select count(*) filter (where w.status is distinct from 'canceled'),
         max(split_part(w.code, '-', 1)),
         coalesce(max(nullif(split_part(w.code, '-', 2), '')::integer), 0) + 1,
         coalesce(max(w.priority), 0) + 1
    into v_live, v_base_code, v_next_index, v_next_priority
    from public.work_orders w
   where w.attendee_id = p_attendee_id;

  if v_live <> v_max_items then
    raise exception 'An extra item can only be added when the visitor is at the item limit'
      using errcode = 'P0001';
  end if;

  -- No explicit id: new_work_order_id() keeps the ticket-code prefix unique.
  insert into public.work_orders
    (code, attendee_id, event_id, item_name, category, description,
     priority, status, weight_kg)
  values
    (v_base_code || '-' || v_next_index, p_attendee_id, v_event_id,
     btrim(p_item_name), p_category, btrim(p_description),
     v_next_priority, 'pending', p_weight_kg)
  returning id into v_id;

  return v_id;
end;
$function$;

-- A newly created function grants EXECUTE to PUBLIC by default; the queue is
-- signed-in only, and the function does its own can_access_queue() check.
revoke execute on function public.add_extra_work_order(uuid, text, text, text, numeric) from public, anon;
grant execute on function public.add_extra_work_order(uuid, text, text, text, numeric) to authenticated;
