// Playbook §3: the public check-in form, waiver and confirmation.

import { test, expect } from "./support/fixtures.js";
import { checkInRows, countAttendees, getAttendee, getWorkOrder, updateEvent } from "./support/stack.js";

const field = (page, label) => page.getByLabel(label, { exact: false });
const continueBtn = (page) => page.getByRole("button", { name: "Continue" });
const textingHeading = (page) => page.getByRole("heading", { name: "Get a text when it's your turn" });
const textMeBtn = (page) => page.getByRole("button", { name: "Text me when it's my turn" });
const skipTextsBtn = (page) => page.getByRole("button", { name: "No thanks, skip" });
const smsConsent = (page) => page.getByLabel(/you agree to receive text messages/);

async function fillRequired(page, { first = "E2E Alice", last = "Tester", zip = "95035", item = "E2E Lamp", issue = "Flickers" } = {}) {
  await field(page, "First Name").fill(first);
  await field(page, "Last Name").fill(last);
  await field(page, "Zip Code").fill(zip);
  await page.getByLabel("Item Name").last().fill(item);
  await page.getByLabel("What's wrong with it?").last().fill(issue);
}

test("form shows the event and its item limit", async ({ page, event }) => {
  await page.goto(`/checkin?event=${event.id}`);
  await expect(page.getByText(`${event.name} · ${event.date}`)).toBeVisible();
  await expect(page.getByText("You may bring up to 3 items. Item #1 is your top priority.")).toBeVisible();
  await expect(page.getByText("Primary Item")).toBeVisible();
  await expect(continueBtn(page)).toBeDisabled();
});

test("required fields gate Continue; blanks and spaces don't count", async ({ page, event }) => {
  await page.goto(`/checkin?event=${event.id}`);
  await field(page, "First Name").fill("E2E Alice");
  await field(page, "Last Name").fill("Tester");
  await expect(continueBtn(page)).toBeDisabled();
  await fillRequired(page, { item: "   ", issue: "   " });
  await expect(continueBtn(page)).toBeDisabled();
  await fillRequired(page);
  await expect(continueBtn(page)).toBeEnabled();
});

test("zip accepts only 5 digits and explains a short one", async ({ page, event }) => {
  await page.goto(`/checkin?event=${event.id}`);
  const zip = field(page, "Zip Code");
  await zip.pressSequentially("abc12345678");
  await expect(zip).toHaveValue("12345");
  await zip.fill("123");
  await zip.blur();
  await expect(page.getByText("Please enter a valid 5-digit ZIP code.")).toBeVisible();
  await zip.fill("95035");
  await expect(page.getByText("Please enter a valid 5-digit ZIP code.")).toHaveCount(0);
});

test("email validation drives the newsletter checkbox", async ({ page, event }) => {
  await page.goto(`/checkin?event=${event.id}`);
  const email = field(page, "Email Address");
  const newsletter = page.getByLabel("Subscribe to Repair Café Silicon Valley's newsletter.");
  await expect(newsletter).toBeDisabled();
  await email.fill("qa-at-example");
  await email.blur();
  await expect(page.getByText("Please enter a valid email address, or leave this field blank.")).toBeVisible();
  await expect(newsletter).toBeDisabled();
  await email.fill("alice@example.com");
  await expect(page.getByText("Please enter a valid email address")).toHaveCount(0);
  await expect(newsletter).toBeEnabled();
  await expect(newsletter).toBeChecked();
  await email.fill("");
  await expect(newsletter).toBeDisabled();
});

test("phone is asked on its own texting step, not on the form", async ({ page, event }) => {
  await page.goto(`/checkin?event=${event.id}`);
  await expect(field(page, "Cell Phone")).toHaveCount(0);
  await fillRequired(page);
  await continueBtn(page).click();
  await expect(textingHeading(page)).toBeVisible();
});

