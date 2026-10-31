// Who gets which tabs in the one portal: admin, volunteer, disabled admin and
// a signed-in non-admin. Google itself is not exercised (see the manual
// playbook); sign-ins use the same redirect hash Supabase Auth returns after
// Google.

import { test, expect } from "./support/fixtures.js";
import { createAdmin, createStrayUser, sessionHashFor } from "./support/stack.js";

const gate = (page) => page.getByRole("heading", { name: "Sign In" });

const ADMIN_TABS = ["Queue", "Metrics", "Events", "Admins"];

test("an admin signing in gets every tab in one bar", async ({ page, admin, asAdmin }) => {
  await asAdmin("/admin");
  await expect(page.getByText(`${admin.name} (admin)`)).toBeVisible();
  for (const tab of ADMIN_TABS) {
    await expect(page.getByRole("button", { name: tab })).toBeVisible();
  }
  // The tokens are gone from the address bar.
  await expect(page).not.toHaveURL(/access_token/);
});

test("an admin moves between every tab without signing in again", async ({ page, admin, asAdmin }) => {
  await asAdmin("/admin");
  for (const tab of ["Events", "Admins", "Metrics", "Queue", "Events"]) {
    await page.getByRole("button", { name: tab }).click();
    // Still signed in, and still holding the whole tab bar.
    await expect(page.getByText(`${admin.name} (admin)`)).toBeVisible();
    await expect(page.getByRole("button", { name: "Admins" })).toBeVisible();
  }
  await expect(gate(page)).toHaveCount(0);
});

test("the volunteer account gets only Queue and Metrics", async ({ page, asVolunteer }) => {
  await asVolunteer("/admin");
  await expect(page.getByText("Volunteer account")).toBeVisible();
  await expect(page.getByRole("button", { name: "Queue" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Metrics" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Events" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Admins" })).toHaveCount(0);
  // Logout is the only thing beside the identity: an admin on this device
  // signs out first, then uses the gate's Continue with Google.
  await expect(page.getByRole("button", { name: /Logout/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /sign-in/i })).toHaveCount(0);
});

for (const tab of ["events", "admins"]) {
  test(`?tab=${tab} as a volunteer lands on the Queue`, async ({ page, asVolunteer }) => {
    await asVolunteer(`/admin?tab=${tab}`);
    await expect(page.getByText("Volunteer account")).toBeVisible();
    // Hidden isn't enough: the tab must not open, and its page must not render.
    await expect(page.getByRole("button", { name: "Queue" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { name: "Admins" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Create Event" })).toHaveCount(0);
  });
}

test("an admin's ?tab= opens that tab", async ({ page, asAdmin }) => {
  await asAdmin("/admin?tab=admins");
  await expect(page.getByRole("heading", { name: "Admins" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Admins" })).toHaveAttribute("aria-current", "page");
});

test("a disabled admin is refused and told why", async ({ page }) => {
  const disabled = await createAdmin({ disabled: true });
  await page.goto(`/admin${await sessionHashFor(disabled)}`);
  await expect(page.getByText(`Your admin account (${disabled.email}) has been disabled.`)).toBeVisible();
  // The volunteer password is still right there, so the front desk isn't stuck.
  await expect(page.getByLabel("Volunteer password")).toBeVisible();
});

test("a signed-in non-admin is told to ask for an invite", async ({ page }) => {
  const stray = await createStrayUser();
  await page.goto(`/admin${await sessionHashFor(stray)}`);
  await expect(page.getByText(`${stray.email} isn't an admin account.`)).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByText("Volunteers use the shared password.")).toBeVisible();
});

test("a rejected sign-in redirect shows its reason and cleans the URL", async ({ page }) => {
  // What Supabase Auth sends back when the allowlist hook refuses a Google
  // account (the message is double-encoded on the way back).
  const message = encodeURIComponent(encodeURIComponent("stranger@example.com has not been approved for admin access."));
  await page.goto(`/admin#error=access_denied&error_code=signup_disabled&error_description=${message}`);
  await expect(page.getByText("stranger@example.com has not been approved for admin access.")).toBeVisible();
  await expect(page).not.toHaveURL(/error=/);
});

test("logout returns to the gate and survives a reload", async ({ page, asAdmin }) => {
  await asAdmin("/admin");
  await page.getByRole("button", { name: /Logout/ }).click();
  await expect(gate(page)).toBeVisible();
  await page.reload();
  await expect(gate(page)).toBeVisible();
});
