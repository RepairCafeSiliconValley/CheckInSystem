// Pure aggregation over raw attendee + work_order rows. No I/O, no React.
//
// Every number shown on the Queue, Admin and Metrics tabs comes from here, so
// the three screens can't drift apart. Feed it the output of
// fetchMetricsRows() from store.js.
//
// Two conventions worth knowing:
//   • Breakdowns list every canonical value even at zero (the UI dims those),
//     then append anything unrecognised under its own row. Unknown values are
//     never silently dropped — that's how the next round of data drift becomes
//     visible instead of invisible.
//   • status is the authority on whether an item finished; outcome is the
//     authority on how. See docs/status-outcome-overhaul.md.

import {
  CATEGORIES,
  CANCEL_REASONS,
  NOT_FIXED_REASONS,
  OUTCOMES,
  OUTCOME_COLORS,
  STATUSES,
  // Explicit extension so this pure module can also be run/tested under plain
  // node, not just through Vite's resolver.
} from "./constants.js";

export const UNCATEGORIZED = "Uncategorized";
export const UNSPECIFIED = "Unspecified";

// ─── small helpers ───

export function pct(count, total) {
  return total > 0 ? (count / total) * 100 : null;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Counts `values` and returns one row per canonical entry (in canonical order,
// zeros included) followed by any unrecognised value found in the data.
function breakdown(values, canonical) {
  const counts = new Map();
  values.forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));

  const rows = canonical.map((label) => ({
    label,
    count: counts.get(label) || 0,
    known: true,
  }));
  const extras = [...counts.keys()]
    .filter((label) => !canonical.includes(label))
    .sort((a, b) => counts.get(b) - counts.get(a))
    .map((label) => ({ label, count: counts.get(label), known: false }));

  return [...rows, ...extras];
}

const isCanceled = (o) => o.status === "canceled";
const isCompleted = (o) => o.status === "completed";
const isOpen = (o) => !isCompleted(o) && !isCanceled(o);
const categoryOf = (o) => (o.category || "").trim() || UNCATEGORIZED;

