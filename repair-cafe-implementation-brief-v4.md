# Repair Cafe Silicon Valley — Implementation Brief (v4)

## What this is

This document is a prompt/spec for implementing a production version of the Repair Cafe check-in app. It should be read alongside the **prototype file** (`repair-cafe-checkin-v5.jsx`), which is a fully working React component that demonstrates the complete UI and user flow. The prototype uses in-memory storage — the job is to convert it to a real deployed app.

## Golden rule

**Keep the UI exactly as it is in the prototype.** The components, layout, styling, colors, fonts, interactions — all of it stays. The only changes are: (1) swap the in-memory data store for Supabase, (2) add real URL routing, (3) move the password check server-side.

---

## Stack

- **Frontend**: Vite + React
- **Database & Auth**: Supabase (Postgres + Edge Functions)
- **Hosting**: Vercel (free tier)
- **Styling**: Inline styles (already done in prototype — don't refactor to CSS modules or Tailwind)

The person building this has experience with Vite, React, Supabase, and Vercel — use these tools directly without suggesting alternatives.

---

## The Happy Path Flow

This is the core flow the app supports:

1. **Visitor** scans a QR code → opens check-in form on their phone → enters name, email, and item details → submits → gets a confirmation with their code(s) → told to go to the check-in desk
2. **Coordinator** (at the desk) sees the submission appear in the queue → pulls up the visitor's record → validates/edits the data (fixes typos, corrects category, clarifies description) → approves and prints a ticket
3. **Printed ticket** goes on the board for fixers to pick up
4. **Fixer** takes the ticket, does the repair, writes the outcome on the ticket, and returns it to the desk
5. **Coordinator** looks up the work order by code → records the outcome and optionally the fixer's name → marks it complete

**Edge case**: For visitors without a phone, the coordinator can enter their info directly into the same check-in form on a kiosk iPad or the desk Chromebook.

---

## Data Model (Supabase Tables)

### `events`
| Column     | Type      | Notes                          |
|------------|-----------|--------------------------------|
| id         | uuid      | Primary key, auto-generated    |
| name       | text      | e.g. "Milpitas Library"        |
| date       | date      |                                |
| location   | text      | e.g. "Milpitas, CA"           |
| created_at | timestamp | Default now()                  |

### `attendees`
| Column     | Type      | Notes                        |
|------------|-----------|------------------------------|
| id         | uuid      | Primary key, auto-generated  |
| event_id   | uuid      | Foreign key → events.id      |
| name       | text      |                              |
| email      | text      |                              |
| created_at | timestamp | Default now()                |

### `work_orders`
| Column      | Type      | Notes                                              |
|-------------|-----------|-----------------------------------------------------|
| id          | uuid      | Primary key, auto-generated                         |
| code        | text      | Short alphanumeric code, e.g. "R-A3K". Unique.     |
| attendee_id | uuid      | Foreign key → attendees.id                          |
| event_id    | uuid      | Foreign key → events.id (denormalized for queries)  |
| item_name   | text      | e.g. "Coffee machine"                               |
| category    | text      | One of: Electronics, Clothing & Textiles, Appliances, Furniture, Jewelry, Bikes, Toys, Other |
| description | text      | What's wrong with the item                           |
| priority    | integer   | 1 or 2                                               |
| status      | text      | One of: pending, reviewed, in-progress, completed. Default: pending |
| outcome     | text      | Null until set. One of: Fixed, Diagnosed, Out of Scope, Not Fixable |
| fixer_name  | text      | Optional. Name of the fixer who worked on the item  |
| created_at  | timestamp | Default now()                                       |

### Work order status lifecycle
- **pending** → Visitor submitted, awaiting coordinator review
- **reviewed** → Coordinator approved and printed ticket, ready for the board
- **in-progress** → Ticket picked up by a fixer
- **completed** → Outcome recorded by coordinator

---

## URL Routing

Use React Router. Three route patterns:

| Route                       | What it shows             | Auth required? |
|-----------------------------|---------------------------|----------------|
| `/checkin?event=<event_id>` | Visitor check-in form     | No             |
| `/staff`                    | Password gate → coordinator dashboard (Queue + Admin tabs) | Yes — shared password |
| `/`                         | Redirect to `/staff` or show a landing/info page |  |

The **visitor check-in** route reads the `event` query parameter and uses it to associate all attendees and work orders with that event. If the parameter is missing or invalid, show an error message ("This check-in link isn't valid — ask a volunteer for help.").

The **staff portal** has two tabs (bottom nav): Queue (coordinator dashboard) and Admin (event creation + stats). The Queue tab is the primary workspace where coordinators review submissions, edit records, print tickets, and record outcomes.

---

## Password / Auth Approach

No user accounts. The staff portal is protected by a single shared password.

### How to implement it

1. Create a Supabase table called `app_settings` with a single row containing a bcrypt-hashed password.
2. Create a Supabase Edge Function (e.g. `verify-admin-password`) that:
   - Accepts `{ password: "..." }` in the request body
   - Compares it against the hashed value in `app_settings`
   - Returns `{ valid: true }` or `{ valid: false }`
3. On the frontend, when the password is accepted, store a flag in React state (or sessionStorage if you want it to survive page refreshes within a tab). There's no JWT or session token needed — this is a simple gate.

### Alternative (simpler but slightly hacky)

Create a Supabase Auth user with email `admin@repaircafe.app` and the shared password. Use `supabase.auth.signInWithPassword()` on the frontend. This is faster to set up and avoids writing an Edge Function. Either approach is fine.

---

## Key Implementation Notes

### Coordinator dashboard (Queue)
This is the main screen coordinators use all day. It shows all visitors for the current event, **grouped by visitor** (not a flat list of individual work orders). Each card shows the visitor's name, email, and all their items with codes. Key features:
- **Search** by visitor name, email, work order code, or item name
- **Filter tabs** by status: All, Pending, Ready (reviewed), Active (in-progress), Done (completed). A visitor group's status is determined by the "worst" status among their items (e.g., if one item is pending, the group shows as pending).
- **Tap a visitor card** to open their detail view, which shows all items together
- In the detail view, the coordinator can **edit all visitor and item fields** directly (name, email, item name, category, description) — all items are editable on one screen
- **"Approve & Print All Tickets"** button saves edits, sets all pending items to "reviewed", and opens the print view showing all tickets for that visitor stacked on one page (one per item, with page breaks between them for clean printing)
- Each item can independently be marked as "With Fixer" and have its outcome recorded
- **Edit Outcome**: Completed items show the outcome with an "Edit Outcome" button that bumps the status back to "in-progress" and clears the outcome so the coordinator can re-select. This handles mistakes.
- **Reprint** button available for items that have already been approved

### Event selector
The queue page includes a **dropdown at the top (above the "Queue" title)** to switch between events. This keeps the staff header clean (just logo + lock). The queue filters to show only visitors and work orders for the selected event. In production, this could default to today's event (matching by date) or the most recently created event. When switching events, the selected visitor is cleared.

### Undo / correction actions
Coordinators can correct mistakes at any stage:
- **"Back to Ready" on in-progress items**: If an item was accidentally marked as "With Fixer" but nobody actually picked it up, the coordinator can tap "← Back to Ready (undo With Fixer)" to return it to the "reviewed" status.
- **"Edit Outcome" on completed items**: If the wrong outcome was recorded, the coordinator can tap "Edit Outcome" which bumps the item back to "in-progress" with the outcome cleared so they can re-select.
These undo actions ensure the data stays accurate without needing to involve an admin.

### Batch printing
When a visitor has 2 items, the "Approve & Print" action prints both tickets on one page (or with page breaks so each ticket gets its own sheet). The coordinator hits print once and gets all tickets for that visitor. The print view uses `window.print()` and `@media print` CSS. Each ticket includes: the code (large), visitor name, item name, category, priority, problem description, and blank spaces for the fixer to write outcome and their name. Designed for regular letter-size paper.

### Realtime updates
New submissions from visitors should appear in the coordinator's queue without requiring a page refresh. Use Supabase Realtime subscriptions on the `work_orders` and `attendees` tables for the current event, or poll every few seconds. Realtime is preferred.

### Check-in flow (what happens on submit)
1. Insert a row into `attendees` (name, email, event_id)
2. For each item (1 or 2), insert a row into `work_orders` with a generated code, linked to the attendee and event. Status defaults to "pending".
3. Return the code(s) to display on the confirmation screen
4. Visitor is told to go to the check-in desk

This should ideally be a single Supabase RPC function (a Postgres function called via `supabase.rpc()`) so it's atomic.

### Code generation
The prototype generates codes like "R-A3K" using `generateCode()`. In production, you need to ensure uniqueness. Options:
- Generate a code, check if it exists in `work_orders`, retry if collision (simple, fine at this scale — 80 items per event means collisions are extremely rare with a 3-char alphanumeric space)
- Or generate the code server-side in a Supabase function with a unique constraint and retry logic

### Row-Level Security (RLS)
For simplicity, you can start with RLS disabled on these tables since there are no user accounts and the data isn't sensitive. If you want to lock it down later:
- `work_orders` and `attendees`: allow inserts from anonymous users (for check-in), allow reads/updates from authenticated users (staff)
- `events` and `app_settings`: allow reads/writes only from authenticated users

### QR Codes
The admin screen shows the check-in URL for each event. For the actual QR code image, you can use a library like `qrcode.react` to render it inline, or just use any free QR code generator with the URL. This is a nice-to-have — the URL itself is the important thing.

---

## What NOT to change

- Don't refactor the inline styles to a different styling approach
- Don't add a component library (no MUI, Chakra, etc.)
- Don't add user accounts or individual logins
- Don't add more fields to the visitor check-in form (coordinator can add detail after)
- Don't change the fonts (Outfit + Space Mono from Google Fonts)
- Don't change the color scheme (navy #1e3a6e, coral #e07850)
- Don't let fixers record outcomes directly — only coordinators do this

---

## File structure suggestion

```
src/
  components/
    Logo.jsx
    Button.jsx
    Input.jsx
    TextArea.jsx
    Select.jsx
    Card.jsx
    Badge.jsx
    StatusBadge.jsx
    ItemForm.jsx
    PasswordGate.jsx
    PrintTickets.jsx         # Prints all tickets for a visitor (1 or 2) on one page
  pages/
    CheckIn.jsx              # Visitor check-in + confirmation
    StaffPortal.jsx          # Password gate wrapper
    CoordinatorQueue.jsx     # Visitor-grouped, searchable/filterable queue
    CoordinatorVisitorDetail.jsx  # Edit all items for one visitor, approve, print, record outcomes
    Admin.jsx                # Event creation + stats
  lib/
    supabase.js              # Supabase client init
    store.js                 # All Supabase queries
    generateCode.js          # Code generation with uniqueness check
  App.jsx                    # React Router setup
  main.jsx                   # Entry point
```

---

## Summary

This is a small app with a clear purpose: let visitors check themselves in on their phones, then coordinators review, print tickets, and track outcomes. The prototype already works — the implementation job is connecting it to Supabase and deploying to Vercel. Keep it simple.
