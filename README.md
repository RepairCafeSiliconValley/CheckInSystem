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
- Access to the Supabase project (ask the project owner)

### Setup

```bash
git clone https://github.com/Henny2/RepairCafeV2.git
cd RepairCafeV2
npm install
```

Create a `.env.local` file in the project root:

```
VITE_SUPABASE_URL=<supabase-project-url>
VITE_SUPABASE_ANON_KEY=<supabase-anon-key>
VITE_FEATURE_PRINT_FLOW=false
```

Get the Supabase URL and anon key from the project owner or the Supabase dashboard (Settings > API).

### Run locally

```bash
npm run dev
```

App runs at `http://localhost:5173`.

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
│   ├── Admin.jsx                      # Event management, stats, QR codes
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
| `/fix/:code` | FixerSubmit | Fixer records repair outcome for a work order |

### Staff (password-protected)

| Route | Page | Description |
|-------|------|-------------|
| `/staff` | StaffPortal | Coordinator dashboard with Queue and Admin tabs |

All other routes redirect to `/staff`.

## Key Workflows

### Visitor Check-In
1. Visitor scans QR code at the event, opens `/checkin?event=<id>`
2. Enters name, email, phone, zip code
3. Adds 1–2 items (name, category, description)
4. Reviews and accepts liability waiver
5. Receives confirmation with item codes (e.g. `R-A3K`)

### Coordinator Queue
1. Logs into `/staff` with shared password
2. Selects active event
3. Views visitors grouped by status: Pending → Ready → Active → Done
4. Opens visitor detail to review/edit items
5. Approves and prints tickets (one per item)
6. Records outcomes when fixers return tickets

### Fixer Outcome
1. Fixer receives printed ticket with a code
2. Navigates to `/fix/<code>` (or types it in)
3. Enters name and selects outcome (Fixed / Diagnosed / Out of Scope / Not Fixable)

## Database (Supabase)

Four main tables:

- **`events`** — id, name, date, location, is_open
- **`attendees`** — id, event_id, name, email, phone, zip_code
- **`work_orders`** — id, code, attendee_id, event_id, item_name, category, description, priority, status, outcome, fixer_name
- **`waiver_acceptances`** — attendee_id, waiver_version, waiver_text, waiver_hash, accepted_at

Check-in is handled atomically by the `checkin_visitor` Supabase RPC function (creates attendee + work orders + waiver record in one transaction).

The coordinator queue uses **Supabase Realtime** subscriptions for live updates.

### Auth
There are no individual user accounts. The staff portal uses a single shared password stored as a bcrypt hash in the `app_settings` table. Authentication goes through `supabase.auth.signInWithPassword()` with a fixed admin email.

## Deployment

Hosted on Vercel. SPA routing is configured in `vercel.json` (all routes rewrite to `index.html`).

To deploy: push to `main` — Vercel auto-deploys.

## Useful Links

- **GitHub repo:** https://github.com/Henny2/RepairCafeV2
- **Supabase dashboard:** https://supabase.com/dashboard/project/cpnguuvzvlyhfqyxwwxl
- **Vercel dashboard:** https://vercel.com (find the project under the team/account that owns it)
