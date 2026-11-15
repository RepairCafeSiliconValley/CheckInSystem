-- ============================================
-- Migration: the front desk adds items to a visitor's check-in
-- ============================================
-- Run in the Supabase SQL Editor (DEV project first, then prod).
--
-- Prerequisites: supabase-admin-auth-migration.sql (defines
-- can_access_queue()) and supabase-migration-v8.sql (work_orders.weight_kg).
-- This MUST run after both.
--
-- Why: visitors sometimes turn up at the desk with more items than they
-- entered at check-in, whether or not they reached the event's max_items. This
-- lets the volunteer account or an admin add items for them, one at a time
-- and as many as needed. max_items only limits the public check-in form; the
-- desk is not bound by it. Whether the event is open doesn't matter either:
-- is_open only governs public check-in.
--
-- The visitor must already have a work order (every check-in creates at least
-- one), because the new item takes their ticket-code base, e.g. M4K-3.
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
  -- item for the same visitor, so the code suffix below can't be taken twice.
  select a.event_id into v_event_id
    from public.attendees a
   where a.id = p_attendee_id
     for update;

  if not found then
    raise exception 'Visitor not found'
      using errcode = 'P0001';
  end if;

  -- Codes come in more than one shape: current check-ins make 'M4K-1', the
  -- first version made 'R-M4K-1', and older seed rows have a bare 'R-F3W'. So
  -- the item number is only a trailing '-<digits>', and the base is whatever
  -- comes before it, taken from the visitor's first item. The next number is
  -- past both the highest suffix and the item count, so a bare code's
  -- visitor still gets a number no other item of theirs has.
  select (select regexp_replace(w1.code, '-[0-9]+$', '')
            from public.work_orders w1
           where w1.attendee_id = p_attendee_id
           order by w1.priority nulls last, w1.created_at
           limit 1),
         greatest(coalesce(max((substring(w.code from '-([0-9]+)$'))::integer), 0),
                  count(*)::integer) + 1,
         coalesce(max(w.priority), 0) + 1
    into v_base_code, v_next_index, v_next_priority
    from public.work_orders w
   where w.attendee_id = p_attendee_id;

  if v_base_code is null then
    raise exception 'Visitor has no items to add to'
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
