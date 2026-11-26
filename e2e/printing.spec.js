// Printing modes and reprints (supabase-cloudprnt-migration.sql):
// window.print() with and without the preview, CloudPRNT straight from the
// visitor detail, the REPRINT banner, and the print settings in Configure
// Event. The printer itself is stood in for by writing its check-in row; the
// cloudprnt Edge Function and a real Star printer are covered by
// docs/manual-test-playbook.md.

import { test, expect } from "./support/fixtures.js";
import {
  checkIn,
  createEvent,
  e2eMac,
  getEvent,
  getWorkOrder,
  printerCheckIn,
  printJobsFor,
  setEventPrinter,
  updateWorkOrder,
} from "./support/stack.js";

async function openVisitor(page, asVolunteer, eventId, name) {
  await asVolunteer(`/admin?event=${eventId}`);
  await page.getByText(name).click();
  await expect(page.getByRole("button", { name: "← Queue" })).toBeVisible();
}

// One checked-in item with its category set, ready for Approve & Print.
async function readyVisitor(event, firstName) {
  const v = await checkIn(event.id, { firstName });
  await updateWorkOrder(v.orders[0].id, { category: "Electronics" });
  return v;
}

const printCalls = (page) => page.evaluate(() => window.__printCalls);
const reprintBanner = (page) => page.locator(".print-ticket .reprint-banner");

// ── window.print() ──

test("printed_at keeps the first print, and every later print says REPRINT", async ({ page, event, asVolunteer }) => {
  const v = await readyVisitor(event, "E2E Reprint");
  const id = v.orders[0].id;
  await openVisitor(page, asVolunteer, event.id, "E2E Reprint Tester");

  await page.getByRole("button", { name: "Approve & Print Ticket" }).click();
  await expect(page.locator(".print-ticket")).toHaveCount(1);
  await expect(reprintBanner(page)).toHaveCount(0);

  await page.getByRole("button", { name: /Print/ }).first().click();
  await expect.poll(() => printCalls(page)).toBe(1);
  await expect.poll(async () => (await getWorkOrder(id)).printed_at).not.toBeNull();
  const first = await getWorkOrder(id);
  expect(first.status).toBe("pending_assignment");
  // Printed now, so the next press of Print would be a reprint.
  await expect(reprintBanner(page)).toHaveCount(1);

  // A jammed ticket printed again from the same preview.
  await page.getByRole("button", { name: /Print/ }).first().click();
  await expect.poll(() => printCalls(page)).toBe(2);
  expect((await getWorkOrder(id)).printed_at).toBe(first.printed_at);

  // Reprint from the visitor: REPRINT shows before Print is pressed.
  await page.getByRole("button", { name: "← Client" }).click();
  await page.getByRole("button", { name: /Reprint Ticket/ }).click();
  await expect(reprintBanner(page)).toHaveCount(1);
  await page.getByRole("button", { name: /Print/ }).first().click();
  await expect.poll(() => printCalls(page)).toBe(3);
  expect((await getWorkOrder(id)).printed_at).toBe(first.printed_at);
});

test("window.print() without a preview opens the print dialog at once", async ({ page, asVolunteer }) => {
  const event = await createEvent({ use_legacy_print: true, print_preview: false });
  const v = await readyVisitor(event, "E2E Instant");
  await openVisitor(page, asVolunteer, event.id, "E2E Instant Tester");

  await page.getByRole("button", { name: "Approve & Print Ticket" }).click();
  await expect.poll(() => printCalls(page)).toBe(1);
  await expect.poll(async () => (await getWorkOrder(v.orders[0].id)).printed_at).not.toBeNull();
});

// ── CloudPRNT, no preview ──

test("CloudPRNT with no printer set: the desk is told and nothing is printed", async ({ page, asVolunteer }) => {
  const event = await createEvent({ use_legacy_print: false, print_preview: false });
  const v = await readyVisitor(event, "E2E Noprinter");
  await openVisitor(page, asVolunteer, event.id, "E2E Noprinter Tester");

  await page.getByRole("button", { name: "Approve & Print Ticket" }).click();
  await expect(page.getByRole("alert")).toHaveText("No printer is set up for this event");
  const row = await getWorkOrder(v.orders[0].id);
  expect(row).toMatchObject({ status: "pending", printed_at: null });
  // Still on the visitor, with the button there to try again.
  await expect(page.getByRole("button", { name: "Approve & Print Ticket" })).toBeVisible();
});

