// Playbook §5: the public ticket page /T/:code (no login).
//
// One QR per ticket points here; the item's status decides whether it offers
// the claim buttons or the outcome form. /claim/:id and /fix/:id open the same
// page from a full id (see routing.spec.js) because tickets printed before the
// short code carry them.

import { test, expect } from "./support/fixtures.js";
import { checkIn, getWorkOrder, markPrinted, updateWorkOrder } from "./support/stack.js";
import { ticketPath } from "./support/ticketPath.js";

// A printed ("Checked-In") work order, still on the board and unclaimed.
async function printedItem(event, overrides = {}) {
  const v = await checkIn(event.id, { firstName: "E2E Fixee", lastName: "Mcfixface", ...overrides });
  await markPrinted(v.orders[0].id, "Electronics");
  return { visitor: v, order: v.orders[0] };
}

// Already With a Fixer, which is what the outcome form needs. Set directly
// rather than clicking through the claim panel so these tests stay about the
// outcome; the claim flow itself is covered separately below.
async function claimedItem(event, overrides = {}) {
  const item = await printedItem(event, overrides);
  await updateWorkOrder(item.order.id, { status: "assigned", assigned_at: new Date().toISOString() });
  return item;
}

const submit = (page) => page.getByRole("button", { name: "Submit Outcome" });
const hint = (page, text) => page.getByText(text, { exact: true });

// ─── Claiming ───

test("an unclaimed item offers the claim panel, not the outcome form", async ({ page, event }) => {
  const { order } = await printedItem(event);
  await page.goto(ticketPath(order.id));
  await expect(page.getByRole("heading", { name: "Start Working on This Item" })).toBeVisible();
  await expect(page.getByText(order.code)).toBeVisible();
  await expect(page.getByText("E2E Fixee M.")).toBeVisible();
  await expect(page.getByText("E2E Lamp")).toBeVisible();
  // Claim first: no skipping straight to an outcome.
  await expect(submit(page)).toHaveCount(0);
});

