import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Card from "../components/Card";
import StatBar from "../components/StatBar";
import EventPicker from "../components/EventPicker";
import {
  exportWorkOrdersCSV,
  fetchEvents,
  fetchMetricsRows,
  subscribeToEvent,
} from "../lib/store";
import {
  computeByEvent,
  computeMetrics,
  formatDuration,
  formatKg,
  formatPct,
  MONTHS,
  plural,
  pct,
  summaryText,
} from "../lib/metrics";

// recharts only loads once you're actually looking at a multi-event scope.
const MetricsCharts = lazy(() => import("../components/MetricsCharts"));

const yearOf = (ev) => (ev.date || "").slice(0, 4);

// events.date is a plain date column ('YYYY-MM-DD') — parsing it with the Date
// constructor would shift it a day in negative-offset timezones, so slice it.
function shortDate(dateStr, withYear) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  const label = `${MONTHS[Number(m) - 1] || m} ${Number(d)}`;
  return withYear ? `${label} '${y.slice(2)}` : label;
}

function Section({ title, subtitle, children }) {
  return (
    <Card style={{ marginBottom: 12 }}>
      <h3
        style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: "15px",
          fontWeight: 700,
          color: "#1d2939",
          margin: 0,
        }}
      >
        {title}
      </h3>
      {subtitle && (
        <div
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: "12px",
            color: "#98a2b3",
            margin: "2px 0 0 0",
          }}
        >
          {subtitle}
        </div>
      )}
      <div style={{ marginTop: 14 }}>{children}</div>
    </Card>
  );
}