function durationMs(from, to) {
  if (!from || !to) return null;
  const ms = new Date(to).getTime() - new Date(from).getTime();
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

// work_orders.weight_kg is a Postgres `numeric`, which can reach JS as a
// STRING depending on the serialization path. Coerce every read — a bare `+`
// on unconverted values would concatenate instead of summing.
// NULL/"" means "not weighed", which is NOT the same as 0, so those return
// null and are excluded from sums, averages and coverage alike.
function weightOf(order) {
  if (order.weight_kg === null || order.weight_kg === undefined || order.weight_kg === "") {
    return null;
  }
  const kg = Number(order.weight_kg);
  return Number.isFinite(kg) && kg >= 0 ? kg : null;
}

const isWeighed = (o) => weightOf(o) !== null;
const sumKg = (list) => list.reduce((total, o) => total + (weightOf(o) || 0), 0);

// ─── main ───

/**
 * @param {{attendees: object[], orders: object[], events?: object[]}} rows
 *   `events` is optional and used only to scope weight coverage — callers that
 *   omit it (e.g. the Queue tab) get `weight.eligibleItems === null`.
 * @returns aggregated metrics for whatever scope `rows` represents
 */
export function computeMetrics({ attendees = [], orders = [], events = null } = {}) {
  // ── clients ──
  const ordersByAttendee = new Map();
  orders.forEach((o) => {
    if (!ordersByAttendee.has(o.attendee_id)) ordersByAttendee.set(o.attendee_id, []);
    ordersByAttendee.get(o.attendee_id).push(o);
  });

  const clientOrderLists = attendees.map((a) => ordersByAttendee.get(a.id) || []);
  const clientsActive = clientOrderLists.filter((list) =>
    list.some((o) => !isCanceled(o))
  ).length;
  const clientsWaiting = clientOrderLists.filter((list) => list.some(isOpen)).length;

  const zips = attendees.map((a) => (a.zip_code || "").trim()).filter(Boolean);
  const zipCounts = new Map();
  zips.forEach((z) => zipCounts.set(z, (zipCounts.get(z) || 0) + 1));
  const newsletter = attendees.filter((a) => a.newsletter_opt_in).length;
  const volunteers = attendees.filter((a) => a.is_volunteer).length;

  const clients = {
    total: attendees.length,
    active: clientsActive,
    waiting: clientsWaiting,
    volunteers,
    public: attendees.length - volunteers,
    newsletter,
    newsletterRate: pct(newsletter, attendees.length),
    zipCount: zipCounts.size,
    topZips: [...zipCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([zip, count]) => ({ zip, count })),
  };

  // ── items + pipeline ──
  const canceledOrders = orders.filter(isCanceled);
  const completedOrders = orders.filter(isCompleted);

  const statusCounts = new Map();
  orders.forEach((o) => statusCounts.set(o.status, (statusCounts.get(o.status) || 0) + 1));
  const knownStatusKeys = STATUSES.map((s) => s.key);
  const pipeline = [
    ...STATUSES.map((s) => ({
      key: s.key,
      label: s.label,
      color: s.color,
      count: statusCounts.get(s.key) || 0,
      known: true,
    })),
    ...[...statusCounts.keys()]
      .filter((k) => !knownStatusKeys.includes(k))
      .map((k) => ({
        key: k,
        label: k,
        color: "#98a2b3",
        count: statusCounts.get(k),
        known: false,
      })),
  ];

  const items = {
    total: orders.length,
    active: orders.length - canceledOrders.length,
    avgPerClient: attendees.length ? orders.length / attendees.length : null,
  };

  // ── outcomes (denominator is completed items) ──
  // A completed row should always carry an outcome; bucket any that don't as
  // Unspecified so the rows always sum back to `completed`.
  const outcomeRows = breakdown(
    completedOrders.map((o) => o.outcome || UNSPECIFIED),
    OUTCOMES
  ).map((r) => ({
    ...r,
    pct: pct(r.count, completedOrders.length),
    color: OUTCOME_COLORS[r.label] || "#98a2b3",
  }));

  const countOutcome = (name) => completedOrders.filter((o) => o.outcome === name).length;
  const fixed = countOutcome("Fixed");
  const diagnosed = countOutcome("Diagnosed");

  const outcomes = {
    completed: completedOrders.length,
    rows: outcomeRows.filter((r) => r.known || r.count > 0),
    fixed,
    fixRate: pct(fixed, completedOrders.length),
    successRate: pct(fixed + diagnosed, completedOrders.length),
  };

  // ── reason breakdowns ──
  const notFixedOrders = completedOrders.filter((o) => o.outcome === "Not Fixed");
  const notFixedReasons = breakdown(
    notFixedOrders.map((o) => (o.not_fixed_reason || "").trim() || UNSPECIFIED),
    NOT_FIXED_REASONS
  ).filter((r) => r.known || r.count > 0);

  const cancelReasons = breakdown(
    canceledOrders.map((o) => (o.cancel_reason || "").trim() || UNSPECIFIED),
    CANCEL_REASONS
  ).filter((r) => r.known || r.count > 0);

  // ── categories ──
  // Staff assign a category after check-in, so in-flight items legitimately
  // have none. `categorized` vs `total` makes that gap visible rather than
  // making it look like items went missing.
  const ordersByCategory = new Map();
  orders.forEach((o) => {
    const c = categoryOf(o);
    if (!ordersByCategory.has(c)) ordersByCategory.set(c, []);
    ordersByCategory.get(c).push(o);
  });

  const extraCategories = [...ordersByCategory.keys()].filter(
    (c) => c !== UNCATEGORIZED && !CATEGORIES.includes(c)
  );

  const buildCategory = (label) => {
    const list = ordersByCategory.get(label) || [];
    const done = list.filter(isCompleted);
    const catFixed = done.filter((o) => o.outcome === "Fixed").length;
    const notFixed = done.filter((o) => o.outcome === "Not Fixed");
    const reasonRows = breakdown(
      notFixed.map((o) => (o.not_fixed_reason || "").trim() || UNSPECIFIED),
      NOT_FIXED_REASONS
    )
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count);

    return {
      label,
      count: list.length,
      pct: pct(list.length, orders.length),
      completed: done.length,
      canceled: list.filter(isCanceled).length,
      open: list.filter(isOpen).length,
      fixed: catFixed,
      fixRate: pct(catFixed, done.length),
      // Same Unspecified bucketing as the top-level outcomes, so an expanded
      // category's rows always sum back to its own completed count.
      outcomes: breakdown(
        done.map((o) => o.outcome || UNSPECIFIED),
        OUTCOMES
      )
        .filter((r) => r.known || r.count > 0)
        .map((r) => ({
          label: r.label,
          count: r.count,
          color: OUTCOME_COLORS[r.label] || "#98a2b3",
        })),
      topNotFixedReason: reasonRows[0] || null,
      known: label !== UNCATEGORIZED,
    };
  };

  const categories = [
    ...[...CATEGORIES, ...extraCategories]
      .map(buildCategory)
      .sort((a, b) => b.count - a.count),
    // "not triaged yet" is a gap, not a category — always last.
    ...(ordersByCategory.has(UNCATEGORIZED) ? [buildCategory(UNCATEGORIZED)] : []),
  ];
  const uncategorized = (ordersByCategory.get(UNCATEGORIZED) || []).length;

  // ── fixers ──
  // fixer_name is free text typed on the public /fix page, so fold on
  // case + whitespace and display the first spelling seen.
  const fixerMap = new Map();
  completedOrders.forEach((o) => {
    const name = (o.fixer_name || "").trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (!fixerMap.has(key)) fixerMap.set(key, { name, count: 0 });
    fixerMap.get(key).count += 1;
  });
  const fixers = [...fixerMap.values()].sort((a, b) => b.count - a.count);

  // ── timing (completed only — completed_at is also stamped on cancel) ──
  const checkinToDone = completedOrders
    .map((o) => durationMs(o.created_at, o.completed_at))
    .filter((v) => v !== null);
  const printToDone = completedOrders
    .map((o) => durationMs(o.printed_at, o.completed_at))
    .filter((v) => v !== null);

  const timing = {
    medianCheckinToDone: median(checkinToDone),
    medianPrintToDone: median(printToDone),
    sampleSize: checkinToDone.length,
  };

  // ── completions per hour (only meaningful for a single event) ──
  const hourCounts = new Map();
  completedOrders.forEach((o) => {
    if (!o.completed_at) return;
    const h = new Date(o.completed_at).getHours();
    hourCounts.set(h, (hourCounts.get(h) || 0) + 1);
  });
  const completionsByHour = [...hourCounts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hour, count]) => ({ hour, count }));

  // ── weight ──
  // Opt-in per event (events.collect_weight, default false) and entered by
  // coordinators, so most scopes have none at all. `present` gates the whole
  // feature so nothing weight-shaped appears for events that don't collect it.
  const weighedOrders = orders.filter(isWeighed);
  const totalKg = sumKg(weighedOrders);
  const divertedKg = sumKg(
    weighedOrders.filter((o) => isCompleted(o) && o.outcome === "Fixed")
  );

  // Coverage denominator counts only items at events that opted in — including
  // events that never collect weight would make coverage look far worse than
  // it is. Null when the caller didn't supply events.
  const collectingIds = events
    ? new Set(events.filter((e) => e.collect_weight === true).map((e) => e.id))
    : null;
  const eligibleItems = collectingIds
    ? orders.filter((o) => collectingIds.has(o.event_id)).length
    : null;

  // Rows cover every weighed item, so they sum back to totalKg: the four
  // outcomes, plus buckets for weighed items that are cancelled or still open.
  const weightByOutcome = [
    ...OUTCOMES.map((name) => ({
      label: name,
      kg: sumKg(weighedOrders.filter((o) => isCompleted(o) && o.outcome === name)),
      color: OUTCOME_COLORS[name],
    })),
    {
      label: UNSPECIFIED,
      kg: sumKg(weighedOrders.filter((o) => isCompleted(o) && !o.outcome)),
      color: "#98a2b3",
    },
    {
      label: "Still open",
      kg: sumKg(weighedOrders.filter(isOpen)),
      color: "#1e3a6e",
    },
    {
      label: "Cancelled",
      kg: sumKg(weighedOrders.filter(isCanceled)),
      color: "#667085",
    },
  ].filter((r) => r.kg > 0);

  const weightByCategory = [...ordersByCategory.entries()]
    .map(([label, list]) => {
      const weighed = list.filter(isWeighed);
      return { label, kg: sumKg(weighed), weighedItems: weighed.length };
    })
    .filter((c) => c.weighedItems > 0)
    .sort((a, b) => b.kg - a.kg);

  const weight = {
    present: weighedOrders.length > 0,
    weighedItems: weighedOrders.length,
    totalKg,
    divertedKg,
    avgKg: weighedOrders.length ? totalKg / weighedOrders.length : null,
    eligibleItems,
    coverage: pct(weighedOrders.length, eligibleItems ?? orders.length),
    // True when the scope mixes collecting and non-collecting events, so the
    // UI can explain why coverage skips some items.
    hasNonCollectingEvents: collectingIds
      ? events.some((e) => e.collect_weight !== true)
      : false,
    byOutcome: weightByOutcome,
    byCategory: weightByCategory,
  };

  return {
    clients,
    items,
    pipeline,
    outcomes,
    notFixedReasons,
    cancelReasons,
    categories,
    categorized: orders.length - uncategorized,
    uncategorized,
    fixers,
    timing,
    completionsByHour,
    weight,
  };
}

