// Playbook §5: the public fixer page /fix/:id (no login).

import { test, expect } from "./support/fixtures.js";
import { checkIn, getWorkOrder, markPrinted, updateWorkOrder } from "./support/stack.js";

// A printed ("Checked-In") work order ready for a fixer.
async function printedItem(event, overrides = {}) {
  const v = await checkIn(event.id, { firstName: "E2E Fixee", lastName: "Mcfixface", ...overrides });
  await markPrinted(v.orders[0].id, "Electronics");
  return { visitor: v, order: v.orders[0] };
}

const submit = (page) => page.getByRole("button", { name: "Submit Outcome" });
const hint = (page, text) => page.getByText(text, { exact: true });

test("shows the item with an abbreviated client name", async ({ page, event }) => {
  const { order } = await printedItem(event);
  await page.goto(`/fix/${order.id}`);
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
  const { order } = await printedItem(event);
  await page.goto(`/fix/${order.id}`);
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
  const { order } = await printedItem(event);
  await page.goto(`/fix/${order.id}`);
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
  const { order } = await printedItem(event);
  await page.goto(`/fix/${order.id}`);
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
    const { order } = await printedItem(event);
    await page.goto(`/fix/${order.id}`);
    await page.getByLabel("Fixer Name").fill("E2E Fixer");
    await page.getByRole("button", { name: button }).click();
    await submit(page).click();
    await expect(page.getByRole("heading", { name: "Outcome Submitted" })).toBeVisible();
    expect((await getWorkOrder(order.id)).outcome).toBe(outcome);
  });
}

test("a fixer name saved by a volunteer is pre-filled", async ({ page, event }) => {
  const { order } = await printedItem(event);
  await updateWorkOrder(order.id, { fixer_name: "E2E Saved Fixer" });
  await page.goto(`/fix/${order.id}`);
  await expect(page.getByLabel("Fixer Name")).toHaveValue("E2E Saved Fixer");
});

test("two open tabs: the first submission wins, the second gets an error", async ({ page, context, event }) => {
  const { order } = await printedItem(event);
  const other = await context.newPage();
  await page.goto(`/fix/${order.id}`);
  await other.goto(`/fix/${order.id}`);

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
  const { order } = await printedItem(event);
  await page.goto(`/fix/${order.id}`);
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

test("an unprinted item says it isn't checked in yet", async ({ page, event }) => {
  const v = await checkIn(event.id);
  await page.goto(`/fix/${v.orders[0].id}`);
  await expect(page.getByRole("heading", { name: "Not Checked In Yet" })).toBeVisible();
  await expect(submit(page)).toHaveCount(0);
});

test("a cancelled item says there's nothing to do, without the cancel note", async ({ page, event }) => {
  const { order } = await printedItem(event);
  await updateWorkOrder(order.id, { status: "canceled", cancel_reason: "Other", cancel_note: "E2E secret note" });
  await page.goto(`/fix/${order.id}`);
  await expect(page.getByRole("heading", { name: "Item Cancelled" })).toBeVisible();
  await expect(page.getByText("E2E secret note")).toHaveCount(0);
  await expect(submit(page)).toHaveCount(0);
});

test("the public RPC response carries no contact details or notes", async ({ page, event }) => {
  const v = await checkIn(event.id, { firstName: "E2E Private", lastName: "Surname", email: "private@example.com", phone: "4085550199", zip: "95112" });
  await markPrinted(v.orders[0].id);
  await updateWorkOrder(v.orders[0].id, { not_fixed_note: "E2E hidden", cancel_note: "E2E hidden" });
  const responsePromise = page.waitForResponse("**/rest/v1/rpc/get_fixer_work_order*");
  await page.goto(`/fix/${v.orders[0].id}`);
  const body = await (await responsePromise).text();
  for (const secret of ["private@example.com", "4085550199", "95112", "Surname", "E2E hidden"]) {
    expect(body).not.toContain(secret);
  }
  expect(body).toContain("E2E Private S.");
});
