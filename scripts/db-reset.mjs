#!/usr/bin/env node
// Rebuilds the LOCAL Supabase database from the root supabase-*.sql files.
//
//   npm run db:reset
//
// 1. `supabase db reset --local --no-seed`: wipes the local database,
//    including Auth users. supabase/migrations/ is unused, so this leaves an
//    empty public schema.
// 2. Applies MIGRATIONS below, in order, with psql inside the local DB
//    container.
// 3. Drops v2's stale checkin_visitor overload (see CLAUDE.md).
// 4. Runs supabase-seed.sql.
// 5. Recreates the shared queue login (admin@repaircafe.app) through the Auth
//    admin API, with the password from LOCAL_STAFF_PASSWORD (environment, or
//    a `LOCAL_STAFF_PASSWORD=` line in .env.local, commented or not).
//
// Only ever touches the local stack: the reset is --local, and SQL goes to
// the local container by name.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// The order that actually applies, by function dependencies. This list is
// the source of truth; CLAUDE.md points here.
const MIGRATIONS = [
  "supabase-migration.sql",
  "supabase-rls-migration.sql",
  "supabase-migration-v2.sql",
  "supabase-migration-v3.sql",
  "supabase-migration-v4.sql",
  "supabase-migration-v5.sql",
  "supabase-pii-rls-fix.sql", // alters v4's 10-arg checkin_visitor
  "supabase-newsletter-opt-in-migration.sql", // v6 drops its 11-arg overload
  "supabase-migration-v6.sql",
  "supabase-status-overhaul.sql", // V7
  "supabase-migration-v8.sql",
  "supabase-metrics-migration.sql",
  "supabase-reason-notes-migration.sql",
];

const SEED = "supabase-seed.sql";
const STAFF_EMAIL = "admin@repaircafe.app";

// v2 leaves this overload behind; it references the dropped `name` column.
const DROP_STALE_OVERLOAD =
  "drop function if exists public.checkin_visitor(uuid, text, text, jsonb, text, text, text, text, text);";

function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

function projectId() {
  const config = readFileSync(join(ROOT, "supabase", "config.toml"), "utf8");
  const match = config.match(/^project_id\s*=\s*"([^"]+)"/m);
  if (!match) fail("No project_id in supabase/config.toml.");
  return match[1];
}

// Errors that replaying the chain on a fresh database always prints, because
// supabase-migration.sql has since been edited to include later columns.
const EXPECTED_ERRORS = [
  /already exists/,
  // v4 backfills first_name/last_name from an attendees.name column that the
  // current base migration no longer creates.
  /column "name"( of relation "attendees")? does not exist/,
];

function supabase(args) {
  // One command string under a shell, so Windows resolves supabase.cmd.
  // The arguments are fixed strings from this file.
  return spawnSync(`supabase ${args.join(" ")}`, { cwd: ROOT, encoding: "utf8", shell: true });
}

function psql(container, sql, label) {
  const result = spawnSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-q", "-v", "ON_ERROR_STOP=0"],
    { input: sql, encoding: "utf8" },
  );
  if (result.error) fail(`Couldn't run docker: ${result.error.message}`);
  const errors = (result.stderr || "")
    .split("\n")
    .filter((line) => /ERROR/.test(line) && !EXPECTED_ERRORS.some((re) => re.test(line)));
  console.log(`  ${errors.length ? "⚠" : "✓"} ${label}`);
  errors.forEach((line) => console.log(`      ${line.trim()}`));
  return errors.length;
}

function staffPassword() {
  if (process.env.LOCAL_STAFF_PASSWORD) return process.env.LOCAL_STAFF_PASSWORD;
  const envFile = join(ROOT, ".env.local");
  if (!existsSync(envFile)) return null;
  const match = readFileSync(envFile, "utf8").match(/^#?\s*LOCAL_STAFF_PASSWORD=(\S+)/m);
  return match ? match[1] : null;
}

async function createStaffUser() {
  const password = staffPassword();
  if (!password) {
    console.log(`  ⚠ Skipped ${STAFF_EMAIL}: set LOCAL_STAFF_PASSWORD to create it.`);
    return;
  }
  const status = supabase(["status", "-o", "env"]);
  const env = Object.fromEntries(
    (status.stdout || "")
      .split("\n")
      .map((line) => line.match(/^(\w+)="?([^"]*)"?$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  );
  if (!env.API_URL || !env.SERVICE_ROLE_KEY) fail("Couldn't read API_URL / SERVICE_ROLE_KEY from `supabase status`.");
  if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(env.API_URL)) fail(`Refusing to create users on ${env.API_URL}.`);

  const res = await fetch(`${env.API_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: env.SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: STAFF_EMAIL, password, email_confirm: true }),
  });
  if (!res.ok) fail(`Creating ${STAFF_EMAIL} failed: ${res.status} ${await res.text()}`);
  console.log(`  ✓ Created ${STAFF_EMAIL}`);
}

const container = `supabase_db_${projectId()}`;

console.log("Resetting the local database…");
const reset = supabase(["db", "reset", "--local", "--no-seed"]);
if (reset.status !== 0) fail(`supabase db reset failed:\n${reset.stdout}${reset.stderr}`);
console.log("  ✓ supabase db reset --local");

console.log("Applying migrations…");
let problems = 0;
for (const file of MIGRATIONS) {
  problems += psql(container, readFileSync(join(ROOT, file), "utf8"), file);
}
problems += psql(container, DROP_STALE_OVERLOAD, "drop stale checkin_visitor overload");

console.log("Seeding…");
problems += psql(container, readFileSync(join(ROOT, SEED), "utf8"), SEED);

console.log("Auth…");
await createStaffUser();

console.log(problems ? `\nDone, with ${problems} unexpected error line(s) above.` : "\nDone.");
process.exit(problems ? 1 : 0);
