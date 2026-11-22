// Playbook §6: the status lifecycle from the volunteer side — recording and
// editing outcomes, cancelling and undoing.

import { test, expect } from "./support/fixtures.js";
import { checkIn, getWorkOrder, markPrinted, updateWorkOrder } from "./support/stack.js";
import { ticketPath } from "./support/ticketPath.js";

async function openVisitor(page, asVolunteer, eventId, name) {
  await asVolunteer(`/admin?event=${eventId}`);
  await page.getByText(name).click();
  await expect(page.getByRole("button", { name: "← Queue" })).toBeVisible();
}

const submit = (page) => page.getByRole("button", { name: "Submit Outcome" });

// The volunteer card collapses its actions to a button stack, so the outcome
// panel has to be opened before anything inside it can be driven. Distinct from
// "Submit Outcome" above, which is the panel's own commit button.
const openOutcome = (page) =>
  page.getByRole("button", { name: "✅ Record Outcome" }).click();

test("record Fixed with a saved fixer name, then edit it back to Checked-In", async ({ page, event, asVolunteer }) => {
  const v = await checkIn(event.id, { firstName: "E2E Outcome" });
  const id = v.orders[0].id;
  await markPrinted(id);
  // Claimed by a fixer's QR scan, as claim-and-notify would leave it.
  const claimedAt = "2026-01-01T10:00:00.000Z";
  await updateWorkOrder(id, { status: "assigned", fixer_name: "E2E Staff Fixer", assigned_at: claimedAt });
  await openVisitor(page, asVolunteer, event.id, "E2E Outcome Tester");

  await openOutcome(page);
  await expect(page.getByLabel("Fixer Name (optional)")).toHaveValue("E2E Staff Fixer");
  await expect(submit(page)).toBeDisabled();
  await expect(page.getByText("Select an outcome to submit.")).toBeVisible();
  await page.getByRole("button", { name: "✅ Fixed" }).click();
  await submit(page).click();

  await expect(page.getByText("Completed", { exact: true })).toBeVisible();
  await expect(page.getByText("by E2E Staff Fixer")).toBeVisible();
  await expect(page.getByLabel("Item Name")).toHaveCount(0);
  const completed = await getWorkOrder(id);
  expect(completed).toMatchObject({ status: "completed", outcome: "Fixed", fixer_name: "E2E Staff Fixer" });
  // Recording the outcome leaves the claim time alone.
  expect(Date.parse(completed.assigned_at)).toBe(Date.parse(claimedAt));

  // Edit Outcome puts it back on the board unclaimed: the claim time goes,
  // the fixer's name stays.
  await page.getByRole("button", { name: /Edit Outcome/ }).click();
  await expect(page.getByText("Checked-In", { exact: true })).toBeVisible();
  await openOutcome(page);
  await expect(page.getByText("Record Outcome:")).toBeVisible();
  await expect(page.getByLabel("Fixer Name (optional)")).toHaveValue("E2E Staff Fixer");
  expect(await getWorkOrder(id)).toMatchObject({
    status: "pending_assignment", outcome: null, fixer_name: "E2E Staff Fixer", completed_at: null, assigned_at: null,
  });
});

test("Not Fixed from the volunteer side needs a reason and shows it, with the note", async ({ page, event, asVolunteer }) => {
  const v = await checkIn(event.id, { firstName: "E2E NotFixed" });
  await markPrinted(v.orders[0].id);
  await openVisitor(page, asVolunteer, event.id, "E2E NotFixed Tester");

  await openOutcome(page);
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

  await page.goto(ticketPath(id));
  await expect(page.getByRole("heading", { name: "Already Completed" })).toBeVisible();
  await expect(page.getByText("Reason: Item too worn out")).toBeVisible();

  await openVisitor(page, asVolunteer, event.id, "E2E Follow Tester");
  await page.getByRole("button", { name: /Edit Outcome/ }).click();
  await openOutcome(page);
  await expect(page.getByText("Record Outcome:")).toBeVisible();

  // Reopening sends the item back to pending_assignment — it is on the board
  // again, so the ticket asks to be claimed rather than jumping to an outcome.
  // Whoever picks it up next gets recorded, same as the first time.
  await page.goto(ticketPath(id));
  await expect(page.getByRole("heading", { name: "Start Working on This Item" })).toBeVisible();
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
  // Never claimed by a QR scan, so closing it out leaves no claim time.
  expect((await getWorkOrder(id)).assigned_at).toBeNull();

  await page.getByRole("button", { name: /Undo Cancel/ }).click();
  await expect(page.getByText("Checked-In", { exact: true })).toBeVisible();
  await openOutcome(page);
  await expect(page.getByLabel("Fixer Name (optional)")).toHaveValue("E2E Cancel Fixer");
  expect(await getWorkOrder(id)).toMatchObject({
    status: "pending_assignment", cancel_reason: null, cancel_note: null, fixer_name: "E2E Cancel Fixer", assigned_at: null,
  });
});