test("texting step: phone is formatted, needs 10 digits, and needs consent to continue", async ({ page, event }) => {
  await page.goto(`/checkin?event=${event.id}`);
  await fillRequired(page);
  await continueBtn(page).click();

  const phone = field(page, "Cell Phone");
  await expect(textMeBtn(page)).toBeDisabled();
  await expect(smsConsent(page)).toBeDisabled();
  await expect(skipTextsBtn(page)).toBeEnabled();

  await phone.pressSequentially("(408) 555-01");
  await expect(phone).toHaveValue("408-555-01");
  await phone.blur();
  await expect(page.getByText("Please enter a valid 10-digit phone number, or tap No thanks.")).toBeVisible();
  const nudge = page.getByText("Almost done: tick the box below to get texts.");
  await expect(nudge).toHaveCount(0);
  // Digits past the tenth are dropped.
  await phone.fill("40855501019999");
  await expect(phone).toHaveValue("408-555-0101");
  await expect(page.getByText("Please enter a valid 10-digit phone number")).toHaveCount(0);

  // A valid number alone isn't enough: consent is never pre-ticked.
  await expect(smsConsent(page)).toBeEnabled();
  await expect(smsConsent(page)).not.toBeChecked();
  await expect(textMeBtn(page)).toBeDisabled();
  await expect(nudge).toBeVisible();
  await smsConsent(page).check();
  await expect(nudge).toHaveCount(0);
  await expect(textMeBtn(page)).toBeEnabled();
});

test("skipping texts stores no phone and no consent, even if a number was typed", async ({ page, event }) => {
  await page.goto(`/checkin?event=${event.id}`);
  await fillRequired(page, { first: "E2E Skipper" });
  await continueBtn(page).click();
  await field(page, "Cell Phone").fill("4085550101");
  await skipTextsBtn(page).click();
  await page.getByLabel("I have read and agree to the above waiver").check();
  await page.getByRole("button", { name: "Check In" }).click();

  await expect(page.getByText("Hi E2E Skipper, you're almost done!")).toBeVisible();
  const baseCode = (await page.getByText(/^[A-Z][0-9][A-Z]$/).textContent()).trim();
  const orders = await checkInRows(event.id, baseCode);
  const attendee = await getAttendee(orders[0].attendee_id);
  expect(attendee.phone ?? "").toBe("");
  expect(attendee.text_message_opt_in).toBe(false);
});

test("items can be added up to the limit and removed", async ({ page, event }) => {
  await page.goto(`/checkin?event=${event.id}`);
  const remove = page.getByRole("button", { name: "✕" });
  await expect(remove).toHaveCount(0);
  await page.getByRole("button", { name: "+ Add Item #2" }).click();
  await expect(page.getByText("Item #2")).toBeVisible();
  await expect(remove).toHaveCount(2);
  await page.getByRole("button", { name: "+ Add Item #3" }).click();
  await expect(page.getByRole("button", { name: /\+ Add Item/ })).toHaveCount(0);
  await remove.last().click();
  await expect(page.getByRole("button", { name: "+ Add Item #3" })).toBeVisible();
  await remove.last().click();
  await expect(remove).toHaveCount(0);
});

