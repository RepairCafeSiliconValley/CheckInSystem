// Playbook §1: routes, dead ends and redirects. Needs no data.

import { test, expect } from "./support/fixtures.js";

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

for (const [name, id] of [
  ["an unknown id", NO_EVENT],
  ["a malformed id", "not-a-uuid"],
]) {
  test(`/ticket with ${name} shows Item Not Found`, async ({ page }) => {
    await page.goto(`/ticket/${id}`);
    await expect(page.getByRole("heading", { name: "Item Not Found" })).toBeVisible();
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
// QR code each. Tickets printed before they merged are paper and stay in
// circulation, so these redirects can never be removed — this is the test that
// says so.
for (const legacy of ["claim", "fix"]) {
  test(`/${legacy}/:id redirects to /ticket/:id`, async ({ page }) => {
    await page.goto(`/${legacy}/${NO_EVENT}`);
    await expect(page).toHaveURL(new RegExp(`/ticket/${NO_EVENT}$`));
    // Followed through to the real page, not just a URL rewrite.
    await expect(page.getByRole("heading", { name: "Item Not Found" })).toBeVisible();
  });
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
  for (const path of ["/checkin", "/ticket/x", "/fix/x", "/queue", "/admin"]) {
    await page.goto(path);
    await page.reload();
    await expect(page.locator("body")).not.toContainText("404");
  }
});
