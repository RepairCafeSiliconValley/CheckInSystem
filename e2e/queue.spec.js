// Playbook §2 (volunteer sign-in) and §4: the queue, visitor detail and printing.

import { test, expect } from "./support/fixtures.js";
import {
  checkIn,
  checkInRows,
  createEvent,
  getAttendee,
  getWorkOrder,
  localVolunteerPassword,
  markPrinted,
  updateEvent,
  updateWorkOrder,
} from "./support/stack.js";

// ── Volunteer sign-in ──

test("volunteer password gate: wrong, then right, then reload and logout", async ({ page }) => {
  await page.goto("/admin");
  const password = page.getByLabel("Volunteer password");
  await password.fill("definitely-wrong");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByText("Incorrect password.")).toBeVisible();
  await password.fill("x");
  await expect(page.getByText("Incorrect password.")).toHaveCount(0);

  await password.fill(localVolunteerPassword());
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByText("Volunteer account")).toBeVisible();
  await expect(page.getByRole("button", { name: "Queue" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Metrics" })).toBeVisible();

  await page.reload();
  await expect(page.getByText("Volunteer account")).toBeVisible();

  await page.getByRole("button", { name: /Logout/ }).click();
  await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();
});

// ── Queue list ──

const chip = (page, label) => page.getByRole("button", { name: new RegExp(`^${label} \\(\\d+\\)$`) });

test("queue lists visitors newest first with counts, chips and contact line", async ({ page, event, asVolunteer }) => {
  const a = await checkIn(event.id, {
    firstName: "E2E Alice", email: "alice@example.com", phone: "4085550101", zip: "95035",
    items: [{ name: "E2E Lamp", description: "x" }, { name: "E2E Toaster", description: "y" }],
  });
  await checkIn(event.id, { firstName: "E2E Bob", zip: "94040", items: [{ name: "E2E Bike", description: "z" }] });

  await asVolunteer(`/admin?event=${event.id}`);
  await expect(page.getByText(`2 clients`)).toBeVisible();
  await expect(page.getByText("(2 waiting)")).toBeVisible();
  await expect(chip(page, "All")).toHaveText("All (3)");
  await expect(chip(page, "Submitted")).toHaveText("Submitted (3)");
  for (const label of ["Checked-In", "With Fixer", "Completed", "Cancelled"]) {
    await expect(chip(page, label)).toHaveText(`${label} (0)`);
  }

  const names = page.getByText(/^E2E (Alice|Bob) Tester$/);
  await expect(names).toHaveText(["E2E Bob Tester", "E2E Alice Tester"]);
  await expect(page.getByText("alice@example.com · 4085550101 · 95035")).toBeVisible();
  await expect(page.getByText(`${a.baseCode}-1`)).toBeVisible();
  await expect(page.getByText("P2")).toBeVisible();
});

test("a new check-in appears live without reloading", async ({ page, event, asVolunteer }) => {
  await checkIn(event.id, { firstName: "E2E First" });
  await asVolunteer(`/admin?event=${event.id}`);
  await expect(page.getByText("E2E First Tester")).toBeVisible();
  await checkIn(event.id, { firstName: "E2E Live" });
  await expect(page.getByText("E2E Live Tester")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("2 clients")).toBeVisible();
});

test("search matches name, email, phone, zip, code and item, case-insensitively", async ({ page, event, asVolunteer }) => {
  const a = await checkIn(event.id, {
    firstName: "E2E Alice", email: "alice@example.com", phone: "4085550101", zip: "95035",
    items: [{ name: "E2E Toaster", description: "x" }],
  });
  await checkIn(event.id, { firstName: "E2E Bob", zip: "94040", items: [{ name: "E2E Bike", description: "z" }] });
  await asVolunteer(`/admin?event=${event.id}`);

  const search = page.getByPlaceholder("Search by name, email, phone, code, or item...");
  for (const q of ["e2e alice", "ALICE@EXAMPLE", "555010", "95035", `${a.baseCode}-1`.toLowerCase(), "toaster"]) {
    await search.fill(q);
    await expect(page.getByText("E2E Alice Tester")).toBeVisible();
    await expect(page.getByText("E2E Bob Tester")).toHaveCount(0);
  }
  await search.fill("zzzz-no-match");
  await expect(page.getByText("No results found.")).toBeVisible();
  await search.fill("");
  await chip(page, "Completed").click();
  await expect(page.getByText("No visitors in this category.")).toBeVisible();
});

test("switching events reloads the list for that event", async ({ page, event, asVolunteer }) => {
  const other = await createEvent();
  await checkIn(event.id, { firstName: "E2E Here" });
  await checkIn(other.id, { firstName: "E2E There" });
  await asVolunteer(`/admin?event=${event.id}`);
  await expect(page.getByText("E2E Here Tester")).toBeVisible();
  await page.locator("select").first().selectOption(other.id);
  await expect(page.getByText("E2E There Tester")).toBeVisible();
  await expect(page.getByText("E2E Here Tester")).toHaveCount(0);
});

// ── Visitor detail ──

async function openVisitor(page, asVolunteer, eventId, name) {
  await asVolunteer(`/admin?event=${eventId}`);
  await page.getByText(name).click();
  await expect(page.getByRole("button", { name: "← Queue" })).toBeVisible();
}

test("editing the client saves on blur and shows on the queue", async ({ page, event, asVolunteer }) => {
  const v = await checkIn(event.id, { firstName: "E2E Edit" });
  await openVisitor(page, asVolunteer, event.id, "E2E Edit Tester");
  await page.getByLabel("Last Name").fill("Tester2");
  await page.getByLabel("Zip Code").click();
  await expect(page.getByText("Saved")).toBeVisible();
  await expect.poll(async () => (await getAttendee(v.attendee.id)).last_name).toBe("Tester2");
  await page.getByRole("button", { name: "← Queue" }).click();
  await expect(page.getByText("E2E Edit Tester2")).toBeVisible();
});

test("volunteer flag toggles the VOL tag", async ({ page, event, asVolunteer }) => {
  const v = await checkIn(event.id, { firstName: "E2E Vol" });
  await openVisitor(page, asVolunteer, event.id, "E2E Vol Tester");
  // The box is controlled by the saved row, so it flips once the save lands.
  await page.getByLabel("Volunteer").click();
  await expect(page.getByLabel("Volunteer")).toBeChecked();
  await expect(page.getByText("VOL", { exact: true })).toBeVisible();
  await expect.poll(async () => (await getAttendee(v.attendee.id)).is_volunteer).toBe(true);
  await page.getByRole("button", { name: "← Queue" }).click();
  await expect(page.getByText("VOL", { exact: true })).toBeVisible();
});

test("detail shows email, phone and weight per the event's current settings", async ({ page, event, asVolunteer }) => {
  await checkIn(event.id, { firstName: "E2E Settings" });
  await updateEvent(event.id, { collect_email: false, collect_phone: false, collect_weight: false });
  await openVisitor(page, asVolunteer, event.id, "E2E Settings Tester");
  await expect(page.getByLabel("Email")).toHaveCount(0);
  await expect(page.getByLabel("Cell Phone")).toHaveCount(0);
  await expect(page.getByLabel("Weight (kg)")).toHaveCount(0);

  await updateEvent(event.id, { collect_email: true, collect_phone: true, collect_weight: true });
  await page.reload();
  await page.getByText("E2E Settings Tester").click();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Cell Phone")).toBeVisible();
  await expect(page.getByLabel("Weight (kg)")).toBeVisible();
});

test("item edits and weights save; a cleared weight stores nothing", async ({ page, asVolunteer }) => {
  const event = await createEvent({ collect_weight: true });
  const v = await checkIn(event.id, {
    firstName: "E2E Items",
    items: [{ name: "E2E Lamp", description: "x" }, { name: "E2E Fan", description: "y" }],
  });
  await openVisitor(page, asVolunteer, event.id, "E2E Items Tester");

  await page.getByLabel("Item Name").first().fill("E2E Desk Lamp");
  await page.getByLabel("Issue").first().fill("Flickers badly");
  await page.getByLabel("Weight (kg)").first().fill("2.5");
  await page.getByLabel("Weight (kg)").nth(1).fill("1.2");
  await page.getByLabel("First Name").click(); // blur
  await expect.poll(async () => getWorkOrder(v.orders[0].id)).toMatchObject({
    item_name: "E2E Desk Lamp", description: "Flickers badly", weight_kg: 2.5,
  });
  await expect.poll(async () => (await getWorkOrder(v.orders[1].id)).weight_kg).toBe(1.2);

  // A number input won't take letters; clearing it means "not weighed".
  await page.getByLabel("Weight (kg)").nth(1).fill("");
  await page.getByLabel("First Name").click();
  await expect.poll(async () => (await getWorkOrder(v.orders[1].id)).weight_kg).toBe(null);
});

// ── Approve & Print ──

test("approve & print needs every category, then prints and marks items Checked-In", async ({ page, event, asVolunteer }) => {
  const v = await checkIn(event.id, {
    firstName: "E2E Print",
    items: [{ name: "E2E Lamp", description: "Flickers" }, { name: "E2E Radio", description: "No sound" }],
  });
  await openVisitor(page, asVolunteer, event.id, "E2E Print Tester");

  const approve = page.getByRole("button", { name: "Approve & Print All Tickets" });
  await expect(approve).toBeDisabled();
  await expect(page.getByText("Assign a category to each item before printing")).toBeVisible();

  await page.getByLabel("Category").first().selectOption("Basic Appliances / Lamp");
  await expect.poll(async () => (await getWorkOrder(v.orders[0].id)).category).toBe("Basic Appliances / Lamp");
  await expect(approve).toBeDisabled();
  await page.getByLabel("Category").nth(1).selectOption("Electronics");
  await expect(approve).toBeEnabled();
  await approve.click();

  await expect(page.getByText("Preview of 2 tickets that will be printed and pinned to the board.")).toBeVisible();
  await expect(page.getByText("E2E Print T.").first()).toBeVisible();
  await expect(page.getByText("E2E Print Tester")).toHaveCount(0);
  await expect(page.locator(".print-ticket")).toHaveCount(2);
  await expect(page.locator(".print-ticket svg")).toHaveCount(2); // one QR per ticket
  // The short upper-case /T/ link makes a 29×29 code; a link carrying the full
  // UUID made 37×37 at this origin. qrcode.react draws one viewBox unit per
  // module, with no margin.
  await expect(page.locator(".print-ticket svg").first()).toHaveAttribute("viewBox", "0 0 29 29");

  await page.getByRole("button", { name: /Print/ }).click();
  await expect.poll(() => page.evaluate(() => window.__printCalls)).toBe(1);

  for (const o of v.orders) {
    const row = await getWorkOrder(o.id);
    expect(row.status).toBe("pending_assignment");
    expect(row.printed_at).not.toBeNull();
  }

  await page.getByRole("button", { name: "← Client" }).click();
  await expect(page.getByRole("button", { name: /Reprint Tickets/ })).toBeVisible();
  // Printing moved the items to Checked-In, which is what offers the outcome
  // action. The panel itself is collapsed behind this button.
  await expect(
    page.getByRole("button", { name: "✅ Record Outcome" }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "← Queue" }).click();
  await expect(chip(page, "Checked-In")).toHaveText("Checked-In (2)");
  await expect(page.getByText("(1 waiting)")).toBeVisible();
});

// ── Items added at the desk ──

const addExtraButton = (page) => page.getByRole("button", { name: "Add one more item", exact: true });

// Fills the Add Item form, whose fields come after every item card's.
async function addExtra(page, name, category, issue) {
  await addExtraButton(page).click();
  const add = page.getByRole("button", { name: "Save item" });
  await expect(add).toBeDisabled();
  // The form takes the cursor, so the desk can start typing straight away.
  await expect(page.getByLabel("Item Name").last()).toBeFocused();
  await page.getByLabel("Item Name").last().fill(name);
  await page.getByLabel("Category").last().selectOption(category);
  await expect(add).toBeDisabled();
  await page.getByLabel("Issue").last().fill(issue);
  await add.click();
  await expect(page.getByRole("heading", { name: "Add Item", exact: true })).toHaveCount(0);
}

test("at the limit, the desk adds items over it and they print with the others", async ({ page, asVolunteer }) => {
  const event = await createEvent({ max_items: 2 });
  const v = await checkIn(event.id, {
    firstName: "E2E Extra",
    items: [{ name: "E2E Lamp", description: "Flickers" }, { name: "E2E Radio", description: "No sound" }],
  });
  await openVisitor(page, asVolunteer, event.id, "E2E Extra Tester");

  // Never mind closes the form without writing anything.
  await addExtraButton(page).click();
  await expect(page.getByRole("heading", { name: "Add Item", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Never mind" }).click();
  await expect(page.getByRole("heading", { name: "Add Item", exact: true })).toHaveCount(0);
  expect(await checkInRows(event.id, v.baseCode)).toHaveLength(2);

  await addExtra(page, "E2E Toaster", "Electronics", "No heat");
  await expect(page.getByText(`${v.baseCode}-3`)).toBeVisible();
  await expect(page.getByLabel("Category")).toHaveCount(3);
  await expect(page.getByLabel("Category").last()).toHaveValue("Electronics");

  // There is no cap: the button stays, and a second extra follows the first.
  await addExtra(page, "E2E Bike", "Bikes", "Flat tire");
  await expect(page.getByText(`${v.baseCode}-4`)).toBeVisible();
  await expect(addExtraButton(page)).toBeVisible();

  await page.getByLabel("Category").first().selectOption("Basic Appliances / Lamp");
  await page.getByLabel("Category").nth(1).selectOption("Electronics");
  await page.getByRole("button", { name: "Approve & Print All Tickets" }).click();
  await expect(page.locator(".print-ticket")).toHaveCount(4);

  const rows = await checkInRows(event.id, v.baseCode);
  expect(rows.map((r) => [r.code, r.priority, r.status])).toEqual([
    [`${v.baseCode}-1`, 1, "pending_assignment"],
    [`${v.baseCode}-2`, 2, "pending_assignment"],
    [`${v.baseCode}-3`, 3, "pending_assignment"],
    [`${v.baseCode}-4`, 4, "pending_assignment"],
  ]);
  expect(rows[2]).toMatchObject({ item_name: "E2E Toaster", category: "Electronics", description: "No heat" });
  expect(rows[3]).toMatchObject({ item_name: "E2E Bike", category: "Bikes", description: "Flat tire" });
});

test("below the limit, even with one item, the desk can add another", async ({ page, asVolunteer }) => {
  const event = await createEvent({ max_items: 2 });
  const one = await checkIn(event.id, { firstName: "E2E Below" });
  // Two checked in, one canceled.
  const canceled = await checkIn(event.id, {
    firstName: "E2E Canceled",
    items: [{ name: "E2E Lamp", description: "x" }, { name: "E2E Fan", description: "y" }],
  });
  await updateWorkOrder(canceled.orders[1].id, { status: "canceled", cancel_reason: "client_left" });

  await asVolunteer(`/admin?event=${event.id}`);
  await page.getByText("E2E Below Tester").click();
  await addExtra(page, "E2E Toaster", "Electronics", "No heat");
  await expect(page.getByText(`${one.baseCode}-2`)).toBeVisible();
  await expect(addExtraButton(page)).toBeVisible();
  await page.getByRole("button", { name: "← Queue" }).click();

  await page.getByText("E2E Canceled Tester").click();
  await expect(addExtraButton(page)).toBeVisible();

  const rows = await checkInRows(event.id, one.baseCode);
  expect(rows.map((r) => [r.code, r.item_name, r.status])).toEqual([
    [`${one.baseCode}-1`, "E2E Lamp", "pending"],
    [`${one.baseCode}-2`, "E2E Toaster", "pending"],
  ]);
});

test("after printing, an extra item can still be added and prints on its own", async ({ page, asVolunteer }) => {
  const event = await createEvent({ max_items: 2 });
  const v = await checkIn(event.id, {
    firstName: "E2E Late",
    items: [{ name: "E2E Lamp", description: "Flickers" }, { name: "E2E Radio", description: "No sound" }],
  });
  await openVisitor(page, asVolunteer, event.id, "E2E Late Tester");
  await page.getByLabel("Category").first().selectOption("Basic Appliances / Lamp");
  await page.getByLabel("Category").nth(1).selectOption("Electronics");
  await page.getByRole("button", { name: "Approve & Print All Tickets" }).click();
  await expect(page.locator(".print-ticket")).toHaveCount(2);

  // Back from the print preview to the client: the option is still there.
  await page.getByRole("button", { name: "← Client" }).click();
  await expect(addExtraButton(page)).toBeVisible();
  await addExtra(page, "E2E Toaster", "Electronics", "No heat");
  await expect(page.getByText(`${v.baseCode}-3`)).toBeVisible();
  await expect(addExtraButton(page)).toBeVisible();

  // Only the new item's ticket prints; the first two are already on the board.
  await page.getByRole("button", { name: "Approve & Print Ticket" }).click();
  await expect(page.locator(".print-ticket")).toHaveCount(1);
  await expect(page.locator(".print-ticket").getByText("E2E Toaster")).toBeVisible();

  // Reprint still gives every Checked-In ticket.
  await page.getByRole("button", { name: "← Client" }).click();
  await page.getByRole("button", { name: /Reprint Tickets/ }).click();
  await expect(page.locator(".print-ticket")).toHaveCount(3);

  const rows = await checkInRows(event.id, v.baseCode);
  expect(rows.map((r) => r.status)).toEqual(["pending_assignment", "pending_assignment", "pending_assignment"]);
});

test("reprint shows the printed items' tickets again", async ({ page, event, asVolunteer }) => {
  const v = await checkIn(event.id, { firstName: "E2E Reprint" });
  await markPrinted(v.orders[0].id);
  await openVisitor(page, asVolunteer, event.id, "E2E Reprint Tester");
  await page.getByRole("button", { name: /Reprint Ticket/ }).click();
  await expect(page.locator(".print-ticket")).toHaveCount(1);
  await expect(page.getByText("E2E Reprint T.").first()).toBeVisible();
});

test("Back to Queue on the print preview goes straight to the queue", async ({ page, event, asVolunteer }) => {
  const v = await checkIn(event.id, { firstName: "E2E Done" });
  await markPrinted(v.orders[0].id);
  await openVisitor(page, asVolunteer, event.id, "E2E Done Tester");
  await page.getByRole("button", { name: /Reprint Ticket/ }).click();
  await expect(page.locator(".print-ticket")).toHaveCount(1);

  await page.getByRole("button", { name: /Print/ }).click();
  await expect.poll(() => page.evaluate(() => window.__printCalls)).toBe(1);

  await page.getByRole("button", { name: "Back to Queue" }).click();
  // Lands on the queue for the same event, not on the visitor detail.
  await expect(page.locator(".print-ticket")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Reprint Ticket/ })).toHaveCount(0);
  await expect(chip(page, "Checked-In")).toHaveText("Checked-In (1)");
});