function BigStat({ value, label, sub }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: "26px",
          fontWeight: 700,
          color: "#1d2939",
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: "13px",
          color: "#344054",
        }}
      >
        {label}
      </div>
      {sub && (
        <div
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: "11px",
            color: "#98a2b3",
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

export default function Metrics({ initialEventId, onOpenQueueForEvent }) {
  const [events, setEvents] = useState([]);
  const [rows, setRows] = useState({ attendees: [], orders: [] });
  // Any combination of events. Empty is reachable and shows an empty state.
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openCategory, setOpenCategory] = useState(null);
  const [showAllFixers, setShowAllFixers] = useState(false);
  const [copied, setCopied] = useState(false);

  // Seeding the scope happens here rather than in a follow-up effect: the
  // events are already in hand, so it costs no extra render pass.
  const load = useCallback(async (seedEventId) => {
    try {
      // One read of everything, filtered client-side. Scope changes are then
      // instant and cost no round trips.
      const [evs, data] = await Promise.all([
        fetchEvents(),
        fetchMetricsRows(null),
      ]);
      setEvents(evs);
      setRows(data);
      // Open on whatever event the rest of the portal is looking at — that's
      // the live-event case.
      const seed = seedEventId && evs.find((e) => e.id === seedEventId);
      if (seed) setSelectedIds([seed.id]);
      else if (evs.length) setSelectedIds([evs[0].id]);
      setError(null);
    } catch (err) {
      console.error("Failed to load metrics:", err);
      setError("Couldn't load metrics. Check your connection and try again.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load(initialEventId);
  }, [load, initialEventId]);

  // Oldest first — the charts and the by-event list depend on this order.
  // (EventPicker displays newest-first; that's a separate concern.)
  const sortedEvents = useMemo(
    () =>
      [...events].sort((a, b) => (a.date || "").localeCompare(b.date || "")),
    [events],
  );

  const scopeEvents = useMemo(() => {
    const ids = new Set(selectedIds);
    return sortedEvents.filter((e) => ids.has(e.id));
  }, [sortedEvents, selectedIds]);

  // Chart x-labels only need the year when the selection crosses years.
  const spansYears = useMemo(
    () => new Set(scopeEvents.map(yearOf)).size > 1,
    [scopeEvents],
  );

  const scopedRows = useMemo(() => {
    const ids = new Set(scopeEvents.map((e) => e.id));
    return {
      attendees: rows.attendees.filter((a) => ids.has(a.event_id)),
      orders: rows.orders.filter((o) => ids.has(o.event_id)),
      // Needed so weight coverage counts only events that collect weight.
      events: scopeEvents,
    };
  }, [rows, scopeEvents]);

  const m = useMemo(() => computeMetrics(scopedRows), [scopedRows]);
  const singleEvent = scopeEvents.length === 1 ? scopeEvents[0] : null;
  const singleEventId = singleEvent?.id ?? null;

  // Refresh just the live event's rows and splice them in, rather than
  // re-reading every event on each change.
  const refreshEvent = useCallback(async (id) => {
    try {
      const data = await fetchMetricsRows([id]);
      setRows((prev) => ({
        attendees: [
          ...prev.attendees.filter((a) => a.event_id !== id),
          ...data.attendees,
        ],
        orders: [
          ...prev.orders.filter((o) => o.event_id !== id),
          ...data.orders,
        ],
      }));
    } catch (err) {
      console.error("Failed to refresh event metrics:", err);
    }
  }, []);

  // Live updates only make sense for one event; a whole-year view doesn't need
  // to re-render on every row change. Keyed on the id, not the event object —
  // a refresh replaces the events array, and depending on the object would
  // tear down and rebuild the subscription on every single update.
  useEffect(() => {
    if (!singleEventId) return;
    return subscribeToEvent(singleEventId, () => refreshEvent(singleEventId));
  }, [singleEventId, refreshEvent]);

  const byEvent = useMemo(
    () => (singleEvent ? [] : computeByEvent(scopedRows, scopeEvents)),
    [scopedRows, scopeEvents, singleEvent],
  );

  const chartData = useMemo(
    () =>
      byEvent.map(({ event, metrics }) => ({
        name: shortDate(event.date, spansYears),
        clients: metrics.clients.total,
        items: metrics.items.total,
        fixRate: metrics.outcomes.fixRate,
        kg: metrics.weight.totalKg,
      })),
    [byEvent, spansYears],
  );

  // "2026" when the selection is exactly one complete year, else null. Mirrors
  // the same rule in EventPicker so the header and the button agree.
  const wholeYear = useMemo(() => {
    if (scopeEvents.length < 2 || spansYears) return null;
    const y = yearOf(scopeEvents[0]);
    return events.filter((e) => yearOf(e) === y).length === scopeEvents.length
      ? y
      : null;
  }, [scopeEvents, spansYears, events]);

  const scopeLabel = useMemo(() => {
    if (!scopeEvents.length) return "No events selected";
    if (singleEvent) {
      return `${singleEvent.name} — ${singleEvent.date}${
        singleEvent.location ? ` (${singleEvent.location})` : ""
      }`;
    }
    const n = plural(scopeEvents.length, "event");
    if (scopeEvents.length === events.length) return `All time — ${n}`;
    if (wholeYear) return `${wholeYear} — ${n}`;
    const first = shortDate(scopeEvents[0].date, true);
    const last = shortDate(scopeEvents[scopeEvents.length - 1].date, true);
    return `${n} — ${first} to ${last}`;
  }, [singleEvent, scopeEvents, events, wholeYear]);

  const scopeSubtitle = useMemo(() => {
    if (singleEvent) return singleEvent.location || singleEvent.date;
    if (!scopeEvents.length) return "Pick one or more events above";
    const first = scopeEvents[0];
    const last = scopeEvents[scopeEvents.length - 1];
    const range = `${shortDate(first.date, spansYears)} – ${shortDate(last.date, spansYears)}`;
    return `${plural(scopeEvents.length, "event")} · ${range}`;
  }, [singleEvent, scopeEvents, spansYears]);

  const today = new Date().toISOString().split("T")[0];
  const isLive =
    singleEvent && (singleEvent.is_open || singleEvent.date === today);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(summaryText(m, scopeEvents));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Copy failed:", err);
      setError("Couldn't copy to the clipboard.");
    }
  };

  // Raw work-item rows, not the aggregates on screen — the numbers here are for
  // reading, the CSV is for analysing elsewhere.
  const handleExport = async () => {
    try {
      await exportWorkOrdersCSV(scopeEvents, scopeLabel);
    } catch (err) {
      console.error("Export failed:", err);
      setError("Couldn't export the item data.");
    }
  };

  if (loading) {
    return (
      <p
        style={{
          fontFamily: "'Outfit', sans-serif",
          color: "#667085",
          textAlign: "center",
          padding: 32,
        }}
      >
        Loading metrics...
      </p>
    );
  }

  return (
    <div>
      {/* ── Scope: one control above everything it scopes ── */}
      <EventPicker
        events={events}
        selectedIds={selectedIds}
        onChange={(ids) => {
          setSelectedIds(ids);
          setOpenCategory(null);
        }}
      />

      <h2
        style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: "22px",
          fontWeight: 700,
          color: "#1d2939",
          margin: "0 0 2px 0",
        }}
      >
        Metrics
      </h2>
      <p
        style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: "13px",
          color: "#667085",
          margin: "0 0 16px 0",
        }}
      >
        {singleEvent
          ? singleEvent.name
          : scopeEvents.length === events.length
            ? "All time"
            : wholeYear || plural(scopeEvents.length, "event")}{" "}
        · {scopeSubtitle}
        {isLive && (
          <span style={{ color: "#2e7d32", fontWeight: 700 }}> · Live</span>
        )}
      </p>

      {error && (
        <div
          style={{
            padding: "8px 12px",
            background: "#fef3f2",
            borderRadius: 8,
            fontFamily: "'Outfit', sans-serif",
            fontSize: "13px",
            color: "#b42318",
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      )}

      {!scopeEvents.length ? (
        <div style={{ textAlign: "center", padding: "32px 16px" }}>
          <p
            style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: "14px",
              color: "#98a2b3",
            }}
          >
            {events.length
              ? "No events selected — pick some from the menu above."
              : "No events yet."}
          </p>
          {events.length > 0 && (
            <button
              onClick={() => setSelectedIds(events.map((e) => e.id))}
              style={{
                marginTop: 10,
                background: "none",
                border: "none",
                padding: 0,
                fontFamily: "'Outfit', sans-serif",
                fontSize: "13px",
                fontWeight: 600,
                color: "#1e3a6e",
                cursor: "pointer",
              }}
            >
              Select all {plural(events.length, "event")}
            </button>
          )}
        </div>
      ) : (
        <>
          {/* ── Totals ── */}
          <Card style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 16 }}>
              <BigStat
                value={m.clients.total}
                label={m.clients.total === 1 ? "client" : "clients"}
                sub={
                  // Only worth saying when there's a gap — otherwise it just
                  // restates the number above it and reads like it means more.
                  m.clients.active === m.clients.total
                    ? null
                    : `${m.clients.total - m.clients.active} had every item cancelled`
                }
              />
              <BigStat
                value={m.items.total}
                label={m.items.total === 1 ? "item" : "items"}
                sub={
                  m.items.active === m.items.total
                    ? null
                    : `${m.items.total - m.items.active} cancelled`
                }
              />
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 14,
                marginTop: 14,
                paddingTop: 10,
                borderTop: "1px solid #e4e7ec",
                fontFamily: "'Space Mono', monospace",
                fontSize: "12px",
                color: "#475467",
              }}
            >
              <span>
                {m.items.avgPerClient ? m.items.avgPerClient.toFixed(1) : "—"}{" "}
                items/client
              </span>
              <span style={{ opacity: m.clients.volunteers ? 1 : 0.4 }}>
                {m.clients.volunteers} volunteers
              </span>
              <span style={{ opacity: m.clients.newsletter ? 1 : 0.4 }}>
                {m.clients.newsletter} newsletter (
                {formatPct(m.clients.newsletterRate)})
              </span>
              <span style={{ opacity: m.clients.zipCount ? 1 : 0.4 }}>
                {m.clients.zipCount} zip codes
              </span>
              {m.weight.present && (
                <span>{formatKg(m.weight.totalKg)} collected</span>
              )}
            </div>
          </Card>

          {/* ── Live panel ── */}
          {isLive && (
            <Section title="Right now" subtitle="Updates as the queue changes">
              <div style={{ display: "flex", gap: 16, marginBottom: 6 }}>
                <BigStat value={m.clients.waiting} label="clients waiting" />
                <BigStat
                  value={m.pipeline.reduce(
                    (n, p) =>
                      p.key === "pending" || p.key === "pending_assignment"
                        ? n + p.count
                        : n,
                    0,
                  )}
                  label="items open"
                />
              </div>
              <div
                style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: "12px",
                  color: "#475467",
                  paddingTop: 10,
                  borderTop: "1px solid #e4e7ec",
                }}
              >
                median check-in → done:{" "}
                {formatDuration(m.timing.medianCheckinToDone)}
                {m.timing.sampleSize ? ` (n=${m.timing.sampleSize})` : ""}
              </div>
            </Section>
          )}

          {/* ── Pipeline ── */}
          <Section
            title="Item pipeline"
            subtitle={plural(m.items.total, "item")}
          >
            {m.pipeline.map((p) => (
              <StatBar
                key={p.key}
                label={p.known ? p.label : `${p.label} (unrecognised)`}
                count={p.count}
                total={m.items.total}
                color={p.color}
                right={formatPct(pct(p.count, m.items.total))}
              />
            ))}
          </Section>

          {/* ── Outcomes ── */}
          <Section
            title="Outcomes"
            subtitle={`of ${m.outcomes.completed} completed item${
              m.outcomes.completed === 1 ? "" : "s"
            }`}
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 8,
                marginBottom: 14,
              }}
            >
              <span
                style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: "26px",
                  fontWeight: 700,
                  color: "#2e7d32",
                }}
              >
                {formatPct(m.outcomes.fixRate)}
              </span>
              <span
                style={{
                  fontFamily: "'Outfit', sans-serif",
                  fontSize: "13px",
                  color: "#344054",
                }}
              >
                fix rate
              </span>
              <span
                style={{
                  fontFamily: "'Outfit', sans-serif",
                  fontSize: "11px",
                  color: "#98a2b3",
                  marginLeft: "auto",
                }}
              >
                {formatPct(m.outcomes.successRate)} fixed or diagnosed
              </span>
            </div>
            {m.outcomes.rows.map((r) => (
              <StatBar
                key={r.label}
                label={r.label}
                count={r.count}
                total={m.outcomes.completed}
                color={r.color}
                right={formatPct(r.pct)}
              />
            ))}
          </Section>

          {/* ── Weight (only for events that collect it) ── */}
          {m.weight.present && (
            <Section
              title="Weight"
              subtitle={`${m.weight.weighedItems} of ${plural(
                m.weight.eligibleItems ?? m.items.total,
                "item",
              )} weighed${
                m.weight.hasNonCollectingEvents
                  ? " · excludes events that don't record weight"
                  : ""
              }`}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 8,
                  marginBottom: 14,
                }}
              >
                <span
                  style={{
                    fontFamily: "'Space Mono', monospace",
                    fontSize: "26px",
                    fontWeight: 700,
                    color: "#2e7d32",
                  }}
                >
                  {formatKg(m.weight.divertedKg)}
                </span>
                <span
                  style={{
                    fontFamily: "'Outfit', sans-serif",
                    fontSize: "13px",
                    color: "#344054",
                  }}
                >
                  kept out of landfill
                </span>
                <span
                  style={{
                    fontFamily: "'Outfit', sans-serif",
                    fontSize: "11px",
                    color: "#98a2b3",
                    marginLeft: "auto",
                  }}
                >
                  {formatKg(m.weight.totalKg)} handled
                </span>
              </div>

              {/* Bars are kg, so counts are rounded for display but the widths
                  use the real totals. */}
              {m.weight.byOutcome.map((r) => (
                <StatBar
                  key={r.label}
                  label={r.label}
                  count={Number(r.kg.toFixed(1))}
                  total={Number(m.weight.totalKg.toFixed(1))}
                  color={r.color}
                  right={formatPct(pct(r.kg, m.weight.totalKg))}
                />
              ))}

              <div
                style={{
                  marginTop: 12,
                  paddingTop: 10,
                  borderTop: "1px solid #e4e7ec",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 14,
                  fontFamily: "'Space Mono', monospace",
                  fontSize: "12px",
                  color: "#475467",
                }}
              >
                <span>{formatKg(m.weight.avgKg)} avg per item</span>
                <span>{formatPct(m.weight.coverage)} of items weighed</span>
              </div>

              {m.weight.byCategory.length > 1 && (
                <div style={{ marginTop: 14 }}>
                  <div
                    style={{
                      fontFamily: "'Outfit', sans-serif",
                      fontSize: "12px",
                      fontWeight: 700,
                      color: "#344054",
                      marginBottom: 8,
                    }}
                  >
                    Heaviest categories
                  </div>
                  {m.weight.byCategory.map((c) => (
                    <StatBar
                      key={c.label}
                      label={c.label}
                      count={Number(c.kg.toFixed(1))}
                      total={Number(m.weight.byCategory[0].kg.toFixed(1))}
                      color="#1e3a6e"
                      muted
                      right={`${c.weighedItems}×`}
                    />
                  ))}
                </div>
              )}
            </Section>
          )}

          {/* ── Not-fixed reasons ── */}
          {m.notFixedReasons.some((r) => r.count > 0) && (
            <Section
              title="Why items weren't fixed"
              subtitle="Within the Not Fixed outcome"
            >
              {m.notFixedReasons.map((r) => (
                <StatBar
                  key={r.label}
                  label={r.label}
                  count={r.count}
                  total={Math.max(...m.notFixedReasons.map((x) => x.count), 1)}
                  color="#b42318"
                  muted
                />
              ))}
            </Section>
          )}

          {/* ── Cancellations ── */}
          <Section
            title="Cancellations"
            subtitle={`${m.pipeline.find((p) => p.key === "canceled")?.count || 0} cancelled items`}
          >
            {m.cancelReasons.map((r) => (
              <StatBar
                key={r.label}
                label={r.known ? r.label : `${r.label} (unrecognised)`}
                count={r.count}
                total={Math.max(...m.cancelReasons.map((x) => x.count), 1)}
                color="#667085"
                muted
              />
            ))}
          </Section>

          {/* ── Categories ── */}
          <Section
            title="By category"
            subtitle={
              m.uncategorized
                ? `${m.categorized} of ${plural(m.items.total, "item")} categorised`
                : plural(m.items.total, "item")
            }
          >
            {m.categories.map((c) => (
              <StatBar
                key={c.label}
                label={c.label}
                count={c.count}
                total={m.items.total}
                color={c.known ? "#1e3a6e" : "#98a2b3"}
                muted={!c.known}
                right={c.completed ? formatPct(c.fixRate) : "—"}
                onClick={
                  c.count
                    ? () =>
                        setOpenCategory(
                          openCategory === c.label ? null : c.label,
                        )
                    : undefined
                }
                expanded={openCategory === c.label}
              >
                <div style={{ paddingLeft: 4 }}>
                  {c.completed === 0 ? (
                    <div
                      style={{
                        fontFamily: "'Outfit', sans-serif",
                        fontSize: "12px",
                        color: "#98a2b3",
                      }}
                    >
                      Nothing completed yet — {c.open} still open
                      {c.canceled ? `, ${c.canceled} cancelled` : ""}.
                    </div>
                  ) : (
                    <>
                      {c.outcomes.map((o) => (
                        <StatBar
                          key={o.label}
                          label={o.label}
                          count={o.count}
                          total={c.completed}
                          color={o.color}
                          indent
                          muted
                          right={formatPct(pct(o.count, c.completed))}
                        />
                      ))}
                      <div
                        style={{
                          fontFamily: "'Outfit', sans-serif",
                          fontSize: "11px",
                          color: "#98a2b3",
                          paddingLeft: 14,
                        }}
                      >
                        {c.canceled} cancelled · {c.open} still open
                        {c.topNotFixedReason
                          ? ` · top not-fixed reason: ${c.topNotFixedReason.label}`
                          : ""}
                        {(() => {
                          const w = m.weight.byCategory.find(
                            (x) => x.label === c.label,
                          );
                          return w
                            ? ` · ${formatKg(w.kg)} across ${w.weighedItems} weighed`
                            : "";
                        })()}
                      </div>
                    </>
                  )}
                </div>
              </StatBar>
            ))}
          </Section>

          {/* ── Fixers ── */}
          {m.fixers.length > 0 && (
            <Section
              title="Fixers"
              subtitle={`${m.fixers.length} fixer${
                m.fixers.length === 1 ? "" : "s"
              } recorded a completed item`}
            >
              {(showAllFixers ? m.fixers : m.fixers.slice(0, 8)).map((f) => (
                <StatBar
                  key={f.name}
                  label={f.name}
                  count={f.count}
                  total={m.fixers[0].count}
                  color="#6941c6"
                />
              ))}
              {m.fixers.length > 8 && (
                <button
                  onClick={() => setShowAllFixers(!showAllFixers)}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    fontFamily: "'Outfit', sans-serif",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#1e3a6e",
                    cursor: "pointer",
                  }}
                >
                  {showAllFixers ? "Show fewer" : `Show all ${m.fixers.length}`}
                </button>
              )}
            </Section>
          )}

          {/* ── Cross-event comparison ── */}
          {byEvent.length >= 2 && (
            <Section
              title="By event"
              subtitle="Tap an event to see it on its own"
            >
              <Suspense fallback={null}>
                <MetricsCharts data={chartData} />
              </Suspense>
              <div style={{ borderTop: "1px solid #e4e7ec", paddingTop: 12 }}>
                {[...byEvent].reverse().map(({ event, metrics }) => (
                  <div
                    key={event.id}
                    onClick={() => setSelectedIds([event.id])}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedIds([event.id]);
                      }
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      // Spelled-out stats are wide; on a narrow phone they drop
                      // to a second line rather than crushing the event name.
                      flexWrap: "wrap",
                      rowGap: 2,
                      gap: 8,
                      padding: "8px 10px",
                      background: "#f8f9fb",
                      borderRadius: 8,
                      marginBottom: 6,
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ flex: "1 1 140px", minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: "'Outfit', sans-serif",
                          fontSize: "13px",
                          fontWeight: 600,
                          color: "#1d2939",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {event.name}
                      </div>
                      <div
                        style={{
                          fontFamily: "'Outfit', sans-serif",
                          fontSize: "11px",
                          color: "#98a2b3",
                        }}
                      >
                        {event.date}
                      </div>
                    </div>
                    <span
                      style={{
                        fontFamily: "'Space Mono', monospace",
                        fontSize: "12px",
                        color: "#475467",
                        fontVariantNumeric: "tabular-nums",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {metrics.clients.total}{" "}
                      {metrics.clients.total === 1 ? "client" : "clients"} ·{" "}
                      {metrics.items.total}{" "}
                      {metrics.items.total === 1 ? "item" : "items"} ·{" "}
                    </span>
                    <span
                      style={{
                        fontFamily: "'Space Mono', monospace",
                        fontSize: "12px",
                        fontWeight: 700,
                        // "% fixed" is of COMPLETED items, not of all items.
                        color: "#2e7d32",
                        textAlign: "right",
                        whiteSpace: "nowrap",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {metrics.outcomes.completed
                        ? `${formatPct(metrics.outcomes.fixRate)} fixed`
                        : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* ── Actions ── */}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button
              onClick={handleCopy}
              style={{
                flex: 1,
                padding: "10px 16px",
                borderRadius: "10px",
                border: "1.5px solid #1e3a6e",
                background: "#fff",
                fontFamily: "'Outfit', sans-serif",
                fontSize: "13px",
                fontWeight: 600,
                color: "#1e3a6e",
                cursor: "pointer",
              }}
            >
              {copied ? "Copied ✓" : "Copy summary"}
            </button>
            <button
              onClick={handleExport}
              style={{
                flex: 1,
                padding: "10px 16px",
                borderRadius: "10px",
                border: "1.5px solid #d0d5dd",
                background: "#fff",
                fontFamily: "'Outfit', sans-serif",
                fontSize: "13px",
                fontWeight: 600,
                color: "#475467",
                cursor: "pointer",
              }}
            >
              Export CSV
            </button>
          </div>

          {singleEvent && onOpenQueueForEvent && (
            <button
              onClick={() => onOpenQueueForEvent(singleEvent.id)}
              style={{
                width: "100%",
                marginTop: 8,
                padding: "10px 16px",
                borderRadius: "10px",
                border: "none",
                background: "none",
                fontFamily: "'Outfit', sans-serif",
                fontSize: "13px",
                fontWeight: 600,
                color: "#667085",
                cursor: "pointer",
              }}
            >
              Open this event in the queue →
            </button>
          )}
        </>
      )}
    </div>
  );
}
