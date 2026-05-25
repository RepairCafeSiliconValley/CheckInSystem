# Split Admin vs. Coordinator into two accounts & views

> **Status:** Planned — not yet implemented. Saved for later pickup.

## Context

Today the whole staff app lives behind **one shared Supabase Auth account** (`admin@repaircafe.app`) at `src/pages/StaffPortal.jsx`, which exposes both the Queue tab (`src/pages/CoordinatorQueue.jsx`) and the Admin tab (`src/pages/Admin.jsx`). Two security problems follow:

1. **Anyone running an event can also administer all events** — there is no separation between per-event coordinators and overall administration.
2. **All attendee/work-order PII is publicly readable.** RLS policies are `using (true)` for SELECT on `attendees` and `work_orders` (`supabase-rls-migration.sql:36-38,60-62`), so anyone with the anon key can dump every visitor's name/email/phone/zip. The `is_open` flag is only a UI gate — it locks nothing at the database.

This change separates the two roles into distinct routes/accounts and makes coordinator access **DB-enforced**: a per-event login that only works while the admin has the event open, and that is revoked the instant the admin closes it. It also closes the PII-public hole.

**Scope (confirmed): structural split only.** Net-new features named in the request — SMS/texting clients, weight recording, partial closures, forcing broad outcomes, detailed-metrics & raw-item exports — are **deferred to their own issues**. EventMgmt is built with the structure ready and clearly-marked placeholders for them.

## Two roles, two flags

| | Route | Auth | Controls |
|---|---|---|---|
| **Admin** | `/admin` | existing `admin@repaircafe.app` (strong password) | event creation incl. event password & max items; **open/close database access** per event (closing auto-logs-out coordinators); raw attendee/item export |
| **Coordinator** | `/coordinator` | **per-event** Supabase Auth user; valid only while event access is open | Queue (event picker removed) + **EventMgmt** (registration open/close, max items, live metrics, export) |

Two distinct flags on `events` (currently conflated into one `is_open`):
- **`coordinator_access`** (NEW, admin-controlled) — master switch. Gates coordinator login + all coordinator DB access via RLS. Default `false`.
- **`is_open`** (existing, now coordinator-controlled) — the **visitor check-in / registration** gate read by `src/pages/CheckIn.jsx`. Unchanged semantics.

## Auth model (DB-enforced)

- **Admin** keeps the existing account. A SQL helper `is_admin()` = `auth.jwt()->>'email' = 'admin@repaircafe.app'` grants full access in RLS.
- **Coordinator** = one Supabase Auth user **per event**, email derived deterministically as `coordinator-<eventId>@repaircafe.app`, password = the simple per-event password. The user id is stored on `events.coordinator_user_id`.
  - Created/updated/deleted by an **Edge Function** (`manage-coordinator`) using the `service_role` key (cannot be done with the anon key from the browser). The function verifies the caller's JWT is the admin before acting.
  - Login at `/coordinator`: client lists events where `coordinator_access = true` (events stay publicly readable — they hold no secrets now), the coordinator picks the event + types the password, client constructs the email and calls `signInWithPassword`.
  - **Auto-logout on close:** coordinator RLS requires `coordinator_access = true`, so closing the event immediately makes every coordinator query return nothing / error. The portal also subscribes to its `events` row (realtime) and calls `signOut()` + shows "Event closed" when `coordinator_access` flips to false.

## Database changes — new `supabase-migration-v6.sql`

1. **Schema:** `alter table events add column coordinator_user_id uuid references auth.users(id)`, `add column coordinator_access boolean not null default false`.
2. **Helpers** (both `security definer`, `set search_path = public`):
   - `is_admin() returns boolean`
   - `coordinator_can_access(p_event_id uuid) returns boolean` — true if `exists(events where id=p_event_id and coordinator_user_id = auth.uid() and coordinator_access)`.
3. **Rewrite RLS** (drop the old `"Anyone can read…"` / `auth.role()='authenticated'` policies, which would otherwise grant coordinators everything):
   - `events`: SELECT public (`true`); INSERT/UPDATE/DELETE → `is_admin()`. (Coordinator event edits go through RPCs below, so coordinators need no direct write.)
   - `attendees` & `work_orders`: SELECT and UPDATE → `is_admin() OR coordinator_can_access(event_id)`; INSERT stays `false` (RPC-only); DELETE `false`.
   - `waiver_acceptances`: SELECT → `is_admin()` (was public); INSERT remains for the check-in RPC path.
4. **New SECURITY DEFINER RPCs:**
   - `get_work_order_for_fixer(p_id uuid)` — returns only fixer-needed fields (code, item_name, category, description, status, outcome, attendee first_name). Replaces the public table read in `fetchWorkOrderById` (`src/lib/store.js:134-141`) now that `work_orders`/`attendees` are no longer publicly readable.
   - `set_registration_open(p_event_id, p_open)` and `set_event_max_items(p_event_id, p_max)` — coordinator-callable; each checks `coordinator_can_access(p_event_id)`.
   - `checkin_visitor` and `submit_fixer_outcome` are already `security definer` → keep working untouched.
5. **Realtime:** `alter publication supabase_realtime add table events;` (for auto-logout detection). `attendees`/`work_orders` already published; realtime honors RLS for the authenticated coordinator.

