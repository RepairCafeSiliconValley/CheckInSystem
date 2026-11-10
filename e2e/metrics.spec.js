// Playbook §7: Metrics, its event picker, the summary and both CSV exports.
// The arithmetic itself is unit-tested (tests/unit/metrics.test.js); these
// check that the screens load the right rows and agree with each other.

import { readFile } from "node:fs/promises";
import { test, expect } from "./support/fixtures.js";
import { checkIn, createEvent, markPrinted, updateWorkOrder } from "./support/stack.js";

const done = (outcome, extra = {}) => ({ status: "completed", outcome, completed_at: new Date().toISOString(), ...extra });
const cancel = (reason) => ({ status: "canceled", outcome: null, cancel_reason: reason, completed_at: new Date().toISOString() });

// 4 clients, 6 items: Fixed + Not Fixed (Other), one Submitted, Taken Home +
// cancelled (Client left), and one client whose only item was cancelled.
async function seedEvent() {
  const event = await createEvent({ collect_weight: true });
  const a = await checkIn(event.id, {
    firstName: "E2E Alice", email: "alice@example.com", phone: "4085550101", newsletter: true,
    items: [{ name: "E2E Lamp", description: "x" }, { name: "E2E Toaster", description: "y" }],
  });
  await checkIn(event.id, { firstName: "E2E Bob", zip: "94040" });
  const c = await checkIn(event.id, {
    firstName: "E2E Carol", zip: "95112",
    items: [{ name: "E2E Radio", description: "x" }, { name: "E2E Jacket", description: "y" }],
  });
  const d = await checkIn(event.id, { firstName: "E2E Dan" });

  await markPrinted(a.orders[0].id, "Electronics");
  await updateWorkOrder(a.orders[0].id, done("Fixed", { fixer_name: "E2E Pat", weight_kg: 2.5 }));
  await markPrinted(a.orders[1].id, "Electronics");
  await updateWorkOrder(a.orders[1].id, done("Not Fixed", { not_fixed_reason: "Other", not_fixed_note: "E2E repair note", fixer_name: "e2e pat", weight_kg: 1.2 }));
  await markPrinted(c.orders[0].id, "Bikes");
  await updateWorkOrder(c.orders[0].id, done("Taken Home", { fixer_name: "E2E Sam" }));
  await updateWorkOrder(c.orders[1].id, cancel("Client left"));
  await updateWorkOrder(d.orders[0].id, cancel("Never Checked In"));
  return event;
}

async function copiedSummary(page) {
  await page.getByRole("button", { name: "Copy summary" }).click();
  await expect(page.getByRole("button", { name: "Copied ✓" })).toBeVisible();
  return page.evaluate(() => navigator.clipboard.readText());
}

test("metrics for one event match the rows and the queue", async ({ page, asVolunteer }) => {
  const event = await seedEvent();
  await asVolunteer(`/admin?tab=metrics&event=${event.id}`);
  await expect(page.getByRole("heading", { name: "Metrics" })).toBeVisible();
  await expect(page.getByText("· Live", { exact: true })).toBeVisible();
  await expect(page.getByText("Right now")).toBeVisible();

  const summary = await copiedSummary(page);
  for (const line of [
    `${event.name} — `,
    "4 clients (1 had every item cancelled)",
    "6 items (2 cancelled)",
    "1 Submitted",
    "0 Checked-In",
    "0 With Fixer",
    "3 Completed",
    "2 Cancelled",
    "Outcomes (of 3 completed items)",
    "1 Fixed — 33%",
    "0 Diagnosed — 0%",
    "1 Not Fixed — 33%",
    "1 Taken Home — 33%",
    "2.5 kg kept out of landfill (items fixed)",
    "3.7 kg handled in total",
    "1 Client left",
    "1 Never Checked In",
    "2 fixers recorded outcomes",
  ]) {
    expect(summary).toContain(line);
  }

  // The queue counts the same rows.
  await page.getByRole("button", { name: "Open this event in the queue →" }).click();
  await expect(page.getByRole("button", { name: "All (6)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Completed (3)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancelled (2)" })).toBeVisible();
  await expect(page.getByText("(1 waiting)")).toBeVisible();
});