/**
 * Per-event metrics, grouping the raw rows once instead of refetching.
 * @param rows output of fetchMetricsRows
 * @param events event records, in the order you want them back
 */
export function computeByEvent(rows, events) {
  const attByEvent = new Map();
  const ordByEvent = new Map();
  (rows.attendees || []).forEach((a) => {
    if (!attByEvent.has(a.event_id)) attByEvent.set(a.event_id, []);
    attByEvent.get(a.event_id).push(a);
  });
  (rows.orders || []).forEach((o) => {
    if (!ordByEvent.has(o.event_id)) ordByEvent.set(o.event_id, []);
    ordByEvent.get(o.event_id).push(o);
  });

  return events.map((event) => ({
    event,
    metrics: computeMetrics({
      attendees: attByEvent.get(event.id) || [],
      orders: ordByEvent.get(event.id) || [],
      // Single-event scope, so coverage is measured against this event alone.
      events: [event],
    }),
  }));
}

// ─── formatting ───

export function formatPct(value, digits = 0) {
  return value === null || value === undefined ? "—" : `${value.toFixed(digits)}%`;
}

export function formatKg(kg, withUnit = true) {
  if (kg === null || kg === undefined || !Number.isFinite(kg)) return "—";
  // One decimal: the column stores 2dp but 10g precision is noise in a total.
  return `${kg.toFixed(1)}${withUnit ? " kg" : ""}`;
}