test("full check-in: waiver, back keeps the form, confirmation codes, data stored", async ({ page, event }) => {
  await page.goto(`/checkin?event=${event.id}`);
  await fillRequired(page, { first: "E2E Alice", item: "E2E Lamp", issue: "Flickers" });
  await field(page, "Email Address").fill("alice@example.com");
  await page.getByRole("button", { name: "+ Add Item #2" }).click();
  await page.getByLabel("Item Name").last().fill("E2E Toaster");
  await page.getByLabel("What's wrong with it?").last().fill("Burns toast");
  await continueBtn(page).click();

  await expect(textingHeading(page)).toBeVisible();
  await field(page, "Cell Phone").fill("4085550101");
  await smsConsent(page).check();
  await textMeBtn(page).click();

  await expect(page.getByRole("heading", { name: "Authorization & Waiver" })).toBeVisible();
  const checkInBtn = page.getByRole("button", { name: "Check In" });
  await expect(checkInBtn).toBeDisabled();

  // Back from the waiver lands on the texting step with the answer kept, and
  // back again on the form with everything kept.
  await page.getByRole("button", { name: "← Back", exact: true }).click();
  await expect(field(page, "Cell Phone")).toHaveValue("408-555-0101");
  await expect(smsConsent(page)).toBeChecked();
  await page.getByRole("button", { name: "← Back to form" }).click();
  await expect(field(page, "First Name")).toHaveValue("E2E Alice");
  await expect(page.getByLabel("Item Name").last()).toHaveValue("E2E Toaster");
  await continueBtn(page).click();
  await expect(field(page, "Cell Phone")).toHaveValue("408-555-0101");
  await textMeBtn(page).click();

  await page.getByLabel("I have read and agree to the above waiver").check();
  await checkInBtn.click();

  await expect(page.getByText("Hi E2E Alice, you're almost done!")).toBeVisible();
  const baseCode = (await page.getByText(/^[A-Z][0-9][A-Z]$/).textContent()).trim();
  await expect(page.getByText(`${baseCode}-1`)).toBeVisible();
  await expect(page.getByText(`${baseCode}-2`)).toBeVisible();
  await expect(page.getByText("E2E Toaster")).toBeVisible();

  // What the RPC stored.
  const orders = await checkInRows(event.id, baseCode);
  expect(orders.map((o) => [o.item_name, o.priority, o.status])).toEqual([
    ["E2E Lamp", 1, "pending"],
    ["E2E Toaster", 2, "pending"],
  ]);
  const attendee = await getAttendee(orders[0].attendee_id);
  expect(attendee).toMatchObject({
    first_name: "E2E Alice",
    last_name: "Tester",
    email: "alice@example.com",
    phone: "4085550101",
    zip_code: "95035",
    newsletter_opt_in: true,
    text_message_opt_in: true,
  });
  expect(await getWorkOrder(orders[1].id)).toMatchObject({ description: "Burns toast" });

  await page.getByRole("button", { name: "Check in another person" }).click();
  await expect(field(page, "First Name")).toHaveValue("");
});

test("event settings hide email, phone and extra items", async ({ page, event }) => {
  await updateEvent(event.id, { collect_email: false, collect_phone: false, max_items: 1 });
  await page.goto(`/checkin?event=${event.id}`);
  await expect(page.getByText("You may bring up to 1 item. Item #1 is your top priority.")).toBeVisible();
  await expect(field(page, "Email Address")).toHaveCount(0);
  await expect(page.getByLabel(/newsletter/)).toHaveCount(0);
  await expect(field(page, "Cell Phone")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /\+ Add Item/ })).toHaveCount(0);

  // With no phone collected, the texting step is skipped entirely, and the
  // waiver's back button returns straight to the form.
  await fillRequired(page);
  await continueBtn(page).click();
  await expect(page.getByRole("heading", { name: "Authorization & Waiver" })).toBeVisible();
  await expect(textingHeading(page)).toHaveCount(0);
  await page.getByRole("button", { name: "← Back to form" }).click();
  await expect(field(page, "First Name")).toHaveValue("E2E Alice");
});

test("a closed event shows the closed card with a way back", async ({ page, event }) => {
  await updateEvent(event.id, { is_open: false });
  await page.goto(`/checkin?event=${event.id}`);
  await expect(page.getByRole("heading", { name: `${event.name} — Check-In Closed` })).toBeVisible();
  await expect(page.getByRole("link", { name: "Click here" })).toHaveAttribute("href", "/");
});

test("a failed submission shows an error and can be retried without duplicates", async ({ page, event }) => {
  await page.goto(`/checkin?event=${event.id}`);
  await fillRequired(page, { first: "E2E Retry" });
  await continueBtn(page).click();
  await skipTextsBtn(page).click();
  await page.getByLabel("I have read and agree to the above waiver").check();

  await page.route("**/rest/v1/rpc/checkin_visitor", (route) => route.abort());
  await page.getByRole("button", { name: "Check In" }).click();
  await expect(page.getByText("Something went wrong. Please try again.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Check In" })).toBeEnabled();

  await page.unroute("**/rest/v1/rpc/checkin_visitor");
  await page.getByRole("button", { name: "Check In" }).click();
  await expect(page.getByText("Hi E2E Retry, you're almost done!")).toBeVisible();
  expect(await countAttendees(event.id, "E2E Retry")).toBe(1);
});
