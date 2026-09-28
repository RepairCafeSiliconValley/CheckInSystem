# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install        # install dependencies
npm run dev        # Vite dev server at http://localhost:5173
npm run build      # production build to dist/
npm run lint       # ESLint (flat config in eslint.config.js)
```

There is no automated test suite. Verify changes by running the app and clicking through the affected flow, plus `npm run lint`. `src/lib/metrics.js` is pure (no I/O, no React) and imports `./constants.js` with an explicit extension so it can be exercised directly under plain `node`.

## Environments — read before touching data

- `.env.local` (gitignored) holds `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Locally these must point at the **DEV** Supabase project or the local stack (see below), never PROD.
- Branching: branch off `dev` as `feature/...`, PR into `dev`. `dev` → `main` is a release PR done by maintainers. Merging to `main` deploys Production on Vercel with the PROD keys; everything else deploys Preview against DEV.
- `supabase-seed.sql` truncates all app tables and reseeds mock data. DEV only.

## Architecture

React 19 + Vite SPA, React Router v7, Supabase (Postgres + Auth + Realtime), hosted on Vercel (`vercel.json` rewrites all paths to `index.html`). Styling is **inline CSS only** — no Tailwind, no CSS modules, no stylesheets.

**Routes** (`src/App.jsx` is authoritative — the README's `/staff` route is stale):
- `/` Landing, `/checkin?event=<id>` visitor check-in (public, via QR), `/fix/:id` fixer outcome page (public, id = work-order UUID from the ticket QR), `/admin` staff portal. Everything else redirects to `/`.
- `StaffPortal` wraps `PasswordGate` and switches between Queue / Metrics / Admin tabs with local state (not routes). Queue drills into `CoordinatorVisitorDetail`; printing goes through `PrintTickets` (thermal ticket layout).

**Data layer:** all Supabase access goes through `src/lib/store.js`; pages don't call `supabase` directly. Rules enforced there:
- Every multi-row `.select()` must go through `fetchAllPages()`. Supabase silently truncates at 1000 rows with no error; this previously caused prod metrics to under-report. `makeQuery` must return a fresh builder each call, and paging always adds an `id` tiebreak sort.
- Joins are done as two queries merged in JS — no PostgREST embedded selects anywhere.
- Multi-row public writes are atomic Postgres RPCs: `checkin_visitor` (attendee + work orders + waiver) and `submit_fixer_outcome`. The public fixer page reads via `get_fixer_work_order` (returns a pre-abbreviated client name). Staff edits are direct table updates under the authenticated session.
- Metrics and work-order CSV export deliberately select no PII (no name/email/phone). Keep it that way. Don't select DEV-only columns like `assigned_at` — a column missing on PROD fails the whole query.
- Queue live-updates via `subscribeToEvent` (Realtime on `attendees` and `work_orders` filtered by event).

**Auth:** no user accounts. Staff sign in with one shared password via `signInWithPassword` against the fixed email `admin@repaircafe.app`. PII protection relies on RLS policies (`supabase-rls-migration.sql`, `supabase-pii-rls-fix.sql`) because the anon key ships to every browser.

**Metrics:** `fetchMetricsRows()` loads raw rows once; `src/lib/metrics.js` does all aggregation for the Queue, Admin and Metrics tabs so the numbers can't drift. Breakdowns list every canonical value (even at zero) and append unrecognised values rather than dropping them.

## Domain model

Tables: `events` (per-event settings `max_items`, `collect_email`, `collect_phone`, `collect_weight`, `is_open`), `attendees`, `work_orders`, `waiver_acceptances`.

`src/lib/constants.js` is the single source of truth for categories, statuses, outcomes, cancel reasons and not-fixed reasons. Values are validated in JS only (no DB CHECK constraints). The status/outcome model (see `docs/status-outcome-overhaul.md`):
- `status` says whether an item finished; `outcome` says how. Pipeline: `pending` (not printed) → `pending_assignment` (printed) → `assigned` (written only by an external claim Edge Function) → `completed` | `canceled`.
- Recording any outcome sets `status='completed'`. "Not Fixed" also sets `not_fixed_reason`.
- Canceling sets `status='canceled'` with `outcome` left NULL and the reason in `cancel_reason`. Undo returns to `pending` if never printed, else `pending_assignment`.
- Status `key` is stored in the DB; `label` is display-only and can be renamed without a migration.

**Waiver:** if you change `WAIVER_SECTIONS` text you must bump `WAIVER_VERSION`. The version, full text and a SHA-256 hash are stored per acceptance as an audit trail.

## Database migrations

Schema changes are hand-written `supabase-*.sql` files at the repo root, run manually in the Supabase SQL Editor (DEV first). Each file's header lists its prerequisites, but some headers are wrong. The order that actually applies (by function dependencies): `supabase-migration.sql` → `supabase-rls-migration.sql` → `v2` → `v3` → `v4` → `v5` → `supabase-pii-rls-fix.sql` (alters v4's 10-arg `checkin_visitor`) → `supabase-newsletter-opt-in-migration.sql` (v6 drops its 11-arg overload) → `v6` → `supabase-status-overhaul.sql` (V7) → `v8` → `supabase-metrics-migration.sql`. Add a new file for new changes rather than editing an applied one. Changing an RPC's arguments or `RETURNS TABLE` requires dropping the old function first.

`supabase-migration.sql` has since been edited to include later columns (`first_name`/`last_name`, `newsletter_opt_in`), so replaying the chain on a fresh database gives harmless "already exists" errors in v4 and the newsletter migration. It also leaves v2's stale `checkin_visitor(uuid, text, text, jsonb, text, text, text, text, text)` overload (it references the dropped `name` column); drop it by hand.

## Local Supabase stack

`supabase/config.toml` runs a local stack as `project_id = "checkinsystem"` with every port shifted +10 (API `54331`, DB `54332`, Studio `54333`, Mailpit `54334`) so it can run alongside another project's stack on the default ports. `supabase start` / `supabase stop` from the repo root. The `supabase/migrations/` folder is not used; apply the root `supabase-*.sql` files in the order above, e.g. `docker exec -i supabase_db_checkinsystem psql -U postgres -d postgres < supabase-migration.sql`, then `supabase-seed.sql`. The staff user `admin@repaircafe.app` must be created in local Auth (the admin API with the service role key); its local password is kept as a comment in `.env.local`.

## Legacy files

`repair-cafe-checkin-v5.jsx` (in-memory prototype) and `repair-cafe-implementation-brief-v4.md` are the original spec the app was built from. They are not imported by the app and are out of date relative to `src/`.
