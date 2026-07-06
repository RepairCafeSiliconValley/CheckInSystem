# Admin / Queue split — least-privilege PII access

> Working doc for the `split-admin-queue-view` branch. Captures the plan and
> current status so this can be picked up again later.

## Context

Everything staff-facing used to live at **`/admin`** behind a single shared Supabase
Auth account (`admin@repaircafe.app`), with a **Queue** tab and an **Admin** tab. The
queue view exposed attendee PII — full name, email, phone, ZIP — and let anyone edit it.
At a real Repair Café the front desk laptop is often left logged in, so a walk-up person
could browse every attendee's contact info.

**Goal:** follow least privilege by splitting into two routes with two passwords:

- **`/admin`** — unchanged functionality (queue + admin tab, full PII), gated by a
  **stronger** admin password shared with a few trusted people.
- **`/queue`** — front-desk volunteers, **simpler** password. Stripped queue that shows
  only **first name + last initial**, never email/phone/ZIP, and no Admin tab. Volunteers
  can still fully **manage work orders** (category/priority, outcomes, fixer, print) — just
  not attendee contact data.

Two distinct passwords ⇒ two Supabase Auth accounts (`admin@…`, `queue@…`). PII is blocked
**at the database** (RLS + PII-free RPCs), so contact data never reaches the front-desk
laptop — not even via devtools/network. This reuses the pattern in
`supabase-pii-rls-fix.sql`, where `get_fixer_work_order` abbreviates the surname in SQL.

Accounts are distinguished by their email claim (`auth.jwt() ->> 'email'`):
`admin@repaircafe.app` = full PII + admin actions; `queue@repaircafe.app` = PII-free RPCs only.

## Status

### ✅ Done (code, on this branch)

- **`supabase-queue-role-migration.sql`** — the migration, split into Part A (additive RPCs)
  and Part B (restrictive RLS). *File is written; not yet run against the DB — see below.*
- **`src/lib/store.js`** — `ADMIN_EMAIL` / `QUEUE_EMAIL` constants; `signIn(password, email)`;
  PII-free fetchers `fetchQueueGroups` / `fetchQueueVisitorDetail` (call the RPCs).
- **`src/hooks/usePortalAuth.js`** (new) — shared session/gate/logout, **email-scoped** so a
  queue session can't unlock `/admin` and vice-versa (one place for that fix).
- **`src/components/PasswordGate.jsx`** — `signIn` / `title` / `subtitle` props; one gate
  serves both portals. `/admin` shows "Admin Access", `/queue` shows "Front Desk Access".
- **`src/pages/QueuePortal.jsx`** (new) — front-desk portal: queue only, signs in as
  `queue@…`, renders the queue components with `hidePII`.
- **`src/pages/StaffPortal.jsx`** — refactored onto `usePortalAuth({ email: ADMIN_EMAIL })`;
  behavior otherwise unchanged.
- **`src/pages/CoordinatorQueue.jsx`** & **`CoordinatorVisitorDetail.jsx`** — single `hidePII`
  prop. Same components serve both routes; `/admin` full PII, `/queue` first name + last
  initial with no email/phone/ZIP and no attendee edits. All work-order logic stays shared.
- **`src/App.jsx`** — new `/queue` route.

Verified: production build compiles; lint adds no new errors (pre-existing `react-hooks/refs`
errors in `CoordinatorVisitorDetail` are unrelated); dev server boots, `/` and `/queue` serve 200.

### ⏳ Remaining (manual — done by a human, not in code)

1. **Supabase Dashboard → Authentication → Users:**
   - Create `queue@repaircafe.app` with the simpler front-desk password. *(Required to log in
     to `/queue`.)*
   - Reset `admin@repaircafe.app` to the new stronger admin password. *(Do this LAST — it
     affects production login the moment you do it.)*
2. **Supabase SQL Editor — run the migration in two stages** (see run order below).
3. **End-to-end testing** (see Verification).

## ⚠️ Branch vs. main safety (shared database)

There is **one Supabase project** — `dev` and deployed `main` point at the same
`VITE_SUPABASE_URL`. **Any SQL migration takes effect for `main` the instant it runs; there
is no per-branch DB.** Frontend code is isolated per branch (main has none of the `/queue`
code until merge), so only the migration can affect production.

- **Additive (cannot affect `main`):** creating the `queue@` user, and **Part A** (the two
  RPCs). `main`'s code never calls them.
- **Behavior-changing (live on `main` immediately):** **Part B** (RLS policy replacements) and
  the admin-password reset. `main` authenticates as `admin@repaircafe.app`, and Part B grants
  that account full access — so `main` keeps working *provided the email strings match exactly*.
  The only failure mode is a typo in the check, which would lock out admin too — hence Part B
  runs last and is verified immediately.

## Run order (and the minimum to test)

1. **Dashboard:** create the `queue@repaircafe.app` user. *(admin password reset deferred.)*
2. **DB — run only Part A** of `supabase-queue-role-migration.sql` (the RPCs). Additive.
3. **Frontend** is already implemented on this branch. `npm run dev`.
   - **✅ Minimum to test the queue frontend = queue user + Part A.** At this point `/queue`
     logs in, loads the stripped queue via the RPCs, hides PII, and manages/prints work orders;
     `/admin` still works with its current password.
   - *(If `/queue` shows an empty list, check the browser console for a missing
     `get_queue_attendees` function → Part A hasn't been run yet.)*
4. **DB — run Part B** once the frontend is verified — this is what enforces least privilege by
   blocking the queue account from PII at the API layer.
5. **Dashboard:** finally, reset the admin password to the new strong one.

## Verification

1. **Queue frontend (after Part A)** — `/queue` + queue password: first name + last initial
   only, no email/phone/ZIP anywhere; can assign categories/outcomes and print; no Admin tab.
   `/admin` still fully works. Cross-check: logged into `/queue`, navigating to `/admin` shows
   the gate (queue session doesn't unlock admin), and vice-versa.
2. **DB enforcement (after Part B)** — signed in as the queue account, `select * from attendees`
   returns 0 rows / permission blocked, while `get_queue_attendees(<event>)` returns abbreviated
   names. In the `/queue` Network tab, no response body contains email/phone/ZIP.
3. **Admin regression (after Part B)** — `/admin` + admin password: full queue with PII, Admin
   tab, event create/toggle, and CSV export all still work.

## Future expansion

The queue route leaves room for a **Metrics** tab later. When a second queue tab actually
exists, extract a shared `PortalShell` (header + bottom tab nav) for both portals — deferred
until then to avoid premature abstraction.
