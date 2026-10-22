// Playbook §6: the status lifecycle from the volunteer side — recording and
// editing outcomes, cancelling and undoing.

import { test, expect } from "./support/fixtures.js";
import { checkIn, getWorkOrder, markPrinted, updateWorkOrder } from "./support/stack.js";

async function openVisitor(page, asVolunteer, eventId, name) {
  await asVolunteer(`/queue?event=${eventId}`);
  await page.getByText(name).click();
  await expect(page.getByRole("button", { name: "← Queue" })).toBeVisible();
}

const submit = (page) => page.getByRole("button", { name: "Submit Outcome" });

test("record Fixed with a saved fixer name, then edit it back to Checked-In", async ({ page, event, asVolunteer }) => {
  const v = await checkIn(event.id, { firstName: "E2E Outcome" });
  const id = v.orders[0].id;
  await markPrinted(id);
  await updateWorkOrder(id, { fixer_name: "E2E Staff Fixer" });
  await openVisitor(page, asVolunteer, event.id, "E2E Outcome Tester");

  await expect(page.getByLabel("Fixer Name (optional)")).toHaveValue("E2E Staff Fixer");
  await expect(submit(page)).toBeDisabled();
  await expect(page.getByText("Select an outcome to submit.")).toBeVisible();
  await page.getByRole("button", { name: "✅ Fixed" }).click();
  await submit(page).click();

  await expect(page.getByText("Completed", { exact: true })).toBeVisible();
  await expect(page.getByText("by E2E Staff Fixer")).toBeVisible();
  await expect(page.getByLabel("Item Name")).toHaveCount(0);
  expect(await getWorkOrder(id)).toMatchObject({ status: "completed", outcome: "Fixed", fixer_name: "E2E Staff Fixer" });

  await page.getByRole("button", { name: /Edit Outcome/ }).click();
  await expect(page.getByText("Checked-In", { exact: true })).toBeVisible();
  await expect(page.getByText("Record Outcome:")).toBeVisible();
  await expect(page.getByLabel("Fixer Name (optional)")).toHaveValue("E2E Staff Fixer");
  expect(await getWorkOrder(id)).toMatchObject({
    status: "pending_assignment", outcome: null, fixer_name: "E2E Staff Fixer", completed_at: null,
  });
});

test("Not Fixed from the volunteer side needs a reason and shows it, with the note", async ({ page, event, asVolunteer }) => {
  const v = await checkIn(event.id, { firstName: "E2E NotFixed" });
  await markPrinted(v.orders[0].id);
  await openVisitor(page, asVolunteer, event.id, "E2E NotFixed Tester");

  await page.getByRole("button", { name: "❌ Not Fixed" }).click();
  await expect(submit(page)).toBeDisabled();
  await expect(page.getByText("Select a reason it wasn't fixed to submit.")).toBeVisible();
  await page.getByRole("button", { name: "Other", exact: true }).click();
  await page.getByLabel("Details (optional)").fill("E2E staff note");
  await expect(page.getByText("Don't include names or contact details. Notes are included in data exports.")).toBeVisible();
  await submit(page).click();

  await expect(page.getByText("Reason: Other")).toBeVisible();
  await expect(page.getByText("Note: E2E staff note")).toBeVisible();
});

test("the fixer page follows a volunteer's edit of the outcome", async ({ page, event, asVolunteer }) => {
  const v = await checkIn(event.id, { firstName: "E2E Follow" });
  const id = v.orders[0].id;
  await markPrinted(id);
  await updateWorkOrder(id, { status: "completed", outcome: "Not Fixed", not_fixed_reason: "Item too worn out", completed_at: new Date().toISOString() });

  await page.goto(`/fix/${id}`);
  await expect(page.getByRole("heading", { name: "Already Completed" })).toBeVisible();
  await expect(page.getByText("Reason: Item too worn out")).toBeVisible();

  await openVisitor(page, asVolunteer, event.id, "E2E Follow Tester");
  await page.getByRole("button", { name: /Edit Outcome/ }).click();
  await expect(page.getByText("Record Outcome:")).toBeVisible();

  await page.goto(`/fix/${id}`);
  await expect(page.getByRole("heading", { name: "Submit Repair Outcome" })).toBeVisible();
});

