// Playbook §1: routes, dead ends and redirects. Mostly needs no data; the
// legacy ticket links check-in one item to open.

import { test, expect } from "./support/fixtures.js";
import { checkIn, markPrinted } from "./support/stack.js";

const NO_EVENT = "00000000-0000-0000-0000-000000000000";

test("an unknown path redirects to /", async ({ page }) => {
  await page.goto("/some/unknown/path");
  await expect(page).toHaveURL(/\/$/);
});

for (const [name, path] of [
  ["no event id", "/checkin"],
  ["an unknown event id", `/checkin?event=${NO_EVENT}`],
  ["a malformed event id", "/checkin?event=not-a-uuid"],
]) {
  test(`/checkin with ${name} shows the invalid-link card`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Invalid Check-In Link" })).toBeVisible();
    await expect(page.getByRole("link", { name: "find another event here" })).toHaveAttribute("href", "/");
  });
}

for (const [name, code] of [
  ["an unknown code", "0000000000004000"],
  ["a too-short code", "ABC123"],
  ["a non-hex code", "NOTAHEXCODE12345"],
]) {
  test(`/T with ${name} shows Item Not Found`, async ({ page }) => {
    await page.goto(`/T/${code}`);
    await expect(page.getByRole("heading", { name: "Item Not Found" })).toBeVisible();
  });
}

// Claiming and submitting an outcome used to be /claim/:id and /fix/:id, one
// QR code each, and PROD printed /fix/<uuid> until the short /T/ code. Those
// tickets are paper and stay in circulation, so these routes can never be
// removed — these are the tests that say so. They open the ticket page in
// place from the full id; there is no redirect.
for (const legacy of ["claim", "fix"]) {
  test(`/${legacy}/:id with a real id opens that item`, async ({ page, event }) => {
    const v = await checkIn(event.id, { firstName: "E2E Legacy", lastName: "Link" });
    const order = v.orders[0];
    await markPrinted(order.id, "Electronics");
    await page.goto(`/${legacy}/${order.id}`);
    await expect(page.getByRole("heading", { name: "Start Working on This Item" })).toBeVisible();
    await expect(page.getByText(order.code)).toBeVisible();
    await expect(page.getByText("E2E Legacy L.")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/${legacy}/${order.id}$`));
  });

  for (const [name, id] of [
    ["an unknown id", NO_EVENT],
    ["a malformed id", "not-a-uuid"],
  ]) {
    test(`/${legacy} with ${name} shows Item Not Found`, async ({ page }) => {
      await page.goto(`/${legacy}/${id}`);
      await expect(page.getByRole("heading", { name: "Item Not Found" })).toBeVisible();
    });
  }
}

test("/admin signed out offers both sign-ins on one card", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();
  await expect(page.getByLabel("Volunteer password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Unlock" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
  // Nothing to sign out of, and nowhere else to go: one portal, one route.
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /→/ })).toHaveCount(0);
});

test("/queue redirects to the portal, keeping its query string", async ({ page }) => {
  await page.goto("/queue");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();

  await page.goto("/queue?tab=metrics&event=abc");
  await expect(page).toHaveURL(/\/admin\?tab=metrics&event=abc$/);
});

test("deep links survive a full reload", async ({ page }) => {
  for (const path of ["/checkin", "/T/x", "/fix/x", "/queue", "/admin"]) {
    await page.goto(path);
    await page.reload();
    await expect(page.locator("body")).not.toContainText("404");
  }
});
