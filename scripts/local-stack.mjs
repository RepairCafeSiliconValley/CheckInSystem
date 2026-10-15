// Shared helpers for scripts that talk to the LOCAL Supabase stack
// (db-reset.mjs and the Playwright tests in e2e/).
//
// Everything here refuses to run against anything but localhost, so a stray
// .env.local pointing at DEV or PROD can't redirect a reset or a test run.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const LOCAL_URL = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;

export function supabaseCli(args) {
  // One command string under a shell, so Windows resolves supabase.cmd.
  // The arguments are fixed strings from the callers.
  return spawnSync(`supabase ${args.join(" ")}`, { cwd: ROOT, encoding: "utf8", shell: true });
}

// API_URL, ANON_KEY and SERVICE_ROLE_KEY of the running local stack, from
// `supabase status`. Throws if the stack isn't running or isn't local.
export function localStackEnv() {
  const status = supabaseCli(["status", "-o", "env"]);
  const env = Object.fromEntries(
    (status.stdout || "")
      .split("\n")
      .map((line) => line.match(/^(\w+)="?([^"]*)"?$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  );
  if (!env.API_URL || !env.ANON_KEY || !env.SERVICE_ROLE_KEY) {
    throw new Error("Couldn't read the local stack from `supabase status`. Is it running? Try `supabase start`.");
  }
  if (!LOCAL_URL.test(env.API_URL)) {
    throw new Error(`Refusing to use ${env.API_URL}: only a local stack is allowed.`);
  }
  return { apiUrl: env.API_URL, anonKey: env.ANON_KEY, serviceRoleKey: env.SERVICE_ROLE_KEY };
}

// The local volunteer password: LOCAL_VOLUNTEER_PASSWORD from the environment,
// or a `LOCAL_VOLUNTEER_PASSWORD=` line in .env.local, commented or not.
export function volunteerPassword() {
  if (process.env.LOCAL_VOLUNTEER_PASSWORD) return process.env.LOCAL_VOLUNTEER_PASSWORD;
  const envFile = join(ROOT, ".env.local");
  if (!existsSync(envFile)) return null;
  const match = readFileSync(envFile, "utf8").match(/^#?\s*LOCAL_VOLUNTEER_PASSWORD=(\S+)/m);
  return match ? match[1] : null;
}