test("claiming records the fixer and reveals the outcome form in place", async ({ page, event }) => {
  const { order } = await printedItem(event);
  await page.goto(ticketPath(order.id));

  const claim = page.getByRole("button", { name: "Claim this item" });
  await expect(claim).toBeDisabled();
  await expect(hint(page, "Enter your name to start.")).toBeVisible();

  await page.getByLabel("Your Name").fill("E2E Claimer");
  await claim.click();

  // Same URL, no second scan — the status flip swaps the panel.
  await expect(page.getByRole("heading", { name: "Submit Repair Outcome" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${ticketPath(order.id)}$`));
  expect(await getWorkOrder(order.id)).toMatchObject({ status: "assigned", fixer_name: "E2E Claimer" });
});

test("a client with no consent gets one button and a banner saying no text was sent", async ({ page, event }) => {
  const { order } = await printedItem(event, { phone: "4085550199" });
  await page.goto(ticketPath(order.id));
  await expect(page.getByRole("button", { name: "Claim & text client" })).toHaveCount(0);

  await page.getByLabel("Your Name").fill("E2E Quiet");
  await page.getByRole("button", { name: "Claim this item" }).click();
  await expect(page.getByText("Claimed.")).toBeVisible();
  await expect(page.getByText("didn't give consent for texts")).toBeVisible();
});

test("a textable client gets both buttons; claiming quietly sends nothing", async ({ page, event }) => {
  const { order } = await printedItem(event, { phone: "4085550199", textMessage: true });
  await page.goto(ticketPath(order.id));

  // can_text_client is true, so the texting option leads and the quiet one stays.
  await expect(page.getByRole("button", { name: "Claim & text client" })).toBeVisible();
  const quiet = page.getByRole("button", { name: "Claim without texting" });
  await expect(quiet).toBeVisible();

  await page.getByLabel("Your Name").fill("E2E Quiet Two");
  await quiet.click();
  // not_requested — the fixer's own choice, reported ahead of any config reason.
  await expect(page.getByText("No text sent")).toBeVisible();
  expect((await getWorkOrder(order.id)).status).toBe("assigned");
});

test("the claim banner is for the fixer who claimed, not the next scanner", async ({ page, event }) => {
  const { order } = await printedItem(event);
  await page.goto(ticketPath(order.id));
  await page.getByLabel("Your Name").fill("E2E Banner");
  await page.getByRole("button", { name: "Claim this item" }).click();
  await expect(page.getByText("Claimed.")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Submit Repair Outcome" })).toBeVisible();
  await expect(page.getByText("Claimed.")).toHaveCount(0);
});

// ─── The short /T/ link printed on tickets ───
// Tickets carry /T/<first 16 hex of the id> in upper case (ticketLink.js) so
// the QR is smaller. Every spec here opens it through ticketPath(); this one
// spells the code out by hand so a bug in ticketCode() can't hide behind the
// helper, and checks it keeps working through a claim, which refetches.

test("the short /T/ code opens the ticket, and claiming works through it", async ({ page, event }) => {
  const { order } = await printedItem(event);
  const code = order.id.replace(/-/g, "").slice(0, 16).toUpperCase();
  await page.goto(`/T/${code}`);
  await expect(page.getByRole("heading", { name: "Start Working on This Item" })).toBeVisible();
  await expect(page.getByText(order.code)).toBeVisible();
  await expect(page.getByText("E2E Fixee M.")).toBeVisible();

  await page.getByLabel("Your Name").fill("E2E Short Code");
  await page.getByRole("button", { name: "Claim this item" }).click();
  await expect(page.getByRole("heading", { name: "Submit Repair Outcome" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/T/${code}$`));
  expect(await getWorkOrder(order.id)).toMatchObject({ status: "assigned", fixer_name: "E2E Short Code" });
});

test("the short code works in lower case too", async ({ page, event }) => {
  const { order } = await printedItem(event);
  await page.goto(`/t/${order.id.replace(/-/g, "").slice(0, 16).toLowerCase()}`);
  await expect(page.getByRole("heading", { name: "Start Working on This Item" })).toBeVisible();
  await expect(page.getByText(order.code)).toBeVisible();
});

// ─── Submitting an outcome ───

test("shows the item with an abbreviated client name", async ({ page, event }) => {
  const { order } = await claimedItem(event);
  await page.goto(ticketPath(order.id));
  await expect(page.getByRole("heading", { name: "Submit Repair Outcome" })).toBeVisible();
  await expect(page.getByText(order.code)).toBeVisible();
  await expect(page.getByText("Priority 1")).toBeVisible();
  await expect(page.getByText("E2E Fixee M.")).toBeVisible();
  await expect(page.getByText("Mcfixface")).toHaveCount(0);
  await expect(page.getByText("E2E Lamp")).toBeVisible();
  await expect(page.getByText("Electronics")).toBeVisible();
  await expect(page.getByText("Flickers")).toBeVisible();
});

test("submit stays disabled with a hint until name and outcome are set", async ({ page, event }) => {
  const { order } = await claimedItem(event);
  await page.goto(ticketPath(order.id));
  const name = page.getByLabel("Fixer Name");
  await expect(submit(page)).toBeDisabled();
  await expect(hint(page, "Enter your name and select an outcome to submit.")).toBeVisible();
  await name.fill("E2E Fixer");
  await expect(hint(page, "Select an outcome to submit.")).toBeVisible();
  await name.fill("");
  await page.getByRole("button", { name: /Fixed$/ }).first().click();
  await expect(hint(page, "Enter your name to submit.")).toBeVisible();
  await name.fill("   ");
  await expect(submit(page)).toBeDisabled();
});

test("Fixed: success screen, then Already Completed on reload", async ({ page, event }) => {
  const { order } = await claimedItem(event);
  await page.goto(ticketPath(order.id));
  await page.getByLabel("Fixer Name").fill("E2E Fixer One");
  await page.getByRole("button", { name: "✅ Fixed" }).click();
  await submit(page).click();
  await expect(page.getByRole("heading", { name: "Outcome Submitted" })).toBeVisible();
  await expect(page.getByText("has been marked as")).toContainText("E2E Lamp has been marked as Fixed");

  expect(await getWorkOrder(order.id)).toMatchObject({ status: "completed", outcome: "Fixed", fixer_name: "E2E Fixer One" });

  await page.reload();
  await expect(page.getByRole("heading", { name: "Already Completed" })).toBeVisible();
  await expect(page.getByText("by E2E Fixer One")).toBeVisible();
  await expect(submit(page)).toHaveCount(0);
});

test("Not Fixed needs a reason; Other takes a note the public page never shows", async ({ page, event }) => {
  const { order } = await claimedItem(event);
  await page.goto(ticketPath(order.id));
  await page.getByLabel("Fixer Name").fill("E2E Fixer Two");
  await page.getByRole("button", { name: "❌ Not Fixed" }).click();
  await expect(page.getByText("Why wasn't it fixed?")).toBeVisible();
  await expect(hint(page, "Select a reason it wasn't fixed to submit.")).toBeVisible();
  await expect(submit(page)).toBeDisabled();

  // Leaving Not Fixed clears the reason.
  await page.getByRole("button", { name: "Item too worn out" }).click();
  await page.getByRole("button", { name: "🔍 Diagnosed" }).click();
  await page.getByRole("button", { name: "❌ Not Fixed" }).click();
  await expect(submit(page)).toBeDisabled();

  await page.getByRole("button", { name: "Other", exact: true }).click();
  await page.getByLabel("Details (optional)").fill("E2E note: missing screw");
  await expect(page.getByText("Don't include names or contact details. Notes are included in data exports.")).toBeVisible();
  await submit(page).click();
  await expect(page.getByRole("heading", { name: "Outcome Submitted" })).toBeVisible();

  expect(await getWorkOrder(order.id)).toMatchObject({
    outcome: "Not Fixed", not_fixed_reason: "Other", not_fixed_note: "E2E note: missing screw",
  });
  await page.reload();
  await expect(page.getByText("Reason: Other")).toBeVisible();
  await expect(page.getByText("missing screw")).toHaveCount(0);
});

for (const [button, outcome] of [["🔍 Diagnosed", "Diagnosed"], ["🥡 Taken Home", "Taken Home"]]) {
  test(`${outcome} is recorded`, async ({ page, event }) => {
    const { order } = await claimedItem(event);
    await page.goto(ticketPath(order.id));
    await page.getByLabel("Fixer Name").fill("E2E Fixer");
    await page.getByRole("button", { name: button }).click();
    await submit(page).click();
    await expect(page.getByRole("heading", { name: "Outcome Submitted" })).toBeVisible();
    expect((await getWorkOrder(order.id)).outcome).toBe(outcome);
  });
}

test("a fixer name saved by a volunteer is pre-filled", async ({ page, event }) => {
  const { order } = await claimedItem(event);
  await updateWorkOrder(order.id, { fixer_name: "E2E Saved Fixer" });
  await page.goto(ticketPath(order.id));
  await expect(page.getByLabel("Fixer Name")).toHaveValue("E2E Saved Fixer");
});

test("the last fixer name used is remembered on this device", async ({ page, event }) => {
  const first = await claimedItem(event);
  const second = await claimedItem(event);
  await page.goto(ticketPath(first.order.id));
  await expect(page.getByLabel("Fixer Name")).toHaveValue("");
  await page.getByLabel("Fixer Name").fill("  E2E Pat  ");
  await page.getByRole("button", { name: "✅ Fixed" }).click();
  await submit(page).click();
  await expect(page.getByRole("heading", { name: "Outcome Submitted" })).toBeVisible();

  await page.goto(ticketPath(second.order.id));
  await expect(page.getByLabel("Fixer Name")).toHaveValue("E2E Pat");

  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.getByLabel("Fixer Name")).toHaveValue("");
});

