import { cleanupE2EData, localVolunteerPassword } from "./support/stack.js";

// Clear anything a crashed earlier run left behind, and fail fast when the
// volunteer password is missing (most specs sign in with it).
export default async function globalSetup() {
  if (!localVolunteerPassword()) {
    throw new Error(
      "No local volunteer password. Add a `# LOCAL_VOLUNTEER_PASSWORD=...` line to .env.local and run `npm run db:reset`.",
    );
  }
  await cleanupE2EData();
}
