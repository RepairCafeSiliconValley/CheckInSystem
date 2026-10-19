// Unit tests for src/lib/metrics.js, the one place every Queue, Admin and
// Metrics number comes from. Plain node:test, no browser or database:
//
//   npm run test:unit

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeMetrics,
  computeByEvent,
  formatEventDate,
  formatKg,
  formatPct,
  plural,
  submittedStamp,
  summaryText,
  UNCATEGORIZED,
  UNSPECIFIED,
} from "../../src/lib/metrics.js";
import { CANCEL_REASONS, NOT_FIXED_REASONS, OUTCOMES, STATUSES } from "../../src/lib/constants.js";

// ── Fixture: one event worth of rows, shaped like fetchMetricsRows() ──
// Alice: two items, one Fixed (2.5 kg), one Not Fixed / Other (1.2 kg).
// Bob: one item, still waiting (pending).
// Carol (volunteer): one Taken Home, one cancelled, one printed and open.
// Dan: one item cancelled, so he is no longer an active client.
const EVENT = { id: "ev1", name: "QA Event", date: "2026-10-12", location: "QA Lab", collect_weight: true };
const attendees = [
  { id: "a", event_id: "ev1", is_volunteer: false, newsletter_opt_in: true, zip_code: "95035", created_at: "2026-10-12T17:00:00Z" },
  { id: "b", event_id: "ev1", is_volunteer: false, newsletter_opt_in: false, zip_code: "94040", created_at: "2026-10-12T17:05:00Z" },
  { id: "c", event_id: "ev1", is_volunteer: true, newsletter_opt_in: false, zip_code: "95035 ", created_at: "2026-10-12T17:10:00Z" },
  { id: "d", event_id: "ev1", is_volunteer: false, newsletter_opt_in: false, zip_code: "", created_at: "2026-10-12T17:15:00Z" },
];
const orders = [
  { id: "a1", event_id: "ev1", attendee_id: "a", status: "completed", outcome: "Fixed", category: "Electronics", fixer_name: "Pat", weight_kg: "2.5", created_at: "2026-10-12T17:00:00Z", printed_at: "2026-10-12T17:20:00Z", completed_at: "2026-10-12T18:00:00Z" },
  { id: "a2", event_id: "ev1", attendee_id: "a", status: "completed", outcome: "Not Fixed", not_fixed_reason: "Other", category: "Electronics", fixer_name: " pat ", weight_kg: 1.2, created_at: "2026-10-12T17:00:00Z", printed_at: "2026-10-12T17:20:00Z", completed_at: "2026-10-12T19:00:00Z" },
  { id: "b1", event_id: "ev1", attendee_id: "b", status: "pending", category: null, created_at: "2026-10-12T17:05:00Z" },
  { id: "c1", event_id: "ev1", attendee_id: "c", status: "completed", outcome: "Taken Home", category: "Bikes", fixer_name: "Sam", created_at: "2026-10-12T17:10:00Z", printed_at: "2026-10-12T17:30:00Z", completed_at: "2026-10-12T18:30:00Z" },
  { id: "c2", event_id: "ev1", attendee_id: "c", status: "canceled", outcome: null, cancel_reason: "Client left", category: "Bikes", weight_kg: "", created_at: "2026-10-12T17:10:00Z", completed_at: "2026-10-12T18:00:00Z" },
  { id: "c3", event_id: "ev1", attendee_id: "c", status: "pending_assignment", category: "  ", created_at: "2026-10-12T17:10:00Z", printed_at: "2026-10-12T17:30:00Z" },
  { id: "d1", event_id: "ev1", attendee_id: "d", status: "canceled", outcome: null, cancel_reason: "Never Checked In", created_at: "2026-10-12T17:15:00Z", completed_at: "2026-10-12T17:45:00Z" },
];
const m = computeMetrics({ attendees, orders, events: [EVENT] });
const countOf = (rows, label) => rows.find((r) => r.label === label)?.count;