test("a failed submit doesn't remember the name; a name on the item wins over it", async ({ page, event }) => {
  const first = await claimedItem(event);
  const second = await claimedItem(event);
  await page.goto(ticketPath(first.order.id));
  await page.getByLabel("Fixer Name").fill("E2E Typo");
  await page.getByRole("button", { name: "✅ Fixed" }).click();
  await page.route("**/rest/v1/rpc/submit_fixer_outcome", (route) => route.abort());
  await submit(page).click();
  await expect(page.getByText("Something went wrong. Please try again.")).toBeVisible();
  await page.unroute("**/rest/v1/rpc/submit_fixer_outcome");
  await page.reload();
  await expect(page.getByLabel("Fixer Name")).toHaveValue("");

  await page.getByLabel("Fixer Name").fill("E2E Pat");
  await page.getByRole("button", { name: "✅ Fixed" }).click();
  await submit(page).click();
  await expect(page.getByRole("heading", { name: "Outcome Submitted" })).toBeVisible();

  await updateWorkOrder(second.order.id, { fixer_name: "E2E Saved Fixer" });
  await page.goto(ticketPath(second.order.id));
  await expect(page.getByLabel("Fixer Name")).toHaveValue("E2E Saved Fixer");
});

test("two open tabs: the first submission wins, the second gets an error", async ({ page, context, event }) => {
  const { order } = await claimedItem(event);
  const other = await context.newPage();
  await page.goto(ticketPath(order.id));
  await other.goto(ticketPath(order.id));

  await page.getByLabel("Fixer Name").fill("E2E First");
  await page.getByRole("button", { name: "✅ Fixed" }).click();
  await submit(page).click();
  await expect(page.getByRole("heading", { name: "Outcome Submitted" })).toBeVisible();

  await other.getByLabel("Fixer Name").fill("E2E Second");
  await other.getByRole("button", { name: "🔍 Diagnosed" }).click();
  await submit(other).click();
  await expect(other.getByText("Something went wrong. Please try again.")).toBeVisible();
  expect(await getWorkOrder(order.id)).toMatchObject({ outcome: "Fixed", fixer_name: "E2E First" });
});