test("cancel an unprinted item, then undo returns it to Submitted", async ({ page, event, asVolunteer }) => {
  const v = await checkIn(event.id, { firstName: "E2E Cancel" });
  const id = v.orders[0].id;
  await openVisitor(page, asVolunteer, event.id, "E2E Cancel Tester");

  await page.getByRole("button", { name: "✕ Cancel item" }).click();
  await expect(page.getByText("Cancel reason:")).toBeVisible();
  await page.getByRole("button", { name: "Never mind" }).click();
  await expect(page.getByText("Cancel reason:")).toHaveCount(0);

  await page.getByRole("button", { name: "✕ Cancel item" }).click();
  await page.getByRole("button", { name: "Client left" }).click();
  await expect(page.getByText("Cancelled — Client left")).toBeVisible();
  await expect(page.getByRole("button", { name: /Approve & Print/ })).toHaveCount(0);
  expect(await getWorkOrder(id)).toMatchObject({ status: "canceled", outcome: null, cancel_reason: "Client left" });

  await page.getByRole("button", { name: "← Queue" }).click();
  await expect(page.getByRole("button", { name: "Cancelled (1)" })).toBeVisible();
  await expect(page.getByText("(0 waiting)")).toBeVisible();

  await page.getByText("E2E Cancel Tester").click();
  await page.getByRole("button", { name: /Undo Cancel/ }).click();
  await expect(page.getByText("Submitted", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Approve & Print/ })).toBeVisible();
  expect(await getWorkOrder(id)).toMatchObject({ status: "pending", cancel_reason: null, completed_at: null });
});

test("cancel a printed item with Other and a note; undo returns it to Checked-In", async ({ page, event, asVolunteer }) => {
  const v = await checkIn(event.id, { firstName: "E2E CancelPrinted" });
  const id = v.orders[0].id;
  await markPrinted(id);
  await updateWorkOrder(id, { fixer_name: "E2E Cancel Fixer" });
  await openVisitor(page, asVolunteer, event.id, "E2E CancelPrinted Tester");

  await page.getByRole("button", { name: "✕ Cancel item" }).click();
  await page.getByRole("button", { name: "Other", exact: true }).click();
  await page.getByLabel("Details (optional)").fill("E2E cancel note");
  await expect(page.getByText("Don't include names or contact details. Notes are included in data exports.")).toBeVisible();
  await page.getByRole("button", { name: 'Confirm "Other"' }).click();
  await expect(page.getByText("Cancelled — Other")).toBeVisible();
  await expect(page.getByText("Note: E2E cancel note")).toBeVisible();

  await page.getByRole("button", { name: /Undo Cancel/ }).click();
  await expect(page.getByText("Checked-In", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Fixer Name (optional)")).toHaveValue("E2E Cancel Fixer");
  expect(await getWorkOrder(id)).toMatchObject({
    status: "pending_assignment", cancel_reason: null, cancel_note: null, fixer_name: "E2E Cancel Fixer",
  });
});

// Known gap (playbook "known gaps"): submit_fixer_outcome only refuses
// completed items, so a fixer page left open can overwrite a cancel. This pins
// the intended rule and is expected to fail until the RPC is fixed; Playwright
// reports an unexpected pass when it is, so remove test.fail() then.
test("a fixer page left open cannot overwrite a cancel", async ({ page, event }) => {
  test.fail(true, "submit_fixer_outcome doesn't refuse cancelled items yet");
  const v = await checkIn(event.id, { firstName: "E2E Race" });
  const id = v.orders[0].id;
  await markPrinted(id);
  await page.goto(`/fix/${id}`);
  await expect(page.getByRole("heading", { name: "Submit Repair Outcome" })).toBeVisible();
  await updateWorkOrder(id, { status: "canceled", cancel_reason: "Mistake", completed_at: new Date().toISOString() });

  await page.getByLabel("Fixer Name").fill("E2E Late Fixer");
  await page.getByRole("button", { name: "✅ Fixed" }).click();
  await page.getByRole("button", { name: "Submit Outcome" }).click();
  await expect(page.getByText("Something went wrong. Please try again.")).toBeVisible({ timeout: 5_000 });
  expect((await getWorkOrder(id)).status).toBe("canceled");
});
