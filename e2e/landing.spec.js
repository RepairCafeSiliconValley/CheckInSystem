// Playbook §2 "Landing page": / depends on how many events are open in the
// whole database. The one- and zero-event cases close every other open event
// for the length of the test and reopen them afterwards (local stack only).

import { test, expect } from "./support/fixtures.js";
import { createEvent, openEvents, updateEvent } from "./support/stack.js";

test.describe.configure({ mode: "serial" });

// Closes every open event except `keep`, runs fn, then reopens them.
async function withOnlyOpen(keep, fn) {
  const others = (await openEvents()).filter((e) => !keep.includes(e.id));
  for (const e of others) await updateEvent(e.id, { is_open: false });
  try {
    await fn();
  } finally {
    for (const e of others) await updateEvent(e.id, { is_open: true });
  }
}

test("several open events: a chooser, newest first, that links to check-in", async ({ page }) => {
  const older = await createEvent({ date: "2030-01-01", location: "E2E Older Lab" });
  const newer = await createEvent({ date: "2030-02-01", location: "E2E Newer Lab" });
  await withOnlyOpen([older.id, newer.id], async () => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Choose your event" })).toBeVisible();
    const choices = page.getByRole("button").filter({ hasText: "E2E " });
    await expect(choices).toHaveCount(2);
    await expect(choices.first()).toContainText(newer.name);
    await expect(choices.first()).toContainText("E2E Newer Lab");
    await choices.filter({ hasText: older.name }).click();
    await expect(page).toHaveURL(new RegExp(`/checkin\\?event=${older.id}$`));
  });
});

test("a closed event drops off the chooser", async ({ page }) => {
  const a = await createEvent();
  const b = await createEvent();
  const c = await createEvent();
  await withOnlyOpen([a.id, b.id, c.id], async () => {
    await updateEvent(c.id, { is_open: false });
    await page.goto("/");
    await expect(page.getByRole("button").filter({ hasText: "E2E " })).toHaveCount(2);
    await expect(page.getByText(c.name)).toHaveCount(0);
  });
});

test("exactly one open event: / goes straight to its check-in form", async ({ page }) => {
  const only = await createEvent();
  await withOnlyOpen([only.id], async () => {
    await page.goto("/");
    await expect(page).toHaveURL(new RegExp(`/checkin\\?event=${only.id}$`));
    await expect(page.getByRole("heading", { name: "Check In" })).toBeVisible();
  });
});

test("no open events: / says check-in is closed", async ({ page }) => {
  await withOnlyOpen([], async () => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Check-In Closed" })).toBeVisible();
  });
});