test("a network failure shows an error and the retry succeeds", async ({ page, event }) => {
  const { order } = await claimedItem(event);
  await page.goto(ticketPath(order.id));
  await page.getByLabel("Fixer Name").fill("E2E Retry");
  await page.getByRole("button", { name: "✅ Fixed" }).click();
  await page.route("**/rest/v1/rpc/submit_fixer_outcome", (route) => route.abort());
  await submit(page).click();
  await expect(page.getByText("Something went wrong. Please try again.")).toBeVisible();
  await expect(submit(page)).toBeEnabled();
  await page.unroute("**/rest/v1/rpc/submit_fixer_outcome");
  await submit(page).click();
  await expect(page.getByRole("heading", { name: "Outcome Submitted" })).toBeVisible();
});

// ─── States with nothing to do ───

test("an unprinted item says it isn't checked in yet", async ({ page, event }) => {
  const v = await checkIn(event.id);
  await page.goto(ticketPath(v.orders[0].id));
  await expect(page.getByRole("heading", { name: "Not Checked In Yet" })).toBeVisible();
  await expect(submit(page)).toHaveCount(0);
});

test("a cancelled item says there's nothing to do, without the cancel note", async ({ page, event }) => {
  const { order } = await claimedItem(event);
  await updateWorkOrder(order.id, { status: "canceled", cancel_reason: "Other", cancel_note: "E2E secret note" });
  await page.goto(ticketPath(order.id));
  await expect(page.getByRole("heading", { name: "Item Cancelled" })).toBeVisible();
  await expect(page.getByText("E2E secret note")).toHaveCount(0);
  await expect(submit(page)).toHaveCount(0);
});

test("the public RPC response carries no contact details or notes", async ({ page, event }) => {
  const v = await checkIn(event.id, { firstName: "E2E Private", lastName: "Surname", email: "private@example.com", phone: "4085550199", zip: "95112" });
  await markPrinted(v.orders[0].id);
  await updateWorkOrder(v.orders[0].id, { not_fixed_note: "E2E hidden", cancel_note: "E2E hidden" });
  const responsePromise = page.waitForResponse("**/rest/v1/rpc/get_fixer_work_order*");
  await page.goto(ticketPath(v.orders[0].id));
  const body = await (await responsePromise).text();
  // can_text_client collapses collect_phone + phone + consent into one boolean
  // precisely so none of these have to cross to a public page.
  for (const secret of ["private@example.com", "4085550199", "95112", "Surname", "E2E hidden"]) {
    expect(body).not.toContain(secret);
  }
  expect(body).toContain("E2E Private S.");
});
