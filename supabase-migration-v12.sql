-- ============================================
-- Migration v12: put a claimed item back on the board
-- ============================================
-- Run in the Supabase SQL Editor (DEV project first, then prod).
--
-- Prerequisites: supabase-sms-notifications-migration.sql (sms_notifications,
-- work_orders.assigned_at) and supabase-admin-auth-migration.sql (defines
-- can_access_queue()). This MUST run after both.
--
-- Why: a fixer scans the claim QR, the item goes to 'assigned' (With Fixer) and
-- the client is texted to come over. When the client never shows up there was
-- no way back — the front desk could only record an outcome or cancel. This
-- adds unclaim_work_order(), which returns the item to 'pending_assignment'
-- (Checked-In) and clears the fixer, so the next fixer can claim it.
--
-- The texting half: the once-only guard was keyed on (work_order_id,
-- message_type), so a client who had already been summoned could never be
-- summoned again for the same item. It now ignores superseded rows, and
-- unclaiming supersedes the prior summons. Nothing is deleted — the ledger
-- keeps every send, and superseded_at records when it stopped counting.
--
-- Safe to re-run.
-- ============================================


-- ─── 1. Mark a summons as no longer the active one ───

alter table public.sms_notifications
  add column if not exists superseded_at timestamptz;


-- ─── 2. Re-point the once-only guard at *active* sends ───
-- Failed attempts never blocked a retry; now neither do superseded ones. The
-- Edge Function applies the same filter before calling Twilio, and this index
-- is the backstop.

drop index if exists sms_notifications_sent_once;
create unique index sms_notifications_sent_once
  on public.sms_notifications (work_order_id, message_type)
  where status is distinct from 'failed' and superseded_at is null;


-- ─── 3. The unclaim itself ───
-- SECURITY DEFINER because the two halves need different privileges: a
-- volunteer may update work_orders under RLS, but sms_notifications is
-- service-role-write-only. Doing both here keeps them in one transaction and
-- behind one privilege check, same shape as submit_fixer_outcome().
--
-- search_path stays pinned, and does not need 'extensions': the body calls no
-- pgcrypto or uuid functions.

create or replace function public.unclaim_work_order(p_work_order_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not public.can_access_queue() then
    raise exception 'Only volunteers and admins can unclaim items'
      using errcode = '42501';
  end if;

  -- The status guard is in the WHERE clause on purpose: it makes the check and
  -- the write one atomic step, so two coordinators tapping at once can't both
  -- succeed.
  update public.work_orders
     set status = 'pending_assignment',
         fixer_name = null,
         assigned_at = null
   where id = p_work_order_id
     and status = 'assigned';

  if not found then
    raise exception 'Work order is not with a fixer'
      using errcode = 'P0001';
  end if;

  -- Frees the unique slot above so the next claim can text the client again.
  update public.sms_notifications
     set superseded_at = now()
   where work_order_id = p_work_order_id
     and message_type = 'summon'
     and superseded_at is null;
end;
$function$;

-- A newly created function grants EXECUTE to PUBLIC by default; the queue is
-- signed-in only, and the function does its own can_access_queue() check.
revoke execute on function public.unclaim_work_order(uuid) from public, anon;
grant execute on function public.unclaim_work_order(uuid) to authenticated;
