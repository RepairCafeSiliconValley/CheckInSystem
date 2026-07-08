# Work-order Status ↔ Outcome overhaul (Cancel + Not-Fixed reasons)

## Why

Previously a work order had a free-text `status` (`pending` → `pending_assignment` →
`completed`) and a free-text `outcome`. **Every** outcome — including `Languished` and
`Abandoned` — was written as `status='completed'`, which conflated "made it through the
repair process" with "walked away before a fixer saw it" and polluted completion stats.

## The model

Each column now answers exactly one question — `status` = did it finish or get canceled;
`outcome` = what was the repair result, if it got one.

| Situation | `status` | `outcome` | `cancel_reason` | `not_fixed_reason` |
|-----------|----------|-----------|-----------------|--------------------|
| In flight (pre-print) | `pending` | NULL | NULL | NULL |
| Printed, awaiting fixer | `pending_assignment` | NULL | NULL | NULL |
| Repaired / seen by fixer | `completed` | Fixed / Diagnosed / Taken Home | NULL | NULL |
| Seen but not repairable | `completed` | Not Fixed | NULL | *(the reason)* |
| Left before it was worked | `canceled` | **NULL** | *(the reason)* | NULL |

Key rules:
- **Recording any outcome → `status='completed'`.**
- **Canceling → `status='canceled'`, `outcome` stays NULL** (status already says "canceled" —
  no redundant `'Canceled'` outcome value). The specific reason lives in `cancel_reason`.
- **Not Fixed** is a normal completed outcome that additionally carries `not_fixed_reason`.
- Cancel can happen **at any point before an outcome is recorded** — including while the item is
  still `pending` (before its ticket is printed). Undoing a cancel sends it back to `pending` if it
  was never printed, otherwise to `pending_assignment`.

### Value lists (single source of truth: `src/lib/constants.js`)

```js
OUTCOMES        = ["Fixed", "Diagnosed", "Not Fixed", "Taken Home"]   // all → completed
CANCEL_REASONS  = ["Disallowed Item", "Registration Closed", "Mistake",
                   "Never Checked In", "No Show", "Languished"]
NOT_FIXED_REASONS = ["Spare parts not available", "Spare parts too expensive",
                     "No way to open product", "Repair information not available",
                     "Lack of equipment", "Item too worn out"]
```
Values are validated in JS only (no DB CHECK constraints). To add/rename an option, edit these
lists — and the outcome counters in `fetchEventStats` if it affects the stats breakdown.

## Database — `supabase-status-overhaul.sql`

Hand-run in the Supabase SQL Editor (cumulative, per existing convention). The four steps are
independent and can be run in stages:

1. **Add columns** (`cancel_reason`, `not_fixed_reason`) — run first. Nullable, so it's
   backward-compatible and safe before the frontend ships. **Enough to build/test the whole
   coordinator side** (cancel + Not-Fixed write via a direct table UPDATE, not an RPC).
2. **Backfill** legacy rows: `Languished` → itself, `Abandoned` → `No Show`, both moved to
   `status='canceled'`, `outcome=NULL`. Touches only old rows — run whenever.
3. **Replace `submit_fixer_outcome`** — adds `p_not_fixed_reason`. Needed before testing the public
   `/fix/` Not-Fixed submission (the frontend calls the RPC with the new argument). Drops the old
   3-arg signature first (signature change).
4. **Replace `get_fixer_work_order`** — returns `not_fixed_reason` so the "Already Completed" fixer
   screen can show why. Cosmetic; cancel screen needs no reason (uses only `status`). Drops the old
   function first — adding a column to `RETURNS TABLE` changes the return type, so `CREATE OR REPLACE`
   alone errors (`42P13: cannot change return type of existing function`).

## Code changes

- **`src/lib/constants.js`** — new `CANCEL_REASONS` / `NOT_FIXED_REASONS`; removed
  `STAFF_ONLY_OUTCOMES` / `ALL_OUTCOMES`.
- **`src/components/StatusBadge.jsx`** — added the grey `canceled` → "Canceled" badge.
- **`src/lib/store.js`** — `submitFixerOutcome(id, name, outcome, notFixedReason)` passes
  `p_not_fixed_reason`; `fetchEventStats` reports `canceledCount` (by `status`) instead of
  languished/abandoned.
