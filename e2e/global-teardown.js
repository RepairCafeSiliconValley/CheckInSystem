import { cleanupE2EData } from "./support/stack.js";

// Remove every E2E event, its visitors and work orders, and the E2E users.
// Set E2E_KEEP_DATA=1 to leave them for inspection after a failure.
export default async function globalTeardown() {
  if (process.env.E2E_KEEP_DATA) return;
  await cleanupE2EData();
}
