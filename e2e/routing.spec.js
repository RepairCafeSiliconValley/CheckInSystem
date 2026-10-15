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
  test(`/fix with ${name} shows Item Not Found`, async ({ page }) => {
    await page.goto(`/fix/${id}`);
    await expect(page.getByRole("heading", { name: "Item Not Found" })).toBeVisible();
  });
}

test("/queue signed out shows the volunteer password gate", async ({ page }) => {
  await page.goto("/queue");
  await expect(page.getByRole("heading", { name: "Volunteer Access" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Unlock" })).toBeDisabled();
  await expect(page.getByRole("link", { name: "Admin →" })).toHaveAttribute("href", "/admin");
});

test("/admin signed out shows the Google sign-in gate", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Admin Access" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Queue →" })).toHaveAttribute("href", "/queue");
});

test("deep links survive a full reload", async ({ page }) => {
  for (const path of ["/checkin", "/fix/x", "/queue", "/admin"]) {
    await page.goto(path);
    await page.reload();
    await expect(page.locator("body")).not.toContainText("404");
  }
});