- **`src/pages/CoordinatorVisitorDetail.jsx`** — "✕ Cancel item" control in both the `pending` and
  `pending_assignment` states → `CANCEL_REASONS` picker → `cancelOrder`; the "Not Fixed" outcome
  opens a `NOT_FIXED_REASONS` picker; completed *and* canceled render in the terminal block; "Undo
  Cancel" / "Edit Outcome" revert. Canceled items no longer block "Approve & Print".
- **`src/pages/FixerSubmit.jsx`** — Not-Fixed reason picker (required before submit); a new
  "Item Canceled" screen; not-fixed reason shown on the "Already Completed" screen.
- **`src/pages/CoordinatorQueue.jsx`** — a "Canceled" filter tab/count; renamed the "Done" tab to
  "Completed"; simplified the outcome-pill color check.
- **`src/pages/Admin.jsx`** — stats breakdown shows a "canceled" total.
- **No change:** `PrintTickets.jsx`, `StaffPortal.jsx`, attendee CSV export.

## Deployment ordering

DEV and prod are **separate Supabase projects**, so run the full migration on DEV first, validate
with the SQL below, exercise the app, then repeat on prod.

Within a project, the four steps split into additive vs. restrictive relative to the frontend that
is *currently deployed against that project*:

- **Additive / safe to run before the new frontend ships** (invisible to the old code):
  - **Step 1 (ADD COLUMN)** — old code does `select("*")` and just ignores the new columns.
  - **Step 3 (`submit_fixer_outcome`)** — the new 4th arg has a default, so the old 3-arg RPC call
    still resolves.
  - **Step 4 (`get_fixer_work_order`)** — returns one extra column, which old code ignores.
- **Restrictive / run once the new frontend is deployed:**
  - **Step 2 (backfill)** — converts historical Languished/Abandoned rows to `status='canceled'`.
    The *old* frontend has no `canceled` case (StatusBadge falls back to "Pending Print"; the
    queue/detail views have no canceled branch), so those rows render wrong until the new code ships.
  On **prod**, run step 2 only after the new frontend is live there. On **DEV** you can run all four
  back-to-back since you're testing the new frontend anyway.

**Does old data break without the migration?** Reads don't crash — an existing
`status='completed', outcome='Abandoned'` row renders as a green "Abandoned" completed item (missing
`cancel_reason`/`not_fixed_reason` columns are just `undefined`). But the **new cancel / Not-Fixed
writes fail until step 1 adds the columns**, and those historical rows only display as "Canceled"
after step 2 (backfill).

## Verification SQL (Supabase SQL Editor)

**Before migrating:**
```sql
select status, outcome, count(*) from work_orders group by status, outcome order by 1,2;
select count(*) as to_cancel from work_orders where outcome in ('Languished','Abandoned');
select column_name from information_schema.columns          -- expect 0 rows (columns not yet added)
  where table_name='work_orders' and column_name in ('cancel_reason','not_fixed_reason');
```
**After step 1 (columns):**
```sql
select column_name, data_type from information_schema.columns
  where table_name='work_orders' and column_name in ('cancel_reason','not_fixed_reason'); -- 2 rows, text
```
**After steps 3–4 (RPCs):**
```sql
select proname, pg_get_function_identity_arguments(oid) from pg_proc
  where proname in ('submit_fixer_outcome','get_fixer_work_order');  -- submit_* now lists 4 args
select pg_get_function_result(oid) from pg_proc where proname='get_fixer_work_order'; -- incl not_fixed_reason
```
**After step 2 (backfill):**
```sql
select count(*) as legacy_left from work_orders where outcome in ('Languished','Abandoned');       -- 0
select count(*) as bad_canceled from work_orders where status='canceled' and outcome is not null;  -- 0
select cancel_reason, count(*) from work_orders where status='canceled' group by 1 order by 1;
-- Languished kept as 'Languished'; former Abandoned now 'No Show'
```

## How to verify end-to-end

1. Run **step 1** of the migration; build/test coordinator flows. Run **steps 3–4** before the
   `/fix/` Not-Fixed test, and **step 2** at merge time (see deployment ordering above).
2. `npm run dev`:
   - Cancel a still-`pending` item **and** a `pending_assignment` item → pick a reason → each shows
     the "Canceled" badge + reason, `outcome` stays null, drops out of active counts. Undo works.
   - Pick **Not Fixed** (coordinator and fixer) → reason required → submit → shows Completed + reason.
   - Open a canceled item's `/fix/` link → graceful "Item Canceled" screen.
   - Admin dashboard shows the canceled total.
3. `npm run lint` / `npm run build` — no new errors introduced.