test("clients: totals, active, waiting, volunteers, newsletter, zips", () => {
  assert.equal(m.clients.total, 4);
  assert.equal(m.clients.active, 3, "Dan had every item cancelled");
  assert.equal(m.clients.waiting, 1, "only Bob has nothing touched; Carol has finished items");
  assert.equal(m.clients.volunteers, 1);
  assert.equal(m.clients.public, 3);
  assert.equal(m.clients.newsletter, 1);
  assert.equal(m.clients.newsletterRate, 25);
  assert.equal(m.clients.zipCount, 2, "zips are trimmed and blanks skipped");
  assert.deepEqual(m.clients.topZips[0], { zip: "95035", count: 2 });
});

test("a client with no work orders never counts as waiting", () => {
  const solo = computeMetrics({ attendees: [{ id: "x" }], orders: [] });
  assert.equal(solo.clients.waiting, 0);
});

test("an item with a fixer (assigned) stops the client waiting", () => {
  const r = computeMetrics({
    attendees: [{ id: "x" }],
    orders: [{ id: "x1", attendee_id: "x", status: "assigned" }],
  });
  assert.equal(r.clients.waiting, 0);
});

test("items and pipeline list every status, in order, even at zero", () => {
  assert.equal(m.items.total, 7);
  assert.equal(m.items.active, 5);
  assert.equal(m.items.avgPerClient, 7 / 4);
  assert.deepEqual(m.pipeline.map((p) => p.key), STATUSES.map((s) => s.key));
  assert.deepEqual(
    Object.fromEntries(m.pipeline.map((p) => [p.key, p.count])),
    { pending: 1, pending_assignment: 1, assigned: 0, completed: 3, canceled: 2 },
  );
});

test("an unrecognised status is appended, not dropped", () => {
  const r = computeMetrics({ attendees: [], orders: [{ id: "z", status: "teleported" }] });
  const last = r.pipeline.at(-1);
  assert.equal(last.key, "teleported");
  assert.equal(last.known, false);
  assert.equal(last.count, 1);
});

test("outcomes count completed items only and include every outcome", () => {
  assert.equal(m.outcomes.completed, 3);
  assert.deepEqual(m.outcomes.rows.map((r) => r.label), OUTCOMES);
  assert.equal(countOf(m.outcomes.rows, "Fixed"), 1);
  assert.equal(countOf(m.outcomes.rows, "Diagnosed"), 0);
  assert.equal(countOf(m.outcomes.rows, "Not Fixed"), 1);
  assert.equal(countOf(m.outcomes.rows, "Taken Home"), 1);
  assert.equal(m.outcomes.fixed, 1);
  assert.ok(Math.abs(m.outcomes.fixRate - 100 / 3) < 1e-9);
});

test("a completed item with no outcome lands in Unspecified, so rows sum to completed", () => {
  const r = computeMetrics({ attendees: [], orders: [{ id: "z", status: "completed", outcome: null }] });
  assert.equal(countOf(r.outcomes.rows, UNSPECIFIED), 1);
  assert.equal(r.outcomes.rows.reduce((s, row) => s + row.count, 0), r.outcomes.completed);
});

test("reason breakdowns list every canonical reason plus the counts", () => {
  assert.deepEqual(m.notFixedReasons.map((r) => r.label), NOT_FIXED_REASONS);
  assert.equal(countOf(m.notFixedReasons, "Other"), 1);
  assert.deepEqual(m.cancelReasons.map((r) => r.label), CANCEL_REASONS);
  assert.equal(countOf(m.cancelReasons, "Client left"), 1);
  assert.equal(countOf(m.cancelReasons, "Never Checked In"), 1);
});

test("a legacy cancel reason is appended as unrecognised", () => {
  const r = computeMetrics({ attendees: [], orders: [{ id: "z", status: "canceled", cancel_reason: "No Show" }] });
  const extra = r.cancelReasons.find((x) => x.label === "No Show");
  assert.equal(extra.known, false);
  assert.equal(extra.count, 1);
});

test("categories: blank and missing are Uncategorized, listed last", () => {
  assert.equal(m.uncategorized, 3, "null, blank and whitespace-only categories");
  assert.equal(m.categorized, 4);
  const last = m.categories.at(-1);
  assert.equal(last.label, UNCATEGORIZED);
  assert.equal(last.known, false);
  const electronics = m.categories.find((c) => c.label === "Electronics");
  assert.equal(electronics.count, 2);
  assert.equal(electronics.completed, 2);
  assert.equal(electronics.fixRate, 50);
  assert.equal(electronics.topNotFixedReason.label, "Other");
  const bikes = m.categories.find((c) => c.label === "Bikes");
  assert.equal(bikes.canceled, 1);
});

