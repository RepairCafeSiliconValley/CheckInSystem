# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install        # install dependencies
npm run dev        # Vite dev server at http://localhost:5173
npm run build      # production build to dist/
npm run lint       # ESLint (flat config in eslint.config.js)
npm run db:reset   # rebuild the LOCAL database: migrations in order, seed, volunteer login
npm run test:db    # pgTAP tests in supabase/tests/ against the local stack
```

The automated tests cover the database only: `supabase/tests/*.test.sql` pin the RLS rules and public RPCs for each access level (acting as `anon` / `authenticated` via `set local role` and `request.jwt.claims`, inside a rolled-back transaction). Any RLS or RPC change must update them. UI changes are verified by running the app and clicking through the affected flow, plus `npm run lint`. `src/lib/metrics.js` is pure (no I/O, no React) and imports `./constants.js` with an explicit extension so it can be exercised directly under plain `node`.

## Environments — read before touching data

- `.env.local` (gitignored) holds `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Locally these must point at the **DEV** Supabase project or the local stack (see below), never PROD.
- Branching: branch off `dev` as `feature/...`, PR into `dev`. `dev` → `main` is a release PR done by maintainers. Merging to `main` deploys Production on Vercel with the PROD keys; everything else deploys Preview against DEV.
- `supabase-seed.sql` truncates the four event tables and reseeds mock data, then adds the default admins to `admin_allowlist` (the admin tables are not truncated; emails that are already admins are skipped). DEV and local only.

## Architecture

React 19 + Vite SPA, React Router v7, Supabase (Postgres + Auth + Realtime), hosted on Vercel (`vercel.json` rewrites all paths to `index.html`). Styling is **inline CSS only** — no Tailwind, no CSS modules, no stylesheets.

**Access levels:** admin, volunteer, client. Don't use "staff" for any of them. See `docs/admin-auth-plan.md` for the planned move of `/admin` to personal admin logins.

**Routes** (`src/App.jsx` is authoritative):
- `/` Landing, `/checkin?event=<id>` visitor check-in (client, via QR), `/fix/:id` fixer outcome page (client level — no login; id = work-order UUID from the ticket QR), `/queue` volunteer portal, `/admin` admin portal. Everything else redirects to `/`.
- `QueuePortal` (`/queue`) admits the volunteer account or an enabled admin (anyone else gets `PasswordGate`) and switches between Queue / Metrics tabs with local state; `?tab=metrics&event=<id>` seeds the initial tab and event. An admin session shows a banner with "Switch to volunteer account". Queue drills into `CoordinatorVisitorDetail`; printing goes through `PrintTickets` (thermal ticket layout).
- `AdminPortal` (`/admin`) admits only an enabled admin; everyone else gets `AdminLoginGate` (Continue with Google, plus a message for a volunteer / disabled / non-admin session or a rejected sign-in). Inside, it switches between Events (`Admin`; its "View metrics" links to `/queue?tab=metrics&event=<id>`), Allowlist (`AdminAllowlist`: invite or remove pending emails) and Users (`AdminUsers`: sortable list; rename inline, disable/enable, delete; never yourself) with local state.
- Both portals render inside `PortalShell` (header with who is signed in, a link to the other portal, Logout, an optional banner, bottom tab bar at zIndex 100). `getAccess()` in `store.js` decides the access level for both.

**Data layer:** all Supabase access goes through `src/lib/store.js`; pages don't call `supabase` directly. Rules enforced there:
- Every multi-row `.select()` must go through `fetchAllPages()`. Supabase silently truncates at 1000 rows with no error; this previously caused prod metrics to under-report. `makeQuery` must return a fresh builder each call, and paging always adds a primary-key tiebreak sort (`id`, or pass the key, e.g. `"email"` for `admin_allowlist`).
- Joins are done as two queries merged in JS — no PostgREST embedded selects anywhere.
- Multi-row public writes are atomic Postgres RPCs: `checkin_visitor` (attendee + work orders + waiver) and `submit_fixer_outcome`. The public fixer page reads via `get_fixer_work_order` (returns a pre-abbreviated client name). Queue and admin edits are direct table updates under the authenticated session.
- Metrics and work-order CSV export deliberately select no PII (no name/email/phone). Keep it that way. Don't select DEV-only columns like `assigned_at` — a column missing on PROD fails the whole query.
- Queue live-updates via `subscribeToEvent` (Realtime on `attendees` and `work_orders` filtered by event).

**Auth:** `/queue` uses one shared volunteer password: `signInVolunteer()` calls `signInWithPassword` against the fixed email `VOLUNTEER_ACCOUNT_EMAIL` (`volunteer@repaircafe.app`, in `constants.js`). `/admin` uses personal Google logins: `signInWithGoogle()` redirects back to `<origin>/admin`, and a rejected sign-in's error params are read in `supabase.js` before the client starts (`getAuthRedirectError()`). The Supabase client keeps one session per browser, so signing in or out on either portal affects both. PII protection relies on RLS because the anon key ships to every browser. Since `supabase-admin-auth-migration.sql`, being signed in grants nothing by itself: PII tables need `can_access_queue()` (= `is_admin()` or `is_volunteer()`), and `admin_allowlist` / `app_users` need `is_admin()` (an `app_users` row that isn't `disabled`; anyone can read their own row). Since `supabase-admin-auth-lockdown.sql`, only admins can create or update events. The `is_volunteer()` email in SQL must match `VOLUNTEER_ACCOUNT_EMAIL`. Admin sign-ups are gated by the Before User Created hook `public.hook_before_user_created` (allowlist only; enabled in `supabase/config.toml` locally and in the dashboard per environment); the service-role admin API skips it, but the `auth.users` insert trigger only makes allowlisted emails admins.

**Metrics:** `fetchMetricsRows()` loads raw rows once; `src/lib/metrics.js` does all aggregation for the Queue, Admin and Metrics tabs so the numbers can't drift. Breakdowns list every canonical value (even at zero) and append unrecognised values rather than dropping them.

## Domain model

Tables: `events` (per-event settings `max_items`, `collect_email`, `collect_phone`, `collect_weight`, `is_open`), `attendees`, `work_orders`, `waiver_acceptances`, plus the admin tables `admin_allowlist` (pending invites, lower-case `email` key) and `app_users` (one row per admin, id = `auth.users.id`; only `name` is directly editable, `disabled` and deletion go through the `set_user_disabled` / `delete_app_user` RPCs).

`src/lib/constants.js` is the single source of truth for categories, statuses, outcomes, cancel reasons and not-fixed reasons. Values are validated in JS only (no DB CHECK constraints). The status/outcome model (see `docs/status-outcome-overhaul.md`):
- `status` says whether an item finished; `outcome` says how. Pipeline: `pending` (not printed) → `pending_assignment` (printed) → `assigned` (written only by an external claim Edge Function) → `completed` | `canceled`.
- Recording any outcome sets `status='completed'`. "Not Fixed" also sets `not_fixed_reason`.
- Canceling sets `status='canceled'` with `outcome` left NULL and the reason in `cancel_reason`. Undo returns to `pending` if never printed, else `pending_assignment`.
- Status `key` is stored in the DB; `label` is display-only and can be renamed without a migration.

**Waiver:** if you change `WAIVER_SECTIONS` text you must bump `WAIVER_VERSION`. The version, full text and a SHA-256 hash are stored per acceptance as an audit trail.

## Database migrations

Schema changes are hand-written `supabase-*.sql` files at the repo root, run manually in the Supabase SQL Editor (DEV first). Each file's header lists its prerequisites, but some headers are wrong. The order that actually applies (by function dependencies) is the `MIGRATIONS` list in `scripts/db-reset.mjs`; that list is the source of truth, so add new files there. Add a new file for new changes rather than editing an applied one. Changing an RPC's arguments or `RETURNS TABLE` requires dropping the old function first.

`supabase-migration.sql` has since been edited to include later columns (`first_name`/`last_name`, `newsletter_opt_in`), so replaying the chain on a fresh database gives harmless "already exists" errors in v4 and the newsletter migration. It also leaves v2's stale `checkin_visitor(uuid, text, text, jsonb, text, text, text, text, text)` overload (it references the dropped `name` column); drop it by hand.

## Local Supabase stack

`supabase/config.toml` runs a local stack as `project_id = "checkinsystem"` with every port shifted +10 (API `54331`, DB `54332`, Studio `54333`, Mailpit `54334`) so it can run alongside another project's stack on the default ports. `supabase start` / `supabase stop` from the repo root. The `supabase/migrations/` folder is not used. `npm run db:reset` rebuilds the local database (wiping it, including Auth users): it applies the root `supabase-*.sql` files in order, drops v2's stale overload, runs `supabase-seed.sql`, and recreates the volunteer login with the password from a `LOCAL_VOLUNTEER_PASSWORD=` comment in `.env.local`. Replaying the chain prints known-harmless errors (v4's backfill reads an `attendees.name` column the edited base migration no longer creates; some "already exists"); the script filters those and reports anything else.

## Legacy files

`repair-cafe-checkin-v5.jsx` (in-memory prototype) and `repair-cafe-implementation-brief-v4.md` are the original spec the app was built from. They are not imported by the app and are out of date relative to `src/`.
