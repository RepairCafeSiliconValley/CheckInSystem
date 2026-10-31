// Playbook §2 (event setup and controls) plus the portal's Admins tab.
// Both are admin-only tabs, so these open the portal with ?tab= already set.

import { test, expect } from "./support/fixtures.js";
import { allowlistHas, createAdmin, getAppUser, getEvent, tag, today } from "./support/stack.js";

const eventCard = (page, name) =>
  page.locator("div").filter({ has: page.getByText(name, { exact: true }) }).filter({ has: page.getByRole("button", { name: "Configure Event" }) }).last();

// ── Events ──

test("create an event: required fields, defaults reset, listed open", async ({ page, asAdmin }) => {
  await asAdmin("/admin?tab=events");
  const name = `E2E Created ${tag()}`;
  const create = page.getByRole("button", { name: "Create Event" });
  await expect(create).toBeDisabled();
  await page.getByLabel("Date").fill(today());
  await expect(create).toBeDisabled();
  await page.getByLabel("Event Name").fill(name);
  await page.getByLabel("Location").fill("E2E Lab");
  await page.getByLabel("Max Items per Visitor").fill("3");
  await page.getByLabel("Record item weight (kg)").check();
  await create.click();

  await expect(page.getByLabel("Event Name")).toHaveValue("");
  await expect(page.getByLabel("Max Items per Visitor")).toHaveValue("2");
  await expect(page.getByLabel("Record item weight (kg)")).not.toBeChecked();
  const card = eventCard(page, name);
  await expect(card.getByText("Open", { exact: true })).toBeVisible();
  await expect(card.getByText("0 clients")).toBeVisible();
});