test("fixers fold case and whitespace, keeping the first spelling", () => {
  assert.equal(m.fixers.length, 2);
  assert.equal(m.fixers[0].name, "Pat");
  assert.equal(m.fixers[0].count, 2);
  assert.equal(m.fixers[0].fixed, 1);
});

test("weight: string numerics sum, blanks are not zero, rows add up", () => {
  assert.equal(m.weight.present, true);
  assert.equal(m.weight.weighedItems, 2, "the empty-string weight is not weighed");
  assert.ok(Math.abs(m.weight.totalKg - 3.7) < 1e-9);
  assert.ok(Math.abs(m.weight.divertedKg - 2.5) < 1e-9);
  assert.equal(m.weight.eligibleItems, 7);
  const byOutcomeSum = m.weight.byOutcome.reduce((s, r) => s + r.kg, 0);
  assert.ok(Math.abs(byOutcomeSum - m.weight.totalKg) < 1e-9);
});

test("weight coverage counts only events that collect weight", () => {
  const off = { ...EVENT, id: "ev2", collect_weight: false };
  const r = computeMetrics({
    attendees: [],
    orders: [...orders, { id: "o2", event_id: "ev2", status: "pending" }],
    events: [EVENT, off],
  });
  assert.equal(r.weight.eligibleItems, 7);
  assert.equal(r.weight.hasNonCollectingEvents, true);
});

test("timing uses completed items only", () => {
  assert.equal(m.timing.sampleSize, 3);
  assert.equal(m.timing.medianCheckinToDone, 80 * 60 * 1000, "median of 60, 80 and 120 minutes");
});

test("computeByEvent splits rows per event, in the order given", () => {
  const other = { id: "ev2", name: "Other", date: "2026-11-01" };
  const byEvent = computeByEvent(
    { attendees: [...attendees, { id: "z", event_id: "ev2" }], orders },
    [other, EVENT],
  );
  assert.deepEqual(byEvent.map((e) => e.event.id), ["ev2", "ev1"]);
  assert.equal(byEvent[0].metrics.clients.total, 1);
  assert.equal(byEvent[0].metrics.items.total, 0);
  assert.equal(byEvent[1].metrics.items.total, 7);
});

test("empty input gives zeros and nulls, never NaN", () => {
  const r = computeMetrics();
  assert.equal(r.clients.total, 0);
  assert.equal(r.items.avgPerClient, null);
  assert.equal(r.outcomes.fixRate, null);
  assert.equal(r.weight.present, false);
});

test("formatting helpers", () => {
  assert.equal(formatEventDate("2026-03-15"), "Mar 15, 2026");
  assert.equal(formatEventDate(""), "");
  assert.equal(formatKg(3.75), "3.8 kg");
  assert.equal(formatKg(null), "—");
  assert.equal(formatPct(null), "—");
  assert.equal(formatPct(33.333, 1), "33.3%");
  assert.equal(plural(1, "client"), "1 client");
  assert.equal(plural(2, "client"), "2 clients");
});

test("submittedStamp prefers the attendee row, else the earliest order", () => {
  assert.equal(submittedStamp({ created_at: "T2" }, [{ created_at: "T1" }]), "T2");
  assert.equal(submittedStamp({}, [{ created_at: "T3" }, { created_at: "T1" }]), "T1");
  assert.equal(submittedStamp(null, []), null);
});

test("summaryText carries the same figures as the screen", () => {
  const text = summaryText(m, [EVENT]);
  assert.match(text, /^QA Event — Oct 12, 2026 \(QA Lab\)/);
  assert.match(text, /4 clients \(1 had every item cancelled\)/);
  assert.match(text, /7 items \(2 cancelled\)/);
  assert.match(text, /Outcomes \(of 3 completed items\)/);
  assert.match(text, /3\.7 kg handled in total/);
  assert.match(text, /2 fixers recorded outcomes/);
});