test("metrics update live when a visitor checks in", async ({ page, event, asVolunteer }) => {
  await checkIn(event.id, { firstName: "E2E One" });
  await asVolunteer(`/admin?tab=metrics&event=${event.id}`);
  expect(await copiedSummary(page)).toContain("1 client");
  await checkIn(event.id, { firstName: "E2E Two" });
  await expect.poll(async () => copiedSummary(page), { timeout: 15_000 }).toContain("2 clients");
});

test("event picker: add an event, clear, select all, and back to one", async ({ page, event, asVolunteer }) => {
  const second = await createEvent();
  await checkIn(second.id, { firstName: "E2E Second" });
  await asVolunteer(`/admin?tab=metrics&event=${event.id}`);

  const picker = page.getByRole("button", { name: event.name });
  await picker.click();
  await expect(page.getByRole("button", { name: "Select all" })).toBeVisible();
  await page.getByLabel(new RegExp(`^${second.name} — `)).check();
  await expect(page.getByRole("button", { name: /events selected|· 2 events/ })).toBeVisible();
  await expect(page.getByText("By event")).toBeVisible();

  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByText("No events selected — pick some from the menu above.")).toBeVisible();

  // The picker panel's own "Select all" (the empty state has a second one).
  await page.getByRole("button", { name: "Select all" }).first().click();
  await expect(page.getByText("All time", { exact: false }).first()).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Select all" })).toHaveCount(0);

  // "By event" rows narrow the scope to that one event.
  await page.getByText(second.name, { exact: true }).last().click();
  await expect(page.getByRole("button", { name: second.name })).toBeVisible();
});

test("work-order CSV: one row per item, the right columns, no personal data", async ({ page, asVolunteer }) => {
  const event = await seedEvent();
  await asVolunteer(`/admin?tab=metrics&event=${event.id}`);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(new RegExp(`^${event.name.replace(/ /g, "-")}.*-items-\\d{4}-\\d{2}-\\d{2}\\.csv$`));

  const csv = await readFile(await download.path(), "utf8");
  const [header, ...rows] = csv.trim().split("\n");
  expect(header.split(",")).toEqual([
    "Event Name", "Event Date", "Event ID", "Work Order ID", "Code",
    "Attendee ID", "Zip Code", "Volunteer",
    "Item Name", "Category", "Priority", "Status", "Status Label", "Outcome",
    "Cancel Reason", "Cancel Note", "Not Fixed Reason", "Not Fixed Note", "Fixer", "Weight (kg)",
    "Created At", "Printed At", "Completed At",
  ]);
  expect(rows).toHaveLength(6);
  // Notes are exported on purpose (free text after "Other"; the UI asks for no
  // names or contact details), but names, emails and phones never are.
  for (const secret of ["E2E Alice", "Tester", "alice@example.com", "4085550101"]) {
    expect(csv).not.toContain(secret);
  }
  const cancelled = rows.find((r) => r.includes("Client left")).split(",");
  expect(cancelled[12]).toBe("Cancelled"); // Status Label
  expect(cancelled[13]).toBe(""); // Outcome stays empty on a cancel
  const notFixed = rows.find((r) => r.includes("E2E repair note")).split(",");
  expect(notFixed[16]).toBe("Other"); // Not Fixed Reason
  expect(notFixed[17]).toBe("E2E repair note"); // Not Fixed Note
});

test("attendee CSV from the Events tab has one row per client with newsletter flags", async ({ page, asAdmin }) => {
  const event = await createEvent();
  await checkIn(event.id, { firstName: "E2E Alice", email: "alice@example.com", newsletter: true });
  await checkIn(event.id, { firstName: "E2E Bob" });
  await asAdmin("/admin?tab=events");
  const card = page.locator("div").filter({ has: page.getByText(event.name, { exact: true }) })
    .filter({ has: page.getByRole("button", { name: "Export Attendees" }) }).last();

  const downloadPromise = page.waitForEvent("download");
  await card.getByRole("button", { name: "Export Attendees" }).click();
  const csv = await readFile(await (await downloadPromise).path(), "utf8");
  const [header, ...rows] = csv.trim().split("\n");
  expect(header).toBe("First Name,Last Name,Email,Phone,Zip Code,Volunteer,Newsletter,Checked In");
  expect(rows).toHaveLength(2);
  expect(rows.find((r) => r.startsWith("E2E Alice"))).toContain("alice@example.com,,95035,No,Yes");
  expect(rows.find((r) => r.startsWith("E2E Bob"))).toContain(",No,No,");
});
