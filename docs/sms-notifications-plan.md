# "Call the client over" — second QR + Twilio SMS

Branch: `twilio-integration`

## Context

Today, when a fixer is ready to start on an item, they take the paper ticket off the
board and **walk to the waiting area and yell the client's name**. This feature
replaces that: the fixer scans a QR on the ticket, which (a) records that the item is
now being worked on, and (b) **texts the client to come to the repair area** — using
the phone number the client gave at check-in. SMS via **Twilio**.

### Decisions
- **Timing:** text when the item comes *off the board to start work* (a summons —
  "please come over"), NOT when the repair is done.
- **Two QR codes** on the ticket: a **new left QR = "start / call client over"**, and
  the **existing right QR = "submit outcome"**.
- The start scan does a **combined "claim"**: fixer enters their name → work order
  moves to **"With Fixer"** (`assigned`) + fixer name saved → client is texted (if a
  phone exists).
- **Always print** the new QR (it also claims the ticket, so it's useful even with no
  phone). Only the *text* is gated on a phone number being present.
- Fixed template message body.
- Trigger is **public** (like the existing `/fix/:id` fixer page) — volunteers scan on
  their own phones, not logged in — so guardrails live server-side.

### Why this shape fits the codebase
- **The ticket already reserved the slot.** `src/components/PrintTickets.jsx` had an
  empty 88×88 dashed placeholder in the bottom-left, mirroring the real QR on the right.
- **It fills a dead status.** Statuses: Pending Print → Waiting for Fixer
  (`pending_assignment`) → **With Fixer (`assigned`)** → Completed. Nothing set
  `assigned` before this; the claim scan is that missing transition, and it captures the
  fixer name up front (previously only entered at outcome time).
- **PII stays server-side.** `attendees.phone` is never sent to the browser (RLS locks
  it to staff; the public `/fix` page gets only an abbreviated name via the
  `get_fixer_work_order` `SECURITY DEFINER` RPC). Twilio's Account SID / Auth Token must
  never be `VITE_`-prefixed, so the send runs in a **Supabase Edge Function** (the app's
  first server-side code).

## Implementation status — DONE (code written, `npm run build` passes)

- **`supabase-sms-notifications-migration.sql`** (new) — `sms_notifications` ledger
  (audit + once-only guard via a partial unique index on
  `(work_order_id, message_type) where status is distinct from 'failed'`), staff-only
  RLS (`select` for `authenticated`; writes only via the service role), and an optional
  `work_orders.assigned_at` column.
- **`supabase/functions/claim-and-notify/index.ts`** (new) — Deno Edge Function,
  `verify_jwt = false`. Input `{ work_order_id, fixer_name }`. Uses the service-role key
  to: reject `completed`/`canceled`; set `status='assigned'` + `fixer_name` +
  `assigned_at`; then best-effort SMS — gated on a valid US phone (E.164 `+1` + 10
  digits) and no prior non-failed `'summon'` row. Logs every attempt to
  `sms_notifications`. Returns `{ ok, status, texted, reason }`; never returns the phone.
- **`src/pages/ClaimWorkOrder.jsx`** (new) — `/claim/:id` page. Reuses
  `fetchWorkOrderById` (→ `get_fixer_work_order`). For `pending_assignment`: item
  details + fixer-name input + "Start work & call client over" → success screen keyed on
  the response (`texted` / `no_phone` / `already_sent` / `sms_not_configured` /
  send failure). Handles `pending` / `assigned` / `completed` / `canceled` too.
- **`src/lib/store.js`** — added `claimAndNotify(workOrderId, fixerName)` invoking the
  Edge Function.
- **`src/App.jsx`** — added `/claim/:id` route.
- **`src/components/PrintTickets.jsx`** — filled the reserved slot with the claim QR
  (`/claim/{id}`, label "Scan to start / call client"); always rendered.
- **`src/pages/FixerSubmit.jsx`** — outcome form now also shows for `assigned` items
  (fixer name pre-fills from the claim step).
- **`src/pages/CheckIn.jsx`** — consent line under the phone field: "We'll text you when
  a fixer is ready for your item…".

Note: pre-existing lint errors in `CheckIn.jsx` (unused `err`, setState-in-effect) are
unrelated to this work and were left alone.

## Remaining — MANUAL steps (need the Supabase project + a Twilio account)

The **claim/status half works without Twilio** — the Edge Function updates status
regardless and treats the SMS as best-effort. So the QR + "With Fixer" flow can ship
before Twilio/A2P is finished; texting turns on once the secrets are set.

### Twilio — Phase A (DEV / testing, free trial)
1. Create a **Twilio trial** account (free credit; no upgrade yet).
2. **Verify your own phone** in the Console ("Verified Caller IDs"). Trial accounts can
   text only verified numbers, with a "Sent from your Twilio trial account" prefix —
   fine for testing.
3. Note **Account SID**, **Auth Token**, and a trial **From** number.
4. Set them as **Supabase → Edge Functions → Secrets** on the **DEV** project:
   `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` (E.164, `+1…`).

### Twilio — Phase B (PRODUCTION, before texting real clients)
1. **Upgrade** off trial (add a payment method).
2. Keep/buy a sending number (~$1/mo local, or a **toll-free** number).
3. **US A2P 10DLC registration** — required by US carriers (AT&T/Verizon/T-Mobile), not
   Twilio: register a **Brand** + **Campaign** (e.g. "customer service / appointment
   notifications"). Low-volume nonprofit tier = one-time registration + small fee + small
   monthly carrier fee; approval usually within a few days. Until it clears, texts to
   real US numbers get filtered/blocked. (A **verified toll-free** number is a lighter
   alternative.)
4. Set the same three secrets on the **prod** Supabase project.

### Deploy steps
1. Run **`supabase-sms-notifications-migration.sql`** in the SQL Editor — **DEV first**,
   then prod after DEV passes.
2. Deploy the **`claim-and-notify`** Edge Function with **`verify_jwt = false`** (public
   endpoint). Deploy via the Supabase CLI/dashboard or the Supabase MCP tool.

## Verification
1. **DB:** migration ran; `sms_notifications` exists; RLS blocks anon reads.
2. **Twilio (trial):** with the three DEV secrets set, a manual `curl` to the deployed
   function texts your verified number.
3. **End to end (DEV):** check in a test visitor with your own phone → print the ticket,
   confirm **two** QR codes → scan the left QR (or open `/claim/{id}`) → enter a fixer
   name → "Start work & call client over" → confirm: (a) SMS arrives, (b) status → **With
   Fixer**, (c) `fixer_name` saved, (d) an `sms_notifications` row written, (e) a second
   scan does **not** send a second text.
4. **No-phone path:** visitor with no phone → claim still sets **With Fixer**; page says
   "no number on file, call them over"; no text sent.
5. **Outcome still works:** scan the right QR → outcome form (status `assigned`), fixer
   name pre-filled → submit → **Completed**.
6. Only after DEV passes: apply the migration + deploy to prod, switch to a paid/
   registered Twilio number.

## Open considerations (not blockers)
- **US-only** phone assumption (`+1`), consistent with the check-in `^\d{10}$` validation.
- Public trigger is fine for a repair cafe (unguessable UUID + once-only ledger). If
  cost/abuse ever matters, harden by requiring staff auth (`verify_jwt = true`).