// ─── The desk assigns an item to a fixer ───
// For a fixer who took the ticket without scanning it. Goes through
// claim-and-notify, like the fixer's own claim on the ticket page.

const openAssign = (page) =>
  page.getByRole("button", { name: "👤 Assign to Fixer" }).click();

test("the desk assigns a printed item to a fixer without texting", async ({ page, event, asVolunteer }) => {
  const v = await checkIn(event.id, { firstName: "E2E Assign" });
  const id = v.orders[0].id;
  await markPrinted(id);
  await openVisitor(page, asVolunteer, event.id, "E2E Assign Tester");

  await openAssign(page);
  // No phone on file, so only the quiet button, and it needs a name first.
  await expect(page.getByRole("button", { name: "Assign & text client" })).toHaveCount(0);
  const assign = page.getByRole("button", { name: "Assign to fixer" });
  await expect(assign).toBeDisabled();
  await page.getByLabel("Fixer Name").fill("E2E Desk Fixer");
  await assign.click();

  await expect(page.getByText("Assigned to E2E Desk Fixer.")).toBeVisible();
  await expect(page.getByText("Claimed by E2E Desk Fixer")).toBeVisible();
  await expect(page.getByText("With Fixer", { exact: true })).toBeVisible();
  const wo = await getWorkOrder(id);
  expect(wo).toMatchObject({ status: "assigned", fixer_name: "E2E Desk Fixer" });
  expect(wo.assigned_at).not.toBeNull();
});

test("a textable client gets both assign buttons", async ({ page, event, asVolunteer }) => {
  const v = await checkIn(event.id, { firstName: "E2E Textable", phone: "4085550199", textMessage: true });
  const id = v.orders[0].id;
  await markPrinted(id);
  await openVisitor(page, asVolunteer, event.id, "E2E Textable Tester");

  await openAssign(page);
  await expect(page.getByRole("button", { name: "Assign & text client" })).toBeVisible();
  const quiet = page.getByRole("button", { name: "Assign without texting" });
  await expect(quiet).toBeVisible();

  await page.getByLabel("Fixer Name").fill("E2E Regular Fixer");
  await quiet.click();
  // not_requested: the desk's own choice.
  await expect(page.getByText("No text sent")).toBeVisible();
  expect(await getWorkOrder(id)).toMatchObject({ status: "assigned", fixer_name: "E2E Regular Fixer" });
});

test("an unprinted item can't be assigned yet", async ({ page, event, asVolunteer }) => {
  await checkIn(event.id, { firstName: "E2E Unprinted" });
  await openVisitor(page, asVolunteer, event.id, "E2E Unprinted Tester");
  await expect(page.getByRole("button", { name: "✕ Cancel item" })).toBeVisible();
  await expect(page.getByRole("button", { name: "👤 Assign to Fixer" })).toHaveCount(0);
});

test("assigning doesn't overwrite a fixer who claimed by QR meanwhile", async ({ page, event, asVolunteer }) => {
  const v = await checkIn(event.id, { firstName: "E2E Raced" });
  const id = v.orders[0].id;
  await markPrinted(id);
  await openVisitor(page, asVolunteer, event.id, "E2E Raced Tester");

  await openAssign(page);
  await page.getByLabel("Fixer Name").fill("E2E Too Late");
  // The fixer scans the ticket while the desk is typing.
  await updateWorkOrder(id, { status: "assigned", fixer_name: "E2E Scanner", assigned_at: new Date().toISOString() });
  await page.getByRole("button", { name: "Assign to fixer" }).click();

  await expect(page.getByText("This item was just claimed by E2E Scanner.")).toBeVisible();
  expect(await getWorkOrder(id)).toMatchObject({ status: "assigned", fixer_name: "E2E Scanner" });
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
  // Claimed, so the outcome form is what's open when the cancel lands.
  await updateWorkOrder(id, { status: "assigned", assigned_at: new Date().toISOString() });
  await page.goto(ticketPath(id));
  await expect(page.getByRole("heading", { name: "Submit Repair Outcome" })).toBeVisible();
  await updateWorkOrder(id, { status: "canceled", cancel_reason: "Mistake", completed_at: new Date().toISOString() });

  await page.getByLabel("Fixer Name").fill("E2E Late Fixer");
  await page.getByRole("button", { name: "✅ Fixed" }).click();
  await page.getByRole("button", { name: "Submit Outcome" }).click();
  await expect(page.getByText("Something went wrong. Please try again.")).toBeVisible({ timeout: 5_000 });
  expect((await getWorkOrder(id)).status).toBe("canceled");
});
