import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import Card from "../components/Card";
import StatBar from "../components/StatBar";
import { fetchEvents, fetchMetricsRows, subscribeToEvent } from "../lib/store";
import {
  computeByEvent,
  computeMetrics,
  formatDuration,
  formatKg,
  formatPct,
  metricsCsv,
  pct,
  summaryText,
} from "../lib/metrics";

// recharts only loads once you're actually looking at a multi-event scope.
const MetricsCharts = lazy(() => import("../components/MetricsCharts"));

const ALL = "all";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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
      <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: "13px", color: "#344054" }}>
        {label}
      </div>
      {sub && (
        <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: "11px", color: "#98a2b3" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export default function Metrics({ initialEventId, onOpenQueueForEvent }) {
  const [events, setEvents] = useState([]);
  const [rows, setRows] = useState({ attendees: [], orders: [] });
  const [period, setPeriod] = useState(ALL);
  const [eventId, setEventId] = useState(ALL);
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
      const [evs, data] = await Promise.all([fetchEvents(), fetchMetricsRows(null)]);
      setEvents(evs);
      setRows(data);
      // Open on whatever event the rest of the portal is looking at — that's
      // the live-event case.
      const seed = seedEventId && evs.find((e) => e.id === seedEventId);
      if (seed) {
        setPeriod(yearOf(seed));
        setEventId(seed.id);
      }
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

  const years = useMemo(
    () => [...new Set(events.map(yearOf).filter(Boolean))].sort((a, b) => b.localeCompare(a)),
    [events]
  );

  // Events in the selected period, oldest first (chart + comparison order).
  const periodEvents = useMemo(() => {
    const list = period === ALL ? events : events.filter((e) => yearOf(e) === period);
    return [...list].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  }, [events, period]);

  const scopeEvents = useMemo(() => {
    if (eventId === ALL) return periodEvents;
    const ev = periodEvents.find((e) => e.id === eventId);
    return ev ? [ev] : periodEvents;
  }, [periodEvents, eventId]);

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
        attendees: [...prev.attendees.filter((a) => a.event_id !== id), ...data.attendees],
        orders: [...prev.orders.filter((o) => o.event_id !== id), ...data.orders],
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
    [scopedRows, scopeEvents, singleEvent]
  );

  const chartData = useMemo(
    () =>
      byEvent.map(({ event, metrics }) => ({
        name: shortDate(event.date, period === ALL),
        clients: metrics.clients.total,
        items: metrics.items.total,
        fixRate: metrics.outcomes.fixRate,
        kg: metrics.weight.totalKg,
      })),
    [byEvent, period]
  );

  const scopeLabel = useMemo(() => {
    if (singleEvent) {
      return `${singleEvent.name} — ${singleEvent.date}${
        singleEvent.location ? ` (${singleEvent.location})` : ""
      }`;
    }
    const periodName = period === ALL ? "All time" : period;
    return `${periodName} — ${scopeEvents.length} event${scopeEvents.length === 1 ? "" : "s"}`;
  }, [singleEvent, period, scopeEvents]);

  const scopeSubtitle = useMemo(() => {
    if (singleEvent) return singleEvent.location || singleEvent.date;
    if (!scopeEvents.length) return "No events in this period";
    const first = scopeEvents[0];
    const last = scopeEvents[scopeEvents.length - 1];
    const range =
      first === last
        ? shortDate(first.date, true)
        : `${shortDate(first.date, period === ALL)} – ${shortDate(last.date, period === ALL)}`;
    return `${scopeEvents.length} events · ${range}`;
  }, [singleEvent, scopeEvents, period]);

  const today = new Date().toISOString().split("T")[0];
  const isLive = singleEvent && (singleEvent.is_open || singleEvent.date === today);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(summaryText(m, scopeLabel));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Copy failed:", err);
      setError("Couldn't copy to the clipboard.");
    }
  };

  const handleExport = () => {
    const blob = new Blob([metricsCsv(m, scopeLabel)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${scopeLabel.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "")}-metrics.csv`;
    a.click();
    URL.revokeObjectURL(url);
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

  const chipStyle = (active) => ({
    padding: "6px 12px",
    borderRadius: "8px",
    border: "none",
    fontFamily: "'Outfit', sans-serif",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "all 0.15s",
    background: active ? "#1e3a6e" : "#f0f2f5",
    color: active ? "#fff" : "#667085",
  });

  return (
    <div>
      {/* ── Scope: one filter row above everything it scopes ── */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10, overflowX: "auto" }}>
        {[{ key: ALL, label: "All time" }, ...years.map((y) => ({ key: y, label: y }))].map((p) => (
          <button
            key={p.key}
            onClick={() => {
              setPeriod(p.key);
              setEventId(ALL);
              setOpenCategory(null);
            }}
            style={chipStyle(period === p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 12 }}>
        <select
          value={eventId}
          onChange={(e) => {
            setEventId(e.target.value);
            setOpenCategory(null);
          }}
          style={{
            width: "100%",
            padding: "10px 32px 10px 12px",
            borderRadius: "10px",
            border: "1.5px solid #d0d5dd",
            fontFamily: "'Outfit', sans-serif",
            fontSize: "14px",
            fontWeight: 600,
            color: "#1e3a6e",
            background: "#fff",
            outline: "none",
            appearance: "none",
            boxSizing: "border-box",
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%23667085' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 12px center",
            cursor: "pointer",
          }}
        >
          <option value={ALL}>
            All {periodEvents.length} event{periodEvents.length === 1 ? "" : "s"}
            {period === ALL ? "" : ` in ${period}`}
          </option>
          {[...periodEvents].reverse().map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.name} — {ev.date}
            </option>
          ))}
        </select>
      </div>

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
        {singleEvent ? singleEvent.name : period === ALL ? "All time" : period} · {scopeSubtitle}
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
          <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: "14px", color: "#98a2b3" }}>
            No events in this period.
          </p>
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
              <span>{m.items.avgPerClient ? m.items.avgPerClient.toFixed(1) : "—"} items/client</span>
              <span style={{ opacity: m.clients.volunteers ? 1 : 0.4 }}>
                {m.clients.volunteers} volunteers
              </span>
              <span style={{ opacity: m.clients.newsletter ? 1 : 0.4 }}>
                {m.clients.newsletter} newsletter ({formatPct(m.clients.newsletterRate)})
              </span>
              <span style={{ opacity: m.clients.zipCount ? 1 : 0.4 }}>
                {m.clients.zipCount} zip codes
              </span>
              {m.weight.present && <span>{formatKg(m.weight.totalKg)} collected</span>}
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
                      p.key === "pending" || p.key === "pending_assignment" ? n + p.count : n,
                    0
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
                median check-in → done: {formatDuration(m.timing.medianCheckinToDone)}
                {m.timing.sampleSize ? ` (n=${m.timing.sampleSize})` : ""}
              </div>
            </Section>
          )}

          {/* ── Pipeline ── */}
          <Section title="Item pipeline" subtitle={`${m.items.total} items`}>
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
              <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: "13px", color: "#344054" }}>
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
              subtitle={`${m.weight.weighedItems} of ${
                m.weight.eligibleItems ?? m.items.total
              } items weighed${
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
                  style={{ fontFamily: "'Outfit', sans-serif", fontSize: "13px", color: "#344054" }}
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
            <Section title="Why items weren't fixed" subtitle="Within the Not Fixed outcome">
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
                ? `${m.categorized} of ${m.items.total} items categorised`
                : `${m.items.total} items`
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
                onClick={c.count ? () => setOpenCategory(openCategory === c.label ? null : c.label) : undefined}
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
                          const w = m.weight.byCategory.find((x) => x.label === c.label);
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
            <Section title="By event" subtitle="Tap an event to see it on its own">
              <Suspense fallback={null}>
                <MetricsCharts data={chartData} />
              </Suspense>
              <div style={{ borderTop: "1px solid #e4e7ec", paddingTop: 12 }}>
                {[...byEvent].reverse().map(({ event, metrics }) => (
                  <div
                    key={event.id}
                    onClick={() => setEventId(event.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setEventId(event.id);
                      }
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 10px",
                      background: "#f8f9fb",
                      borderRadius: 8,
                      marginBottom: 6,
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
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
                      }}
                    >
                      {metrics.clients.total}c · {metrics.items.total}i
                    </span>
                    <span
                      style={{
                        fontFamily: "'Space Mono', monospace",
                        fontSize: "12px",
                        fontWeight: 700,
                        color: "#2e7d32",
                        minWidth: 42,
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatPct(metrics.outcomes.fixRate)}
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
