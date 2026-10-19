// End-to-end tests: a real browser against the Vite dev server and the LOCAL
// Supabase stack. See e2e/README.md.
//
//   npm run test:e2e

import { defineConfig, devices } from "@playwright/test";
import { localStackEnv } from "./scripts/local-stack.mjs";

const PORT = 5175;
const stack = localStackEnv(); // throws unless the local stack is running

export default defineConfig({
  testDir: "./e2e",
  // One worker: the landing-page tests open and close events globally, and the
  // queue counts would see other tests' visitors arrive mid-assertion.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  globalSetup: "./e2e/global-setup.js",
  globalTeardown: "./e2e/global-teardown.js",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // The QR modal and Metrics both copy to the clipboard.
    permissions: ["clipboard-read", "clipboard-write"],
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    // Always start our own server: it must point at the local stack, whatever
    // .env.local says. Variables already in the environment beat .env files.
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: stack.apiUrl,
      VITE_SUPABASE_ANON_KEY: stack.anonKey,
    },
  },
});
