// Playwright fixtures shared by the specs.
//
//   event            a fresh open E2E event dated today (max 3 items, email and
//                    phone collected, weight off)
//   asVolunteer(path) opens `path` signed in as the volunteer account
//   asAdmin(path)     opens `path` signed in as a fresh admin (created per test)
//
// Sign-ins go through the same URL-hash redirect Supabase Auth uses after a
// real login, so the app's own session handling runs. Both default to /admin,
// the portal's one route: the session rides in on the URL hash, which would
// not survive the /queue redirect, so specs must target /admin directly.

import { test as base, expect } from "@playwright/test";
import { createAdmin, createEvent, sessionHashFor, volunteerSessionHash } from "./stack.js";

export const test = base.extend({
  event: async ({}, use) => {
    await use(await createEvent());
  },

  asVolunteer: async ({ page }, use) => {
    await use(async (path = "/admin") => {
      await page.goto(`${path}${await volunteerSessionHash()}`);
    });
  },

  admin: async ({}, use) => {
    await use(await createAdmin());
  },

  asAdmin: async ({ page, admin }, use) => {
    await use(async (path = "/admin") => {
      await page.goto(`${path}${await sessionHashFor(admin)}`);
    });
  },

  // window.print() would open a native dialog the test can't close; record
  // the call instead.
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      window.__printCalls = 0;
      window.print = () => {
        window.__printCalls += 1;
      };
    });
    await use(page);
  },
});

export { expect };
