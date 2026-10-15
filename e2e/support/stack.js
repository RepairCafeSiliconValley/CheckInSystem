// Test data and sign-ins for the Playwright suite, against the LOCAL stack only.
//
// Data is created through the service-role key (it bypasses RLS) or through
// the same public RPC the check-in page uses. Every event a test makes is named
// "E2E …", and cleanupE2EData() deletes those events and everything under them.
// Nothing here reads or depends on the seed data.

import { randomUUID } from "node:crypto";
import { localStackEnv, volunteerPassword } from "../../scripts/local-stack.mjs";
import { VOLUNTEER_ACCOUNT_EMAIL, WAIVER_VERSION } from "../../src/lib/constants.js";

export const E2E_PREFIX = "E2E";
const ADMIN_EMAIL_DOMAIN = "e2e.example.com";

const env = localStackEnv();
export const { apiUrl, anonKey } = env;

async function request(path, { key = env.serviceRoleKey, method = "GET", body, prefer } = {}) {
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${apiUrl}${path}`, { method, headers, body: body && JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} failed: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const rest = (path, opts) => request(`/rest/v1/${path}`, opts);

// "2026-10-15" in UTC, the same "today" the queue uses to pick an event.
export const today = () => new Date().toISOString().slice(0, 10);

// A short unique tag so parallel or repeated runs never collide on names.
export const tag = () => randomUUID().slice(0, 6);

// ── Events ──

export async function createEvent(overrides = {}) {
  const [row] = await rest("events", {
    method: "POST",
    prefer: "return=representation",
    body: {
      name: `${E2E_PREFIX} ${tag()}`,
      date: today(),
      location: "E2E Lab",
      is_open: true,
      max_items: 3,
      collect_email: true,
      collect_phone: true,
      collect_weight: false,
      ...overrides,
    },
  });
  return row;
}

export async function updateEvent(id, patch) {
  await rest(`events?id=eq.${id}`, { method: "PATCH", body: patch });
}

export async function getEvent(id) {
  const [row] = await rest(`events?id=eq.${id}&select=*`);
  return row;
}

export async function openEvents() {
  return rest("events?is_open=eq.true&select=id,name");
}

// ── Visitors and work orders ──

// Checks a visitor in through the public RPC, exactly as /checkin does.
// Returns { attendee, orders, baseCode }.
export async function checkIn(eventId, visitor = {}) {
  const v = {
    firstName: `E2E ${tag()}`,
    lastName: "Tester",
    email: null,
    phone: null,
    zip: "95035",
    items: [{ name: "E2E Lamp", description: "Flickers" }],
    newsletter: false,
    ...visitor,
  };
  const result = await request("/rest/v1/rpc/checkin_visitor", {
    key: anonKey,
    method: "POST",
    body: {
      p_event_id: eventId,
      p_first_name: v.firstName,
      p_last_name: v.lastName,
      p_email: v.email,
      p_phone: v.phone,
      p_zip_code: v.zip,
      p_items: v.items.map((it, i) => ({ item_name: it.name, description: it.description, priority: i + 1 })),
      p_waiver_version: WAIVER_VERSION,
      p_waiver_text: "e2e waiver",
      p_waiver_hash: "e2e",
      p_newsletter_opt_in: v.newsletter,
    },
  });
  const orders = await workOrdersFor(eventId, result.baseCode);
  const [attendee] = await rest(`attendees?id=eq.${orders[0].attendee_id}&select=*`);
  return { attendee, orders, baseCode: result.baseCode };
}

// The work orders one check-in created, by its base code, in priority order.
export async function checkInRows(eventId, baseCode) {
  return rest(`work_orders?event_id=eq.${eventId}&code=like.${baseCode}-*&select=*&order=priority`);
}
const workOrdersFor = checkInRows;

export async function countAttendees(eventId, firstName) {
  const rows = await rest(`attendees?event_id=eq.${eventId}&first_name=eq.${encodeURIComponent(firstName)}&select=id`);
  return rows.length;
}

export async function getWorkOrder(id) {
  const [row] = await rest(`work_orders?id=eq.${id}&select=*`);
  return row;
}

export async function getAttendee(id) {
  const [row] = await rest(`attendees?id=eq.${id}&select=*`);
  return row;
}

export async function updateWorkOrder(id, patch) {
  await rest(`work_orders?id=eq.${id}`, { method: "PATCH", body: patch });
}

// Moves an item to "Checked-In" the way Approve & Print does.
export async function markPrinted(id, category = "Electronics") {
  await updateWorkOrder(id, { status: "pending_assignment", printed_at: new Date().toISOString(), category });
}

// ── Sign-ins ──

async function passwordGrant(email, password) {
  return request("/auth/v1/token?grant_type=password", {
    key: anonKey,
    method: "POST",
    body: { email, password },
  });
}

// The URL hash Supabase Auth redirects back with after a sign-in. Opening a
// page with it signs that browser in through the app's real redirect path
// (and, on /admin, counts as "just signed in", which unlocks the portal).
function sessionHash(s) {
  const params = new URLSearchParams({
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    expires_in: String(s.expires_in),
    expires_at: String(s.expires_at ?? Math.floor(Date.now() / 1000) + s.expires_in),
    token_type: "bearer",
    type: "magiclink",
  });
  return `#${params}`;
}

