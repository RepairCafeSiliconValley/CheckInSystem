# Admin authentication with a pre-approved allowlist: design

Status: **design agreed, not started.**

## 1. Goal

Split today's single portal at `/admin` into two URLs with two kinds of login:

| URL      | Contents                                                       | Login                                                               |
|----------|----------------------------------------------------------------|---------------------------------------------------------------------|
| `/queue` | Queue (plus visitor detail and printing), Metrics              | Unchanged: the shared volunteer password                            |
| `/admin` | Events (today's Admin tab), Allowlist, Users                   | A personal Supabase login (Google), and the email must be pre-approved |

Each page links to the other (§6.1).

### Access levels
The app has exactly three access levels. The word "staff" is retired: it isn't used in new
code, SQL, UI text or docs, and existing uses are renamed (§6.6).

| Level | Who | How they sign in | What they can reach |
|---|---|---|---|
| **Admin** | Organizers on the admin allowlist | Personal Google login | `/admin`, and also `/queue` |
| **Volunteer** | Anyone at an event who knows the shared password | The shared volunteer account (email + password) | `/queue` |
| **Client** | Visitors bringing items, and anyone else | No login (anon key) | `/`, `/checkin`, and `/fix/:id` |

`/fix/:id` sits at the client level, although the people using it are fixers (who are
volunteers). That's because the page needs no login: the work-order UUID on the printed
ticket's QR code is the only credential. It only reaches the narrow `get_fixer_work_order` and
`submit_fixer_outcome` RPCs.

In SQL, the levels map to `is_admin()` and `is_volunteer()` (§5.2). Client is simply the `anon`
role.

Not in scope for now:
- magic-link login (planned, see §10)
- sending invite emails automatically
- audit columns such as `created_by`/`updated_by` on `events`

## 2. Why this needs database work, not just a new login screen

Today every RLS policy that isn't public is `auth.role() = 'authenticated'`
(`supabase-rls-migration.sql`, `supabase-pii-rls-fix.sql`). That has two consequences:

1. **Moving the Admin tab behind a new login protects nothing by itself.** Someone using the
   shared volunteer password can still call `createEvent` / `updateEvent`, or read attendees for
   the CSV, straight from the browser console, because the anon key and the shared session
   are both in the browser. Admin-only actions have to be enforced in RLS.
2. **Turning on Google login lets anyone with a Google account become `authenticated`.**
   Supabase creates the `auth.users` row and issues a session *before* any app-side
   allowlist check could run. Under today's policies that session can read every attendee's
   name, email and phone number. So the allowlist check must happen **inside Supabase, before
   the user is created**, and not in React after the redirect.

The design below therefore has three layers:
- an Auth hook blocks sign-up,
- RLS separates what the volunteer account and admins may do,
- the React gates handle the user experience only.

## 3. What Supabase Auth offers

### Sign-in method used: **Google** (magic link planned for later)
| Method | Notes for this app |
|---|---|
| **Google (OAuth)** | You need a Google Cloud OAuth client and its client ID/secret in each Supabase project (DEV and PROD). Google provides `full_name`, `avatar_url` and a verified email. It does **not** provide a phone number. Admins without a Google account can't sign in until magic link is added. Any email address can be registered as a Google account, not only `@gmail.com` ones. |
| **Magic link / email OTP** (later, see §10) | Passwordless; works for anyone, whether or not they use Google. It needs **custom SMTP in production** (Resend, Postmark, SendGrid; all have free tiers): Supabase's built-in mailer is limited to a few emails an hour and only sends to your project team's addresses. |

Not used: phone/SMS (paid provider), SAML SSO (Pro plan), anonymous, Web3. Email + password
stays enabled only because the volunteer account uses it (see below). Other social providers
(Microsoft, GitHub, Apple, …) can be added later. The allowlist check works the same way for
every method.

**Leave Supabase's Email provider enabled.** The shared volunteer password is an email + password
sign-in, so turning the Email provider off would break `/queue`. That means a person could call
`signInWithOtp` or `signUp` from the browser console even though the UI shows only Google. This
is safe: the Before User Created hook rejects any email that isn't on the allowlist, whatever
the method.

Related features:
- **Identity linking.** When magic link is added later, an admin who first signed in with
  Google and then uses a magic link for the same verified email stays one `auth.users` row,
  not two.
- **MFA (TOTP).** Free, and an option to add later for admins.
- **Redirect URL allowlist** (Dashboard → Auth → URL Configuration). After OAuth (and later a
  magic link), Supabase only redirects to approved URLs. It needs `http://localhost:5173/**`, the
  production domain, and a Vercel preview wildcard (`https://*-<team>.vercel.app/**`) on DEV.

### Auth hooks: where the allowlist check runs
A hook is a Postgres function (or an HTTP endpoint) that Supabase Auth calls at a set point.
- **Before User Created hook.** It runs before a new `auth.users` row is inserted, for every
  method including OAuth. It can reject the sign-up with an error message that Supabase passes
  back to the redirect URL. **This is where the allowlist is enforced.**
- **Custom Access Token hook.** It can add claims to the JWT. It isn't needed here (see §5.3).

> Verify before building: check that *Before User Created* is enabled on the project's plan,
> and how the local CLI version configures it (`[auth.hook.before_user_created]` in
> `supabase/config.toml`). It is a newer hook. This is the first task of PR 2, and §9 describes
> a trigger-based fallback if it isn't available.

### Data Supabase keeps for you (`auth.users`)
`id`, `email`, `phone`, `created_at`, **`last_sign_in_at`** (so "last login" comes for free),
`raw_user_meta_data` (Google puts `full_name`, `name` and `avatar_url` here), and
`raw_app_meta_data` (which providers were used).
`last_sign_in_at` changes only on an interactive sign-in, not on silent token refresh.
Sessions last until sign-out, so "last login" can be weeks old for someone who uses the app
every day. Time-boxed sessions are a Pro plan setting.

## 4. Flows

### 4.1 Inviting a new admin
1. An admin opens `/admin` → **Allowlist** and enters an email (email only, no name).
2. A row is inserted into `admin_allowlist` (RLS: admins only).
3. The invitee is told out of band to go to `/admin`. Sending an email automatically is not in
   scope.

### 4.2 First sign-in
1. `/admin` shows the login card with **Continue with Google** and **Email me a link**.
2. Supabase runs the **Before User Created hook**, which looks up the email in `admin_allowlist`
   (case-insensitive):
   - if it is **not found**, the sign-up is rejected, no user or session is created, and the
     app shows "This email hasn't been approved."
   - if it is **found**, the sign-up is allowed.
3. An **AFTER INSERT trigger on `auth.users`** inserts the `app_users` row (name, email and
   phone from metadata, `disabled=false`) and **deletes the allowlist row**. This happens in the
   same transaction, so the steps can't half-complete.
4. The app loads `app_users` for the session user and shows the admin UI.

### 4.3 Later sign-ins
The user already exists, so the hook doesn't run. The gate checks the user's `app_users` row:
- enabled: allowed in.
- `disabled = true`: "Your account has been disabled. Ask another admin to re-enable it," plus
  a Sign out button.
- no row (shouldn't happen, because deletion removes the `auth.users` row too): treated as
  disabled.

The `last_sign_in_at` change is copied into `app_users.last_login_at` by an AFTER UPDATE
trigger on `auth.users`.

### 4.4 Disabling and re-enabling
An admin flips the **Disabled** toggle in **Users**. RLS reads the flag from the table on every
request, so access ends immediately, even mid-session. Flipping it back restores access with
the same account and history; the person doesn't need a new invite.

### 4.5 Deleting
An admin clicks **Delete** in **Users** and confirms. This deletes the `auth.users` row, and
the delete cascades to `app_users`. To come back, the person must be **re-added to the
allowlist**, because the next sign-in is a new sign-up and the hook runs again. Their current
session dies at once: the JWT may stay valid for up to an hour, but `is_admin()` finds no
`app_users` row, so every request is denied.

Guards that apply to both disable and delete: you can't disable or delete **yourself**, and you
can't disable or delete the **last enabled admin**. Together these stop admins from locking
everyone out.

## 5. Database design (new file: `supabase-admin-auth-migration.sql`)

### 5.1 Tables
```sql
create table admin_allowlist (
  email       text primary key check (email = lower(email)),
  invited_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table app_users (
  id             uuid primary key references auth.users(id) on delete cascade,
  email          text not null unique,
  name           text not null,
  phone          text,
  avatar_url     text,
  disabled       boolean not null default false,
  created_at     timestamptz not null default now(),
  last_login_at  timestamptz
);
```
- Name it `app_users`, not `users`, so it can't be confused with `auth.users`.
- The `id` matches `auth.users.id`, which is the standard Supabase "profile table" pattern.
  `on delete cascade` is what makes deleting the auth user remove the profile.
- **`name not null`:** Google provides a name. A magic-link sign-in (later) won't, and the
  allowlist doesn't store one. The trigger fills it from metadata `full_name`, then `name`,
  then the part of the email before `@` (so `jane.doe@x.org` becomes `jane.doe`). Build the
  fallback now: it's a single `coalesce`, and it means magic link needs no change here.
- **No CHECK constraint is needed.** A `boolean not null` column can only be true or false, so
  no value can be mistyped into one that grants access. This is why the design uses a
  `disabled` flag instead of a free-text `role` column.

### 5.2 Functions
| Function | Kind | Purpose |
|---|---|---|
| `hook_before_user_created(event jsonb)` | Auth hook, SECURITY DEFINER, pinned `search_path`. Grant execute to `supabase_auth_admin` only and revoke from `anon`/`authenticated`/`public` | Rejects the sign-up unless `lower(event->'user'->>'email')` is in `admin_allowlist` |
| `handle_new_app_user()` | Trigger on `auth.users` AFTER INSERT, SECURITY DEFINER, pinned `search_path` | Inserts the `app_users` row (with the name fallback) and deletes the allowlist row |
| `sync_last_login()` | Trigger on `auth.users` AFTER UPDATE OF `last_sign_in_at`, SECURITY DEFINER, pinned `search_path` | Copies the time into `app_users.last_login_at` |
| `is_admin()` | SECURITY DEFINER, `stable`, pinned `search_path` | `exists(select 1 from app_users where id = auth.uid() and not disabled)` |
| `is_volunteer()` | same | `auth.jwt()->>'email'` equals the volunteer account's email (§6.6) |
| `can_access_queue()` | same | `is_admin() or is_volunteer()`. This is the check for everything `/queue` reads and writes |
| `set_user_disabled(target uuid, value boolean)` | RPC, SECURITY DEFINER | Admin only. Refuses to disable yourself or the last enabled admin |
| `delete_app_user(target uuid)` | RPC, SECURITY DEFINER, owned by `postgres` | Admin only, with the same guards. Runs `delete from auth.users where id = target`, which cascades to `app_users` |

**Who runs these functions.** The hook and both `auth.users` triggers run as Supabase's internal
`supabase_auth_admin` role, not as the signed-in user. That role has no access to `public`
tables by default. Making all three `SECURITY DEFINER` (owned by `postgres`) lets them read
`admin_allowlist` and write `app_users` without granting `supabase_auth_admin` anything on
those tables. A missing grant or `SECURITY DEFINER` here is the most common reason this setup
fails. The symptom is a generic "Database error saving new user" on every sign-up, including
allowlisted ones.

**Deleting from `auth.users` in SQL.** This works on Supabase when the function is owned by
`postgres`. The officially documented route is the Admin API (`auth.admin.deleteUser`), which
needs the service-role key and so an Edge Function. The SQL delete doesn't skip any cleanup.
Supabase's own tables that point at a user (sessions, refresh tokens, identities, MFA factors)
reference `auth.users` with `on delete cascade`, so they go with it, which is also what the
Admin API's hard delete does.

The risks are:
- **Foreign keys that block the delete.** The known one is `storage.objects.owner`, but this
  app doesn't use Storage. Our own references are covered: `app_users` cascades and
  `admin_allowlist.invited_by` is set to null.
- **Hosted permissions differing from local.** Supabase tightened access to its internal
  schemas in 2025. Deleting rows from `auth.users` and adding triggers to it are still
  documented patterns, but the hosted `postgres` role has fewer privileges than the local
  stack's, so a local pass doesn't prove the hosted one.
- **A future Supabase change.** Any of the above would make the delete **fail with an error,
  not succeed partially**. The transaction rolls back and the Users page shows the error.

Mitigation:
- Test the delete on the **hosted DEV** project as part of PR 2 (§9).
- Keep the front-end contract as `deleteAppUser(id)` in `store.js`. If the RPC ever stops
  working, it can be replaced with a small Edge Function that calls `auth.admin.deleteUser`
  after checking `is_admin()` for the caller, with no change to page code.

### 5.3 RLS changes
| Table | Today | After PR 2 (transition) | After PR 3 (final) |
|---|---|---|---|
| `attendees`, `work_orders`, `waiver_acceptances`: select/update | `authenticated` | `can_access_queue()` | `can_access_queue()` |
| `events`: select | anyone | unchanged | unchanged |
| `events`: insert/update | `authenticated` | `can_access_queue()` (volunteer password still works) | **`is_admin()`** |
| `admin_allowlist` | — | select/insert/delete: `is_admin()` | same |
| `app_users` | — | select: `is_admin()`; update: `is_admin()`, with column grants allowing `name` only; `disabled` changes and deletes only through the RPCs | same |

Changing `authenticated` to `can_access_queue()` is what stops a disabled account, or any stray
`auth.users` row, from reading PII.

**Policy names.** The existing policies are named `"Staff can …"`. The new migrations drop them
and recreate them under names that use the access levels, for example `"Volunteers and admins
can read attendees"` and `"Admins can create events"`. Applied migration files aren't edited.

**Table lookup versus a JWT claim.** Putting the admin flag in the JWT (Custom Access Token
hook) would save a lookup per row. The cost is that disabling someone would only take effect at
the next token refresh (up to an hour), and it adds a second hook to set up in each environment.
With this app's data volume the `is_admin()` lookup costs nothing that matters. Wrap it as
`(select is_admin())` in policies so Postgres evaluates it once per statement and not once per
row.

### 5.4 Bootstrap
The first admin can't be invited from the UI. Each environment needs a one-time step:
`insert into admin_allowlist(email) values ('you@example.com');`. Put this as a commented step
at the end of the migration, and in `supabase-seed.sql` for DEV and local.

### 5.5 Migration files and order
- `supabase-admin-auth-migration.sql` (PR 2): tables, hook, triggers, functions, and the
  transition RLS.
- `supabase-admin-auth-lockdown.sql` (PR 3): changes the `events` insert/update policies from
  `can_access_queue()` to `is_admin()`.

They go after `supabase-reason-notes-migration.sql`, in that order. Add both to the ordered
file list in `scripts/db-reset.mjs` (§8.1), which `CLAUDE.md` points to. Once the SQL is applied, the hook still has to be **switched on** in the
dashboard (Auth → Hooks), separately in DEV and PROD. Locally that is `config.toml`.

## 6. Front-end design

### 6.1 Routes (`src/App.jsx`)
```
/queue   → QueuePortal   (PasswordGate → Queue | Metrics tabs)
/admin   → AdminPortal   (PasswordGate until PR 3, then AdminLoginGate → Events | Allowlist | Users tabs)
```
- `StaffPortal.jsx` becomes `QueuePortal.jsx` with two tabs. The new `AdminPortal.jsx` reuses
  the same header and bottom tab bar. Extract a `PortalShell` component if the shared code
  grows.
- The "Staff Portal →" link in `CheckIn.jsx:604` becomes "Volunteer Portal →" and points to
  `/queue`.
- **Links between the two portals.** Each portal header has a link to the other, beside the
  signed-in identity and Logout (§6.3):
  - `/queue` shows **Admin →**, linking to `/admin`.
  - `/admin` shows **Queue →**, linking to `/queue`.

  Both links are always shown, whatever the session. A volunteer who follows **Admin →** gets
  the `/admin` login card with the volunteer-account message (§6.3); nothing is exposed,
  because RLS does the enforcing. An admin who follows **Queue →** goes straight in, because
  `can_access_queue()` includes admins. Each password gate and login card also carries the
  link, so it's reachable before signing in. The links are plain React Router `<Link>`s, so
  the session carries over without a reload.
- **Deep links between portals.** Admin's "View metrics" (`Admin.jsx:292`) used to switch tabs.
  It now goes to another URL: `navigate('/queue?tab=metrics&event=<id>')`. QueuePortal reads
  `tab` and `event` from the query string to set its initial state. Metrics' "Open queue"
  stays inside `/queue`.

### 6.2 `AdminLoginGate`
The states are:
- `checking`
- `signed-out`, which shows the **Continue with Google** button
- `not-approved`, when the hook rejected the sign-up (shown from the error in the redirect URL)
- `disabled`
- `ok`

It listens to `supabase.auth.onAuthStateChange` so the OAuth redirect back to `/admin` finishes
the sign-in. A magic link later redirects the same way, so adding it only needs an email field
and a `link-sent` state. `redirectTo` is `${window.location.origin}/admin`, so it works
on localhost, on previews and in production.

### 6.3 One browser session
The Supabase client stores **one** session per browser. If someone signs in with the volunteer
password on `/queue` and then with Google on `/admin` in the same browser, the second sign-in
replaces the first. Signing out on either page signs out both.

Keep it that way. `can_access_queue()` includes admins, so an admin session also unlocks
`/queue`.
Event-day kiosk devices use the volunteer password and admins use their own devices, so in
practice the two rarely collide. When they do, the risk runs in two directions, and both get
explicit UI:

- **Volunteer session on `/admin`.** Show the login card with a "Signed in as the volunteer
  account. Sign in with your own account" message. Signing in with Google replaces the
  volunteer session on this device; the card says so.
- **Admin session on `/queue`, the more serious case.** An admin who signs in with Google on a
  front-desk laptop and walks away leaves volunteers working as that admin, able to open
  `/admin`. `/queue` accepts this session, as designed, but makes it obvious:
  - a banner across the top: "Signed in as Jane Doe (admin). This device isn't on the volunteer
    account."
  - a **Switch to volunteer account** button that signs out and shows the `PasswordGate`.

**Who's signed in, everywhere.** Both portal headers show the current identity next to Logout:
"Volunteer account" or "Jane Doe (admin)". It comes from the session email plus `app_users.name`.
The Logout button's tooltip notes that it signs out on both pages.

### 6.4 New pages
**Allowlist**
- An add form with an email field (lower-cased and trimmed, with basic format validation).
- A list of pending invites showing email, invited by and invited on, each with a Delete
  button (with a confirm modal).
- Adding an email that already has an `app_users` row shows "already a user" instead of
  inserting a row that can never be used.

**Users**
- A table with Name, Email, Phone, Disabled, Created and Last login columns.
- Click a header to sort; click again to reverse. Sorting happens on the client because the
  data is small. It still loads through `fetchAllPages()`, following the repo rule.
- **Disabled** is an inline toggle that calls `set_user_disabled`. Disabled rows are greyed out.
- **Delete** opens a confirm modal: "This removes their login. They'll need to be added to the
  allowlist again to come back. To pause access instead, use Disabled." It then calls
  `delete_app_user`.
- **Name** is editable inline: click it, type, and press Enter or click away to save. This is
  a direct `app_users` update that RLS limits to admins and to the `name` column. Saving an
  empty name is rejected.
- Your own row is marked "(you)", and its toggle and Delete are disabled. Errors from the
  last-admin guard are shown inline.
- On a phone (the app is laid out for 640px), show cards with a "Sort by" select instead of a
  wide table.

### 6.5 `store.js` additions
`signInWithGoogle()`, `getCurrentAppUser()`, `fetchAllowlist()`,
`addToAllowlist(email)`, `removeFromAllowlist(email)`, `fetchAppUsers()`,
`setUserDisabled(id, value)`, `deleteAppUser(id)`, `updateAppUserName(id, name)`. Pages keep importing only from `store.js`.

### 6.6 Retiring "staff"
Rename these as part of PR 1, along with anything else that turns up in a search for `staff`:

| Where | Today | New |
|---|---|---|
| `src/pages/StaffPortal.jsx` | `StaffPortal`, `staffTab` | `QueuePortal`, `activeTab` (§6.1) |
| `PasswordGate.jsx` heading | "Staff Access" / "Enter the shared password" | "Volunteer Access" / "Enter the volunteer password" |
| `CheckIn.jsx:604` link | "Staff Portal →" | "Volunteer Portal →" |
| Code comments (`constants.js`, `metrics.js`, `RecordOutcome.jsx`, `Modal.jsx`, `EventPicker.jsx`) | "Staff-only", "Staff assign…", "StaffPortal tab bar" | "Volunteer-only", "Volunteers assign…", "portal tab bar" |
| `store.js` `signIn(password)` | hard-codes `admin@repaircafe.app` | `signInVolunteer(password)`, using `VOLUNTEER_ACCOUNT_EMAIL` from `constants.js` |
| RLS policy names | `"Staff can …"` | recreated with level names (§5.3) |
| `CLAUDE.md`, `README.md` | "staff portal", "Staff sign in…", the stale `/staff` route | admin / volunteer / client wording; the routes from §6.1 |

**The volunteer account's email.** The shared account is `admin@repaircafe.app`, but under the
new levels it is the *volunteer* account, and admins are a different thing. Leaving it named
`admin` invites mistakes, such as someone adding it to the allowlist or reading `is_volunteer()`
as wrong. Rename it to `volunteer@repaircafe.app`:
- In PR 1, put the email in a single constant, `VOLUNTEER_ACCOUNT_EMAIL` in `constants.js`.
  PR 2's `is_volunteer()` compares against the same address.
- In each environment, change the existing auth user's email in place, so the password and id
  stay the same. Use the Admin API (`auth.admin.updateUserById(id, { email, email_confirm:
  true })`) or the Studio user editor. **Do it at the same moment that environment gets the PR 1
  code**: DEV when PR 1 merges to `dev`, PROD at the next release to `main`. Between the two
  steps the volunteer login fails, so pick a time with no event running.
- Until PR 2, RLS only checks `authenticated` and not the email, so the rename can't lock
  anyone out of data. Only the login screen depends on it.
- Update `supabase-seed.sql`, the local Auth user, and the password comment in `.env.local`.

**"Coordinator".** `CoordinatorQueue` and `CoordinatorVisitorDetail` name a job that volunteers do,
not an access level, so they stay as they are.

## 7. Configuration checklist (for each environment)
1. Google Cloud: create an OAuth client (type Web) and a consent screen. Set the authorized
   redirect URI to `https://<project-ref>.supabase.co/auth/v1/callback`. Locally it is
   `http://127.0.0.1:54331/auth/v1/callback`.
2. Supabase → Auth → Providers → Google: enter the client ID and secret.
3. Supabase → Auth → URL Configuration: Site URL and redirect URLs (§3).
4. Supabase → Auth → Hooks: enable Before User Created → `public.hook_before_user_created`.
5. Google Cloud consent screen: while it's in "Testing" mode, only listed test users can sign
   in. **Publish it.** An app that only asks for email and profile doesn't need Google's
   verification review. Otherwise each new admin has to be added in two places.
6. Run the migration, then the bootstrap insert.
7. Local: in `config.toml`, add `[auth.external.google]` with `env(...)` secrets (kept in a
   gitignored file) and `[auth.hook.before_user_created]`. One Google OAuth client can serve
   both local and DEV if it lists both redirect URIs. PROD should get its own client.
8. Supabase → Auth → Providers → Email: **leave enabled**, because the volunteer account
   needs it. SMTP and email templates aren't needed until magic link is added.

## 8. Testing

The repo has no automated tests today. This work adds automated tests for the **database
only**, because that's where the risk is: RLS, the hook, the triggers and the guards decide who
can read personal data, and a mistake there leaks data without anything looking wrong. The UI
stays on a manual checklist (§8.3).

### 8.1 Database test harness (PR 0)
- **Tool: pgTAP through `supabase test db`.** The CLI runs every `supabase/tests/*.sql` file
  against the local stack. Each file wraps its work in `begin; … rollback;`, so tests leave no
  data behind and don't depend on the seed: each test creates the rows it needs.
- **Acting as each access level.** Tests switch identity without real logins:
  ```sql
  set local role anon;                                   -- client
  set local role authenticated;                          -- volunteer or admin, plus:
  select set_config('request.jwt.claims',
    json_build_object('sub', <user id>, 'email', <email>, 'role', 'authenticated')::text, true);
  ```
  `auth.uid()` and `auth.jwt()` read those claims, so `is_admin()`, `is_volunteer()` and every
  policy behave as they would for a real session. This is why Google sign-in never has to be
  automated.
- **What can't be tested this way.** The Before User Created hook is called by Supabase Auth,
  not by SQL. Tests call `hook_before_user_created(event)` directly with a sample event and
  check its result. The triggers are tested by inserting into `auth.users` as `postgres`. The
  real end-to-end sign-up stays on the manual checklist.
- **Rebuilding the local database: `npm run db:reset`**, a small Node script
  (`scripts/db-reset.mjs`, cross-platform). It resets the local stack's database, applies the
  root `supabase-*.sql` files in the order from `CLAUDE.md`, drops v2's stale `checkin_visitor`
  overload, runs `supabase-seed.sql`, and creates the volunteer auth user through the admin API.
  The ordered file list then lives in one place, the script, and `CLAUDE.md` points to it
  instead of repeating it.
- **`npm run test:db`** runs `supabase test db`. The usual loop is `npm run db:reset` once,
  then `npm run test:db` as often as needed.
- `CLAUDE.md`'s "There is no automated test suite" line is replaced by these two commands.
- **Later, optional:** a GitHub Action on PRs into `dev` that starts the local stack, runs
  `db:reset` and `test:db`. It takes a few minutes per run, so it isn't a blocker.

### 8.2 Automated tests by PR
**PR 0: baseline of today's behavior.** These pin down the current rules so that PR 2's
rewrite can't change anything by accident. When PR 2 changes an expected result on purpose,
the test diff shows exactly which rule changed.
- Client (`anon`) can't select, update or delete `attendees`, `work_orders` or
  `waiver_acceptances`.
- Client can select `events` and can't insert or update them.
- Client can check in through `checkin_visitor`, which creates the attendee, work orders and
  waiver acceptance.
- Client can call `get_fixer_work_order` (it returns the abbreviated name only) and
  `submit_fixer_outcome`.
- A signed-in user can read and update `attendees` and `work_orders`, and create and update
  `events`.

**PR 1: none.** There are no database changes; the email rename is checked manually.

**PR 2: the new model.**
- Hook: an allowlisted email is accepted, case-insensitively. Any other email is rejected
  with our message.
- Insert trigger: a new `auth.users` row creates `app_users` with `disabled = false`. The name
  comes from `full_name`, then `name`, then the email prefix. The allowlist row is removed.
- Login trigger: updating `last_sign_in_at` sets `app_users.last_login_at`.
- `is_admin()` is true for an enabled admin, and false for a disabled admin, the volunteer
  account, a user with no `app_users` row, and `anon`. `is_volunteer()` is true only for the
  volunteer account.
- Personal data (`attendees`, `work_orders`, `waiver_acceptances`): the volunteer and an
  admin can read and update; a disabled admin, a stray authenticated user and `anon` see
  nothing. *(Changes the PR 0 baseline: "signed-in user" now has to be one of the first two.)*
- During the transition, the volunteer account can still create and update `events`.
- `admin_allowlist`: an admin can select, insert and delete. The volunteer, a disabled admin
  and `anon` can't.
- `app_users`: an admin can select and update `name`. Updating `disabled`, `email` or `id`
  directly is refused. The volunteer and `anon` can't select.
- `set_user_disabled` and `delete_app_user`: refused for non-admins, refused on yourself, and
  refused on the last enabled admin. Otherwise they work. Delete removes `app_users` and sets
  `invited_by` to null.
- The client baseline from PR 0 is unchanged.

**PR 3: lockdown.**
- The volunteer account can no longer create or update `events`; an admin can.
- Everything else from PR 2 is unchanged.

**PR 4: none new.** The pages use RPCs and policies already covered in PR 2.

### 8.3 Manual checklist
- Google on the local stack: a Google account whose email isn't on the allowlist is rejected,
  `/admin` shows "not approved", and **no `auth.users` row is created**. An allowlisted account
  signs in, gets an `app_users` row with the Google name, and its allowlist row is removed.
  This is the one end-to-end check of the real hook.
- Testing with many accounts without needing many Google accounts: call
  `supabase.auth.signInWithOtp({ email })` from the browser console. The email lands in Mailpit
  (`localhost:54334`). This also checks that a sign-up from the console is blocked (§3).
- Disabling a user in the UI: `/admin` shows the disabled state. Re-enabling restores access
  without a new invite.
- Deleting a user **on hosted DEV**, because the automated tests only cover the local stack:
  the `auth.users`, `app_users`, sessions and identities rows are gone. Signing in again is
  rejected until the email is re-allowlisted. If the hosted delete fails, switch
  `deleteAppUser` to the Edge Function (§5.2) before PR 4 ships.
- Session collisions: sign in with Google on `/admin`, then open `/queue` in the same browser.
  The admin banner and the header identity show, and **Switch to volunteer account** leads to
  the password gate. The reverse: with the volunteer session, `/admin` shows the
  volunteer-account message.
- Portal links: **Admin →** on `/queue` and **Queue →** on `/admin` both work, signed out, as a
  volunteer, and as an admin, and from the login screens too. An admin crossing over doesn't
  have to sign in again.
- The Admin "View metrics" link works, with both a volunteer session and an admin session.
- Client pages: signed out, `/checkin` and `/fix/:id` still work.
- After the rename, the volunteer password signs in as `volunteer@repaircafe.app`, and a search
  for `staff` in `src/` and the docs finds nothing (applied migration files aside).
- Each PR: `npm run lint`, and `npm run test:db` from PR 0 onward.

## 9. Build order (separate PRs into `dev`)
0. **Database test harness and baseline (§8.1, §8.2).** Add `npm run db:reset`, `npm run
   test:db`, `supabase/tests/`, and the baseline tests of today's rules. Update `CLAUDE.md`.
   There are no app or schema changes, so this can merge at any time, but it must merge before
   PR 2.
1. **Split the routes and rename.** Create `/queue` and `/admin`, both still behind
   `PasswordGate`. Add the **Admin →** / **Queue →** links between them and the "View metrics"
   deep link. Retire "staff" and rename the volunteer account's email (§6.6). There are no
   database changes, so this is low risk and easy to review; the only coordination is the
   email rename at deploy time.
2. **SQL migration (`supabase-admin-auth-migration.sql`).** Tables, hook, triggers, functions,
   and the transition RLS. The volunteer password **keeps** event write access.
   - **First task, before writing the rest: check the hook.** Enable Before User Created on
     both the local stack (`[auth.hook.before_user_created]` in `config.toml`, on the CLI
     version in use) and the **hosted DEV** project's plan, and confirm it rejects a test
     sign-up.
   - **Fallback if the hook isn't available** in either environment: a `BEFORE INSERT`
     trigger on `auth.users` that raises an exception when the email isn't allowlisted. It
     blocks sign-up on any Supabase version. The cost is that Supabase reports a generic
     "Database error saving new user" instead of our message, so `AdminLoginGate` maps that
     error to the "not approved" state. Everything else in the design stays the same.
   - Also try a test `delete_app_user` on hosted DEV here, so the Edge Function decision
     (§5.2) is made early.
   - Add the PR 2 tests from §8.2, and update the baseline tests whose expected results change
     on purpose.
3. **`AdminLoginGate` with Google**, replacing `PasswordGate` on `/admin`, along
   with `supabase-admin-auth-lockdown.sql`, the header identity and the `/queue` admin banner
   (§6.3), plus the lockdown tests from §8.2. Before it ships, the first admin has to be
   bootstrapped in that environment.
4. **Allowlist and Users pages.** Until this ships, invites are SQL inserts. Ship 3 and 4
   together if that's a problem.

## 10. Later: adding magic link
Nothing in the design above changes. The hook, triggers, RLS and `name` fallback already cover
it. The work is:
1. Pick an SMTP provider and account. Resend is the simplest; it needs DNS records on the Repair
   Café domain. Enter it under Supabase → Auth → SMTP in DEV and PROD.
2. Optionally reword the magic-link email template for Repair Café.
3. `store.js`: add `sendMagicLink(email)`, which calls `signInWithOtp` with
   `emailRedirectTo: ${origin}/admin`.
4. `AdminLoginGate`: add the email field and a `link-sent` ("Check your email") state.
