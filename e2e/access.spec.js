// Who gets into which portal: admin, volunteer, disabled admin, a signed-in
// non-admin, and the /admin re-lock after visiting /queue. Google itself is
// not exercised (see the manual playbook); sign-ins use the same redirect
// hash Supabase Auth returns after Google.

import { test, expect } from "./support/fixtures.js";
import { createAdmin, createStrayUser, sessionHashFor } from "./support/stack.js";

const adminGate = (page) => page.getByRole("heading", { name: "Admin Access" });

test("an admin signing in lands on /admin with their name", async ({ page, admin, asAdmin }) => {
  await asAdmin("/admin");
  await expect(page.getByText(`${admin.name} (admin)`)).toBeVisible();
  for (const tab of ["Events", "Allowlist", "Users"]) {
    await expect(page.getByRole("button", { name: tab })).toBeVisible();
  }
  // The tokens are gone from the address bar.
  await expect(page).not.toHaveURL(/access_token/);
});

test("an admin can use /queue, which re-locks /admin until a fresh sign-in", async ({ page, admin, asAdmin }) => {
  await asAdmin("/admin");
  await expect(page.getByText(`${admin.name} (admin)`)).toBeVisible();
  await page.getByRole("link", { name: "Queue →" }).click();
  await expect(page.getByText(`${admin.name} (admin)`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Queue" })).toBeVisible();

  await page.goto("/admin");
  await expect(adminGate(page)).toBeVisible();
  await expect(page.getByText(`You're still signed in as ${admin.name}`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  // A fresh sign-in unlocks it again. (Via a blank page: going from /admin to
  // /admin#tokens would only change the hash and never reload the app.)
  await page.goto("about:blank");
  await page.goto(`/admin${await sessionHashFor(admin)}`);
  await expect(page.getByText(`${admin.name} (admin)`)).toBeVisible();
});

test("the volunteer account is told to use Google at /admin", async ({ page, asVolunteer }) => {
  await asVolunteer("/queue");
  await expect(page.getByText("Volunteer account")).toBeVisible();
  await page.goto("/admin");
  await expect(adminGate(page)).toBeVisible();
  await expect(page.getByText("This device is signed in with the volunteer account.")).toBeVisible();
});

test("a disabled admin is refused at /admin and at /queue", async ({ page }) => {
  const disabled = await createAdmin({ disabled: true });
  await page.goto(`/admin${await sessionHashFor(disabled)}`);
  await expect(page.getByText(`Your admin account (${disabled.email}) has been disabled.`)).toBeVisible();
  await page.goto("/queue");
  await expect(page.getByRole("heading", { name: "Volunteer Access" })).toBeVisible();
});

test("a signed-in non-admin is told to ask for an invite", async ({ page }) => {
  const stray = await createStrayUser();
  await page.goto(`/admin${await sessionHashFor(stray)}`);
  await expect(page.getByText(`${stray.email} isn't an admin account.`)).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByText("Sign in with the Google account an admin approved.")).toBeVisible();
});

test("a rejected sign-in redirect shows its reason and cleans the URL", async ({ page }) => {
  // What Supabase Auth sends back when the allowlist hook refuses a Google
  // account (the message is double-encoded on the way back).
  const message = encodeURIComponent(encodeURIComponent("stranger@example.com has not been approved for admin access."));
  await page.goto(`/admin#error=access_denied&error_code=signup_disabled&error_description=${message}`);
  await expect(page.getByText("stranger@example.com has not been approved for admin access.")).toBeVisible();
  await expect(page).not.toHaveURL(/error=/);
});

test("logout from /admin signs out of both portals", async ({ page, asAdmin }) => {
  await asAdmin("/admin");
  await page.getByRole("button", { name: /Logout/ }).click();
  await expect(adminGate(page)).toBeVisible();
  await page.goto("/queue");
  await expect(page.getByRole("heading", { name: "Volunteer Access" })).toBeVisible();
});