export async function volunteerSessionHash() {
  const password = volunteerPassword();
  if (!password) throw new Error("Set LOCAL_VOLUNTEER_PASSWORD (or the commented line in .env.local) to run the e2e tests.");
  return sessionHash(await passwordGrant(VOLUNTEER_ACCOUNT_EMAIL, password));
}

export function localVolunteerPassword() {
  return volunteerPassword();
}

// Creates an admin the way an invite does: allowlist the email, then create
// the Auth user (the service-role admin API skips the sign-up hook, and the
// insert trigger turns an allowlisted email into an app_users admin).
// Returns { id, email, name, password }.
export async function createAdmin({ name = `E2E Admin ${tag()}`, disabled = false } = {}) {
  const email = `admin-${tag()}@${ADMIN_EMAIL_DOMAIN}`;
  const password = `e2e-${randomUUID()}`;
  await rest("admin_allowlist", { method: "POST", body: { email } });
  const user = await request("/auth/v1/admin/users", {
    method: "POST",
    body: { email, password, email_confirm: true, user_metadata: { full_name: name } },
  });
  if (disabled) await rest(`app_users?id=eq.${user.id}`, { method: "PATCH", body: { disabled: true } });
  return { id: user.id, email, name, password };
}

// A signed-in user who is neither the volunteer nor an admin.
export async function createStrayUser() {
  const email = `stray-${tag()}@${ADMIN_EMAIL_DOMAIN}`;
  const password = `e2e-${randomUUID()}`;
  const user = await request("/auth/v1/admin/users", {
    method: "POST",
    body: { email, password, email_confirm: true },
  });
  return { id: user.id, email, password };
}

export async function sessionHashFor({ email, password }) {
  return sessionHash(await passwordGrant(email, password));
}

export async function getAppUser(id) {
  const [row] = await rest(`app_users?id=eq.${id}&select=*`);
  return row;
}

export async function allowlistHas(email) {
  return (await rest(`admin_allowlist?email=eq.${encodeURIComponent(email)}&select=email`)).length > 0;
}

// ── Cleanup ──

// Deletes every E2E event (and its rows) and every E2E auth user.
export async function cleanupE2EData() {
  const events = await rest(`events?name=like.${E2E_PREFIX}*&select=id`);
  if (events.length) {
    const ids = `(${events.map((e) => e.id).join(",")})`;
    const attendees = await rest(`attendees?event_id=in.${ids}&select=id`);
    if (attendees.length) {
      const attIds = `(${attendees.map((a) => a.id).join(",")})`;
      await rest(`waiver_acceptances?attendee_id=in.${attIds}`, { method: "DELETE" });
    }
    await rest(`work_orders?event_id=in.${ids}`, { method: "DELETE" });
    await rest(`attendees?event_id=in.${ids}`, { method: "DELETE" });
    await rest(`events?id=in.${ids}`, { method: "DELETE" });
  }

  await rest(`admin_allowlist?email=like.*${encodeURIComponent(`@${ADMIN_EMAIL_DOMAIN}`)}`, { method: "DELETE" });
  const { users } = await request("/auth/v1/admin/users?per_page=1000");
  for (const u of users.filter((x) => x.email?.endsWith(`@${ADMIN_EMAIL_DOMAIN}`))) {
    await request(`/auth/v1/admin/users/${u.id}`, { method: "DELETE" });
  }
}