test("CloudPRNT with a printer that stopped checking in: No printer detected", async ({ page, asVolunteer }) => {
  const event = await createEvent({ use_legacy_print: false, print_preview: false });
  const mac = e2eMac();
  await setEventPrinter(event.id, mac);
  await printerCheckIn(mac, new Date(Date.now() - 5 * 60 * 1000));
  const v = await readyVisitor(event, "E2E Offline");
  await openVisitor(page, asVolunteer, event.id, "E2E Offline Tester");

  await page.getByRole("button", { name: "Approve & Print Ticket" }).click();
  await expect(page.getByRole("alert")).toContainText("No printer detected");
  expect((await getWorkOrder(v.orders[0].id)).printed_at).toBeNull();
  expect(await printJobsFor(v.orders[0].id)).toHaveLength(0);
});

test("CloudPRNT sends tickets straight to the printer and marks reprints", async ({ page, asVolunteer }) => {
  const event = await createEvent({ use_legacy_print: false, print_preview: false });
  const mac = e2eMac();
  await setEventPrinter(event.id, mac);
  await printerCheckIn(mac);
  const v = await readyVisitor(event, "E2E Cloud");
  const id = v.orders[0].id;
  await openVisitor(page, asVolunteer, event.id, "E2E Cloud Tester");

  await page.getByRole("button", { name: "Approve & Print Ticket" }).click();
  await expect(page.getByRole("status")).toHaveText("Sent 1 ticket to the printer.");
  // No preview, no browser dialog.
  await expect(page.locator(".print-ticket")).toHaveCount(0);
  expect(await printCalls(page)).toBe(0);

  const row = await getWorkOrder(id);
  expect(row).toMatchObject({ status: "pending_assignment" });
  expect(row.printed_at).not.toBeNull();
  let jobs = await printJobsFor(id);
  expect(jobs).toHaveLength(1);
  expect(jobs[0]).toMatchObject({ printer_mac: mac, reprint: false, state: "queued" });
  expect(jobs[0].ticket).toMatchObject({
    work_order_id: id,
    item_name: "E2E Lamp",
    category: "Electronics",
    client_name: "E2E Cloud T.",
  });
  expect(jobs[0].ticket.qr_url).toMatch(/\/T\/[0-9A-F]{16}$/);

  // The screen refreshed: the item is on the board, so Reprint is offered.
  await printerCheckIn(mac);
  await page.getByRole("button", { name: /Reprint Ticket/ }).click();
  await expect(page.getByRole("status")).toHaveText("Sent 1 ticket to the printer.");
  jobs = await printJobsFor(id);
  expect(jobs.map((j) => j.reprint)).toEqual([false, true]);
  expect((await getWorkOrder(id)).printed_at).toBe(row.printed_at);
});

test("CloudPRNT with the preview: Print sends the shown tickets", async ({ page, asVolunteer }) => {
  const event = await createEvent({ use_legacy_print: false, print_preview: true });
  const mac = e2eMac();
  await setEventPrinter(event.id, mac);
  await printerCheckIn(mac);
  const v = await readyVisitor(event, "E2E Cloudpreview");
  await openVisitor(page, asVolunteer, event.id, "E2E Cloudpreview Tester");

  await page.getByRole("button", { name: "Approve & Print Ticket" }).click();
  await expect(page.locator(".print-ticket")).toHaveCount(1);
  await page.getByRole("button", { name: /Print/ }).first().click();
  await expect(page.getByRole("status")).toHaveText("Sent 1 ticket to the printer.");
  expect(await printCalls(page)).toBe(0);
  expect(await printJobsFor(v.orders[0].id)).toHaveLength(1);
});

// ── Configure Event ──

const eventCard = (page, name) =>
  page.locator("div").filter({ has: page.getByText(name, { exact: true }) }).filter({ has: page.getByRole("button", { name: "Configure Event" }) }).last();

test("Configure Event saves the print settings and the printer's MAC address", async ({ page, event, asAdmin }) => {
  const mac = e2eMac();
  await printerCheckIn(mac);
  await asAdmin("/admin?tab=events");
  const configure = () => eventCard(page, event.name).getByRole("button", { name: "Configure Event" }).click();

  await configure();
  const legacy = page.getByLabel("Use legacy window.print()");
  await expect(legacy).toBeChecked();
  await expect(page.getByLabel("Enable print preview")).toBeChecked();
  // The MAC only matters for CloudPRNT.
  await expect(page.getByLabel("Printer MAC address")).toHaveCount(0);
  await legacy.uncheck();
  await page.getByLabel("Enable print preview").uncheck();

  await page.getByLabel("Printer MAC address").fill("not-a-mac");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("alert")).toContainText("12 hex digits");

  // Typed with dashes and capitals; stored canonical. It checked in just now.
  await page.getByLabel("Printer MAC address").fill(mac.toUpperCase().replace(/:/g, "-"));
  await expect(page.getByText(/Online — last checked in/)).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();
  await expect.poll(async () => getEvent(event.id)).toMatchObject({
    use_legacy_print: false,
    print_preview: false,
  });

  await configure();
  await expect(page.getByLabel("Printer MAC address")).toHaveValue(mac);
});
