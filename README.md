# Repair Cafe Silicon Valley — Check-In App

A mobile-friendly check-in system for Repair Cafe Silicon Valley events. Visitors check in items for repair on their phones, coordinators manage the queue and print tickets, and fixers record outcomes.

## Tech Stack

- **Frontend:** React 19 + Vite
- **Routing:** React Router DOM v7
- **Database & Auth:** [Supabase](https://supabase.com) (Postgres + Realtime + Auth)
- **Hosting:** [Vercel](https://vercel.com) (free tier)
- **Styling:** Inline CSS (no framework — no Tailwind, no CSS modules)
- **QR Codes:** qrcode.react

## Getting Started

### Prerequisites

- Node.js (v18+)
- npm
- Access to the **DEV** Supabase project (ask the project owner)

### Setup

```bash
git clone https://github.com/RepairCafeSiliconValley/CheckInSystem.git
cd CheckInSystem
npm install
```

Create a `.env.local` file in the project root:

```
VITE_SUPABASE_URL=<dev-supabase-project-url>
VITE_SUPABASE_ANON_KEY=<dev-supabase-anon-key>
```

For local development these **must point at the DEV Supabase project** — never production.
Get the URL and anon key from the DEV project's dashboard (Settings > API) or the project owner.
`.env.local` is gitignored; never commit keys.

### Run locally

```bash
npm run dev
```

App runs at `http://localhost:5173`.

## Environments & Branching

There are two Supabase projects — **PROD** (live event data) and **DEV** (safe to experiment, seeded
with mock data) — and the branch you're on determines which one is used:

| Branch | Vercel deployment | Supabase project |
|--------|-------------------|------------------|
| `main` | Production | PROD |
| `dev` | Preview | DEV |
| `feature/*` (PR into `dev`) | Preview | DEV |

Workflow:

1. Branch off `dev` for your work (`feature/...`).
2. Open a PR into `dev`. Vercel builds a Preview deployment wired to the **DEV** Supabase project.
3. When `dev` is ready for a release, open a PR from `dev` → `main`.
4. Merging to `main` triggers the Vercel Production deployment, which is the **only** environment
   configured with the PROD Supabase keys.

Because the PROD keys live only in Vercel's Production environment, nothing on `dev` or a feature
branch can read or write production data — locally or in Preview. Keep your local `.env.local`
pointed at DEV for the same reason.

### All scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint |

## Project Structure

```
src/
├── components/       # Reusable UI components (Button, Card, Input, etc.)
│   ├── ItemForm.jsx        # Repair item entry form
│   ├── PasswordGate.jsx    # Staff portal auth
│   ├── PrintTickets.jsx    # Print layout for repair tickets
│   └── WaiverStep.jsx      # Waiver acceptance screen
├── pages/
│   ├── CheckIn.jsx                    # Visitor check-in form
│   ├── StaffPortal.jsx                # Staff dashboard (auth wrapper)
│   ├── CoordinatorQueue.jsx           # Visitor queue by status
│   ├── CoordinatorVisitorDetail.jsx   # Edit items & record outcomes
│   ├── Admin.jsx                      # Event management, per-event item limit, stats, QR codes, attendee CSV export
│   └── FixerSubmit.jsx                # Fixer outcome submission
├── lib/
│   ├── supabase.js    # Supabase client init
│   ├── store.js       # All database queries & RPC calls
│   └── constants.js   # Categories, outcomes, waiver text
├── App.jsx            # Router setup
└── main.jsx           # Entry point
```

## Routes

### Public (no auth)

| Route | Page | Description |
|-------|------|-------------|
| `/checkin?event=<id>` | CheckIn | Visitor check-in form (opened via QR code) |
| `/fix/:id` | FixerSubmit | Fixer records repair outcome for a work order (id = work-order UUID, encoded in the ticket QR) |

### Staff (password-protected)

| Route | Page | Description |
|-------|------|-------------|
| `/staff` | StaffPortal | Coordinator dashboard with Queue and Admin tabs |

All other routes redirect to `/staff`.

## Key Workflows

### Visitor Check-In
1. Visitor scans QR code at the event, opens `/checkin?event=<id>`
2. Enters name, email, phone, zip code
3. Adds up to the event's item limit (`max_items`, configurable 1–10, default 2) — name, category, description
4. Reviews and accepts liability waiver
5. Receives confirmation with item codes (e.g. `R-A3K`)

### Coordinator Queue
1. Logs into `/staff` with shared password
2. Selects active event
3. Filters visitors by work-order status — tabs: **All / Pending / Waiting / Done**
   (underlying statuses: `pending` → `pending_assignment` → `completed`)
4. Opens visitor detail to review/edit items
5. Approves and prints tickets (one per item)
6. Records outcomes when fixers return tickets

### Fixer Outcome
1. Fixer receives printed ticket with a QR code
2. Scans the QR (or opens `/fix/<id>`) for that work order
3. Enters name and selects an outcome: **Fixed / Diagnosed / Not Fixed / Taken Home**

(Coordinators can additionally apply the staff-only outcomes **Languished** and **Abandoned** from the visitor detail screen.)

## Database (Supabase)

Four main tables:

- **`events`** — id, name, date, location, is_open, max_items, created_at
- **`attendees`** — id, event_id, first_name, last_name, email, phone, zip_code, is_volunteer, created_at
- **`work_orders`** — id, code, attendee_id, event_id, item_name, category, description, priority, status, outcome, fixer_name, created_at, printed_at, completed_at
- **`waiver_acceptances`** — id, attendee_id, waiver_version, waiver_text, content_hash, accepted_at

Two Postgres RPC functions wrap the multi-row writes in a single transaction:

- **`checkin_visitor`** — creates the attendee + work orders + waiver record atomically (called from the public check-in form).
- **`submit_fixer_outcome`** — records a fixer's outcome on a work order (called from the public `/fix/:id` page).

The coordinator queue uses **Supabase Realtime** subscriptions for live updates.

### Seeding (DEV)

To populate the DEV project with realistic mock data (events across past/today/upcoming, attendees,
work orders covering every status and outcome, and waiver records), run [`supabase-seed.sql`](./supabase-seed.sql)
in the Supabase SQL Editor (or via the MCP). It truncates the four tables first, so it's safe to re-run.
**Do not run it against PROD.**

### Auth
There are no individual user accounts. The staff portal (`PasswordGate`) is gated by a single shared
password: sign-in calls Supabase Auth's `supabase.auth.signInWithPassword()` with a fixed admin email
(`admin@repaircafe.app`) and the password the user types. The session is then used for all staff actions.

## Deployment

Hosted on Vercel. SPA routing is configured in `vercel.json` (all routes rewrite to `index.html`).

Deployments follow the branch model in [Environments & Branching](#environments--branching):

- **Production** — merging to `main` auto-deploys the production site, using the PROD Supabase keys
  (set in Vercel's Production environment).
- **Preview** — pushes to `dev` and feature-branch PRs auto-deploy Preview builds, using the DEV
  Supabase keys (set in Vercel's Preview environment).

So the normal release path is: feature branch → PR into `dev` (Preview) → PR `dev` → `main` (Production).

## Useful Links

- **GitHub repo:** https://github.com/RepairCafeSiliconValley/CheckInSystem
- **Supabase dashboard:** https://supabase.com/dashboard — ask the project owner for access to the DEV and PROD projects
- **Vercel dashboard:** https://vercel.com (find the project under the team/account that owns it)