export function formatDuration(ms) {
  if (ms === null || ms === undefined) return "—";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

/**
 * Plain-text summary for pasting into an email or newsletter.
 * Reads top-down the same way the screen does.
 */
export function summaryText(m, scopeLabel) {
  const lines = [scopeLabel, ""];

  const lostClients = m.clients.total - m.clients.active;
  const canceledItems = m.items.total - m.items.active;
  lines.push(
    `${m.clients.total} clients${lostClients ? ` (${lostClients} had every item cancelled)` : ""}`
  );
  lines.push(`${m.items.total} items${canceledItems ? ` (${canceledItems} cancelled)` : ""}`);
  lines.push("");

  m.pipeline.forEach((p) => lines.push(`${p.count} ${p.label}`));
  lines.push("");

  lines.push(`Outcomes (of ${m.outcomes.completed} completed items)`);
  m.outcomes.rows.forEach((r) =>
    lines.push(`  ${r.count} ${r.label} — ${formatPct(r.pct)}`)
  );
  lines.push(`  Fix rate: ${formatPct(m.outcomes.fixRate)}`);
  lines.push("");

  if (m.weight.present) {
    lines.push("Weight");
    lines.push(`  ${formatKg(m.weight.divertedKg)} kept out of landfill (items fixed)`);
    lines.push(`  ${formatKg(m.weight.totalKg)} handled in total`);
    lines.push(
      `  ${m.weight.weighedItems} of ${m.weight.eligibleItems ?? m.items.total} items weighed`
    );
    lines.push("");
  }

  const cats = m.categories.filter((c) => c.count > 0);
  if (cats.length) {
    lines.push("By category");
    cats.forEach((c) =>
      lines.push(
        `  ${c.count} ${c.label}${
          c.completed ? ` — ${formatPct(c.fixRate)} fixed` : ""
        }`
      )
    );
    lines.push("");
  }

  if (m.cancelReasons.some((r) => r.count > 0)) {
    lines.push("Cancellations");
    m.cancelReasons
      .filter((r) => r.count > 0)
      .forEach((r) => lines.push(`  ${r.count} ${r.label}`));
    lines.push("");
  }

  if (m.fixers.length) {
    lines.push(`${m.fixers.length} fixers recorded outcomes`);
  }

  return lines.join("\n").trim();
}

/**
 * Every figure on the page as a flat section/label/count/percent CSV.
 * Pure — returns the text; the caller downloads it.
 */
export function metricsCsv(m, scopeLabel) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [["Scope", "Section", "Label", "Count", "Percent"]];
  const add = (section, label, count, percent) =>
    rows.push([scopeLabel, section, label, count, percent === null || percent === undefined ? "" : percent.toFixed(1)]);

  add("Totals", "Clients", m.clients.total, null);
  add("Totals", "Clients excluding fully cancelled", m.clients.active, null);
  add("Totals", "Clients waiting", m.clients.waiting, null);
  add("Totals", "Volunteers", m.clients.volunteers, null);
  add("Totals", "Newsletter opt-ins", m.clients.newsletter, m.clients.newsletterRate);
  add("Totals", "Items", m.items.total, null);
  add("Totals", "Items excluding cancelled", m.items.active, null);

  m.pipeline.forEach((p) => add("Pipeline", p.label, p.count, pct(p.count, m.items.total)));
  m.outcomes.rows.forEach((r) => add("Outcomes", r.label, r.count, r.pct));
  add("Outcomes", "Fix rate", m.outcomes.fixed, m.outcomes.fixRate);
  m.notFixedReasons.forEach((r) => add("Not fixed reasons", r.label, r.count, null));
  m.cancelReasons.forEach((r) => add("Cancellation reasons", r.label, r.count, null));
  m.categories.forEach((c) => add("Categories", c.label, c.count, c.fixRate));
  m.fixers.forEach((f) => add("Fixers", f.name, f.count, null));

  if (m.weight.present) {
    // Count column carries kg here, rounded to the displayed precision.
    const kg = (v) => Number(v.toFixed(1));
    add("Weight (kg)", "Kept out of landfill (fixed)", kg(m.weight.divertedKg), null);
    add("Weight (kg)", "Total handled", kg(m.weight.totalKg), null);
    add("Weight (kg)", "Average per weighed item", kg(m.weight.avgKg || 0), null);
    add("Weight (kg)", "Items weighed", m.weight.weighedItems, m.weight.coverage);
    m.weight.byOutcome.forEach((r) => add("Weight by outcome (kg)", r.label, kg(r.kg), null));
    m.weight.byCategory.forEach((c) => add("Weight by category (kg)", c.label, kg(c.kg), null));
  }

  return rows.map((r) => r.map(esc).join(",")).join("\n");
}