## Edge Function — `supabase/functions/manage-coordinator/index.ts` (NEW)

First edge function in the repo. Uses `SUPABASE_SERVICE_ROLE_KEY` (set via `supabase secrets set`). Verifies caller is admin (via their JWT), then on action:
- `create` → `auth.admin.createUser({ email: coordinator-<id>@…, password, email_confirm: true })`, write `events.coordinator_user_id`.
- `set-password` → `auth.admin.updateUserById(...)`.
- `delete` → `auth.admin.deleteUser(...)`.

## Frontend changes

**Routing — `src/App.jsx`:**
- Add `/admin` → `AdminPortal`, `/coordinator` → `CoordinatorPortal`.
- `/staff` → `<Navigate to="/coordinator">` (back-compat); default `*` → `/coordinator`.

**Generalize `src/components/PasswordGate.jsx`:** accept `title`, `subtitle`, and an async `onSubmit(pw) => boolean` instead of hard-calling `signIn`. Reused by both portals.

**`src/lib/store.js`:**
- Rename `signIn` → `signInAdmin`; add `signInCoordinator(eventId, password)`.
- Add `fetchActiveEventsForCoordinator()` (events where `coordinator_access=true`) for the login picker.
- Add admin helpers calling the edge function: `createEventWithCoordinator(...)`, `setCoordinatorPassword(eventId, pw)`; add `setCoordinatorAccess(eventId, open)` (direct admin update of `coordinator_access`).
- Point `fetchWorkOrderById` at the new `get_work_order_for_fixer` RPC.
- Coordinator versions of `toggleEventOpen`/`updateEventMaxItems` call the new RPCs.

**`AdminPortal.jsx` (NEW):** session-check + admin `PasswordGate` → renders the Admin page in a logout shell (trimmed copy of `src/pages/StaffPortal.jsx`).

**`src/pages/Admin.jsx` (MODIFY):**
- Creation form gains an **Event Password** field → `createEventWithCoordinator`.
- The per-event toggle now controls **`coordinator_access`** ("Open/Close Event Access") — closing revokes coordinators server-side.
- Add a "reset event password" action (`setCoordinatorPassword`).
- Keep raw attendee export. Move the live max-items editor and registration (`is_open`) toggle **out** to EventMgmt. (Detailed-metrics & item exports deferred.)

**`CoordinatorPortal.jsx` (NEW):** event-picker + coordinator `PasswordGate` → `signInCoordinator`. Locks `selectedEventId` to the logged-in event (from session email). Shell with two tabs: **Queue** + **EventMgmt**. Subscribes to its `events` row → `signOut()` + "Event closed" when `coordinator_access` goes false.

**`src/pages/CoordinatorQueue.jsx` (MODIFY):** remove the event-selection dropdown (~lines 105-135); show the event **name** only. Receives a fixed `eventId`.

**`EventMgmt.jsx` (NEW):** for the locked event — registration open/close (`set_registration_open`), change max items (`set_event_max_items`), live metrics (`fetchEventStats`, `src/lib/store.js:174-193`), attendee export. Clearly-marked placeholder sections for the deferred features (partial closures, forcing broad outcomes, detailed-metrics export).

**Cleanup:** remove `StaffPortal.jsx` once the two portals exist (or leave only as the redirect target).

## Deferred to separate issues (not built here)
SMS/texting clients · weight recording · partial closures · forcing broad outcomes · detailed-metrics export · raw work-order/item export.

## Verification

1. **Apply DB changes on an isolated Supabase branch** (MCP `create_branch` → `apply_migration` with v6), or locally via `supabase db reset` + the new migration; deploy the edge function (`supabase functions deploy manage-coordinator`) and set the service-role secret.
2. **Admin flow:** at `/admin`, log in with the strong password; create an event with an event password; confirm a `coordinator-<id>@…` auth user exists and `events.coordinator_user_id` is set.
3. **Coordinator flow:** at `/coordinator`, pick the event + enter the event password; confirm Queue (no picker, name shown) and EventMgmt load; toggle registration and max items and verify they persist.
4. **Auto-logout / revocation:** with a coordinator logged in, have admin close event access → coordinator is logged out and queries are denied (verify in network tab).
5. **PII lock-down:** with the anon key only (no session), confirm `supabase.from('attendees').select('*')` returns **zero rows / error**, and that `/checkin` and `/fix/:id` still work (the latter via the new RPC).
6. `npm run dev` and click through all four routes end-to-end.

## Critical files
- `src/App.jsx` · `src/lib/store.js` · `src/components/PasswordGate.jsx`
- `src/pages/Admin.jsx` · `src/pages/CoordinatorQueue.jsx` · `src/pages/StaffPortal.jsx` · `src/pages/CheckIn.jsx` · `src/pages/FixerSubmit.jsx`
- `supabase-rls-migration.sql` · `supabase-migration-v5.sql` · new `supabase-migration-v6.sql` · new `supabase/functions/manage-coordinator/index.ts`
- NEW: `src/pages/AdminPortal.jsx` · `src/pages/CoordinatorPortal.jsx` · `src/pages/EventMgmt.jsx`