test("the QR modal shows the check-in link and copies it", async ({ page, event, asAdmin }) => {
  await asAdmin("/admin?tab=events");
  await eventCard(page, event.name).getByRole("button", { name: "Show check-in QR code" }).click();
  const url = `http://localhost:5175/checkin?event=${event.id}`;
  await expect(page.getByRole("heading", { name: `Check-In QR code — ${event.name}` })).toBeVisible();
  await expect(page.getByText(url)).toBeVisible();
  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByRole("button", { name: "Copied!" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
  await page.keyboard.press("Escape");
  await expect(page.getByText(url)).toHaveCount(0);
});

test("configure: max items clamps to 1-10, cancel discards, save persists", async ({ page, event, asAdmin }) => {
  await asAdmin("/admin?tab=events");
  const configure = () => eventCard(page, event.name).getByRole("button", { name: "Configure Event" }).click();
  const max = () => page.getByLabel("Max Items per Visitor").last();

  await configure();
  await max().fill("15");
  await page.getByRole("button", { name: "Save" }).click();
  await expect.poll(async () => (await getEvent(event.id)).max_items).toBe(10);

  await configure();
  await max().fill("0");
  await page.getByRole("button", { name: "Save" }).click();
  await expect.poll(async () => (await getEvent(event.id)).max_items).toBe(2);

  await configure();
  await max().fill("5");
  await page.getByRole("button", { name: "Cancel" }).click();
  expect((await getEvent(event.id)).max_items).toBe(2);

  await configure();
  await page.getByLabel("Collect email address").last().uncheck();
  await page.getByLabel("Collect phone number").last().uncheck();
  await page.getByLabel("Record item weight (kg)").last().check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect.poll(async () => getEvent(event.id)).toMatchObject({
    collect_email: false, collect_phone: false, collect_weight: true,
  });
});

test("close and reopen check-in", async ({ page, event, asAdmin }) => {
  await asAdmin("/admin?tab=events");
  const card = eventCard(page, event.name);
  await card.getByRole("button", { name: "Close Check-In" }).click();
  await expect(card.getByText("Closed", { exact: true })).toBeVisible();
  expect((await getEvent(event.id)).is_open).toBe(false);
  await card.getByRole("button", { name: "Reopen Check-In" }).click();
  await expect(card.getByText("Open", { exact: true })).toBeVisible();
  expect((await getEvent(event.id)).is_open).toBe(true);
});

test("View metrics switches to the Metrics tab on that event", async ({ page, event, asAdmin }) => {
  await asAdmin("/admin?tab=events");
  await eventCard(page, event.name).getByRole("button", { name: "View metrics →" }).click();
  // A tab switch inside the one portal now, not a trip to another URL.
  await expect(page).not.toHaveURL(/queue/);
  await expect(page.getByRole("heading", { name: "Metrics" })).toBeVisible();
  await expect(page.getByRole("button", { name: event.name })).toBeVisible(); // the event picker
});

// ── Admins tab: invites ──

test("invites: validation, duplicates, add and remove", async ({ page, admin, asAdmin }) => {
  await asAdmin("/admin?tab=admins");
  const email = page.getByLabel("Email");
  const add = page.getByRole("button", { name: "Add to allowlist" });
  // Invites and the admins table share one page now, so the row buttons are
  // looked up inside the invites section.
  const invites = page.getByRole("region", { name: "Pending invites" });

  await email.fill("not-an-email");
  await add.click();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();

  await email.fill(admin.email.toUpperCase());
  await add.click();
  await expect(page.getByText(`${admin.email} is already an admin.`)).toBeVisible();

  const invite = `invite-${tag()}@e2e.example.com`;
  await email.fill(`  ${invite.toUpperCase()} `);
  await add.click();
  await expect(invites.getByText(invite, { exact: true })).toBeVisible();
  await expect(invites.getByText(`by ${admin.name}`)).toBeVisible();
  expect(await allowlistHas(invite)).toBe(true);

  await email.fill(invite);
  await add.click();
  await expect(page.getByText(`${invite} is already on the allowlist.`)).toBeVisible();

  // The invite list is newest first, so ours is the first row.
  await invites.getByRole("button", { name: "Remove" }).first().click();
  await expect(page.getByRole("heading", { name: "Remove invite?" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  expect(await allowlistHas(invite)).toBe(true);

  await invites.getByRole("button", { name: "Remove" }).first().click();
  await expect(page.getByText(`${invite} won't be able to sign in`)).toBeVisible();
  // The modal's confirm button is outside the invites section.
  await page.getByRole("button", { name: "Remove", exact: true }).last().click();
  await expect(invites.getByText(invite, { exact: true })).toHaveCount(0);
  expect(await allowlistHas(invite)).toBe(false);
});

// ── Admins tab: accounts ──

test("admins: rename, disable, enable and delete another admin; never yourself", async ({ page, admin, asAdmin }) => {
  const other = await createAdmin({ name: `E2E Other ${tag()}` });
  await asAdmin("/admin?tab=admins");

  // Yourself: can't disable or delete.
  await expect(page.getByLabel(`Disabled: ${admin.email}`)).toBeDisabled();
  const selfRow = page.getByRole("row").filter({ hasText: admin.email });
  await expect(selfRow.getByRole("button", { name: "Delete" })).toBeDisabled();
  await expect(selfRow.getByText("(you)")).toBeVisible();

  // Rename, including the empty-name guard.
  const nameField = page.getByLabel(`Name for ${other.email}`);
  await nameField.fill("   ");
  await nameField.press("Enter");
  await expect(page.getByText("A name can't be empty.")).toBeVisible();
  await nameField.fill("E2E Renamed");
  await nameField.press("Enter");
  await expect(page.getByText("Saved E2E Renamed.")).toBeVisible();
  expect((await getAppUser(other.id)).name).toBe("E2E Renamed");

  // Disable and enable. The box follows the saved row, so click and wait.
  await page.getByLabel(`Disabled: ${other.email}`).click();
  await expect(page.getByText("E2E Renamed is disabled.")).toBeVisible();
  await expect(page.getByLabel(`Disabled: ${other.email}`)).toBeChecked();
  expect((await getAppUser(other.id)).disabled).toBe(true);
  await page.getByLabel(`Disabled: ${other.email}`).click();
  await expect(page.getByText("E2E Renamed is enabled again.")).toBeVisible();
  expect((await getAppUser(other.id)).disabled).toBe(false);

  // Sorting by email flips direction on a second click.
  await page.getByRole("button", { name: "Email" }).click();
  await expect(page.getByRole("button", { name: "Email ↑" })).toBeVisible();
  await page.getByRole("button", { name: "Email ↑" }).click();
  await expect(page.getByRole("button", { name: "Email ↓" })).toBeVisible();

  // Delete, with a confirmation.
  await page.getByRole("row").filter({ hasText: other.email }).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("heading", { name: "Delete E2E Renamed?" })).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).last().click();
  await expect(page.getByText("E2E Renamed was deleted.")).toBeVisible();
  expect(await getAppUser(other.id)).toBeUndefined();
});
