import { useState, useEffect, useCallback } from "react";
import Card from "../components/Card";
import Badge from "../components/Badge";
import StatusBadge from "../components/StatusBadge";
import { fetchVisitorGroups, fetchEvents, subscribeToEvent } from "../lib/store";

export default function CoordinatorQueue({ onSelectVisitor, selectedEventId, onEventChange }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [visitorGroups, setVisitorGroups] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!selectedEventId) return;
    try {
      const groups = await fetchVisitorGroups(selectedEventId);
      setVisitorGroups(groups);
    } catch (err) {
      console.error("Failed to load queue:", err);
    }
    setLoading(false);
  }, [selectedEventId]);

  useEffect(() => {
    fetchEvents().then(setEvents);
  }, []);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  // Realtime subscription
  useEffect(() => {
    if (!selectedEventId) return;
    const unsubscribe = subscribeToEvent(selectedEventId, loadData);
    return unsubscribe;
  }, [selectedEventId, loadData]);

  const selectedEvent = events.find((e) => e.id === selectedEventId);

  const filtered = visitorGroups.filter((g) => {
    const matchesFilter = filter === "all" || g.groupStatus === filter;
    const q = search.toLowerCase();
    if (!q) return matchesFilter;
    const matchesSearch =
      g.attendee?.name?.toLowerCase().includes(q) ||
      g.attendee?.email?.toLowerCase().includes(q) ||
      g.attendee?.phone?.toLowerCase().includes(q) ||
      g.attendee?.zip_code?.toLowerCase().includes(q) ||
      g.orders.some((o) => o.code.toLowerCase().includes(q) || o.item_name.toLowerCase().includes(q));
    return matchesFilter && matchesSearch;
  });

  const allOrderCount = visitorGroups.reduce((sum, g) => sum + g.orders.length, 0);
  const counts = {
    all: visitorGroups.length,
    pending: visitorGroups.filter((g) => g.groupStatus === "pending").length,
    reviewed: visitorGroups.filter((g) => g.groupStatus === "reviewed").length,
    "in-progress": visitorGroups.filter((g) => g.groupStatus === "in-progress").length,
    completed: visitorGroups.filter((g) => g.groupStatus === "completed").length,
  };

  const filterButtons = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "reviewed", label: "Ready" },
    { key: "in-progress", label: "Active" },
    { key: "completed", label: "Done" },
  ];

  if (loading) {
    return <p style={{ fontFamily: "'Outfit', sans-serif", color: "#667085", textAlign: "center", padding: 32 }}>Loading queue...</p>;
  }

  return (
    <div>
      {/* Event selector */}
      <div style={{ marginBottom: 12 }}>
        <select value={selectedEventId} onChange={(e) => onEventChange(e.target.value)}
          style={{ width: "100%", padding: "10px 32px 10px 12px", borderRadius: "10px", border: "1.5px solid #d0d5dd", fontFamily: "'Outfit', sans-serif", fontSize: "14px", fontWeight: 600, color: "#1e3a6e", background: "#fff", outline: "none", appearance: "none", boxSizing: "border-box", backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%23667085' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", cursor: "pointer" }}>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>{ev.name} — {ev.date}{ev.location ? ` (${ev.location})` : ""}</option>
          ))}
        </select>
      </div>

      <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "22px", fontWeight: 700, color: "#1d2939", margin: "0 0 4px 0" }}>Queue</h2>
      <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: "13px", color: "#667085", margin: "0 0 16px 0" }}>
        {selectedEvent?.name || "—"} · {visitorGroups.length} visitors · {allOrderCount} items · {counts.pending} awaiting review
      </p>

      <div style={{ marginBottom: 12 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, email, phone, code, or item..."
          style={{ width: "100%", padding: "11px 14px", borderRadius: "10px", border: "1.5px solid #d0d5dd", fontFamily: "'Outfit', sans-serif", fontSize: "14px", color: "#1d2939", background: "#fff", boxSizing: "border-box", outline: "none" }}
          onFocus={(e) => (e.target.style.borderColor = "#1e3a6e")} onBlur={(e) => (e.target.style.borderColor = "#d0d5dd")} />
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto" }}>
        {filterButtons.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            style={{ padding: "6px 12px", borderRadius: "8px", border: "none", fontFamily: "'Outfit', sans-serif", fontSize: "12px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s", background: filter === f.key ? "#1e3a6e" : "#f0f2f5", color: filter === f.key ? "#fff" : "#667085" }}>
            {f.label} ({counts[f.key]})
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "32px 16px" }}>
          <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: "14px", color: "#98a2b3" }}>{search ? "No results found." : "No visitors in this category."}</p>
        </div>
      )}

      {filtered.map((g) => (
        <Card key={g.attendee?.id} onClick={() => onSelectVisitor(g.attendee?.id)} style={{ marginBottom: 10, padding: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div>
              <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: "16px", fontWeight: 700, color: "#1d2939" }}>{g.attendee?.name}</div>
              <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: "12px", color: "#98a2b3", marginTop: 1 }}>{[g.attendee?.email, g.attendee?.phone, g.attendee?.zip_code].filter(Boolean).join(" · ")}</div>
            </div>
            <StatusBadge status={g.groupStatus} />
          </div>
          {g.orders.map((o) => (
            <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "#f8f9fb", borderRadius: "8px", marginTop: 6 }}>
              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "13px", fontWeight: 700, color: "#1e3a6e" }}>{o.code}</span>
              <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: "13px", color: "#344054", flex: 1 }}>{o.item_name}</span>
              <Badge text={`P${o.priority}`} color={o.priority === 1 ? "#1e3a6e" : "#e07850"} />
              {o.outcome && <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: "11px", color: "#2e7d32", fontWeight: 600 }}>{o.outcome}</span>}
            </div>
          ))}
        </Card>
      ))}
    </div>
  );
}
