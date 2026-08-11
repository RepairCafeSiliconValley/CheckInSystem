import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import Card from "../components/Card";
import Input from "../components/Input";
import Button from "../components/Button";
import Badge from "../components/Badge";
import { fetchEvents, createEvent, fetchMetricsRows, toggleEventOpen, updateEventMaxItems, exportAttendeesCSV } from "../lib/store";
import { computeByEvent } from "../lib/metrics";

export default function Admin({ onViewMetrics }) {
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [maxItems, setMaxItems] = useState(2);
  const [events, setEvents] = useState([]);
  const [stats, setStats] = useState({});
  const [creating, setCreating] = useState(false);
  const [editingMaxItems, setEditingMaxItems] = useState(null);

  const loadEvents = async () => {
    // One read of every event's rows, grouped in JS. This used to be a
    // sequential fetch per event — O(events) round trips on every render.
    const [evs, rows] = await Promise.all([fetchEvents(), fetchMetricsRows(null)]);
    setEvents(evs);
    const statsMap = {};
    computeByEvent(rows, evs).forEach(({ event, metrics }) => {
      statsMap[event.id] = metrics;
    });
    setStats(statsMap);
  };

  useEffect(() => { loadEvents(); }, []);

  const handleCreate = async () => {
    if (!eventName.trim() || !eventDate) return;
    setCreating(true);
    try {
      await createEvent(eventName.trim(), eventDate, eventLocation.trim(), maxItems);
      setEventName("");
      setEventDate("");
      setEventLocation("");
      setMaxItems(2);
      await loadEvents();
    } catch (err) {
      console.error("Failed to create event:", err);
    }
    setCreating(false);
  };

  const baseUrl = window.location.origin;

  return (
    <div>
      <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "22px", fontWeight: 700, color: "#1d2939", margin: "0 0 20px 0" }}>Event Admin</h2>
      <Card style={{ marginBottom: 24 }}>
        <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "15px", fontWeight: 700, color: "#1d2939", margin: "0 0 14px 0" }}>Create New Event</h3>
        <Input label="Event Name" value={eventName} onChange={setEventName} placeholder="e.g. Milpitas Library" required />
        <Input label="Date" value={eventDate} onChange={setEventDate} placeholder="YYYY-MM-DD" type="date" required />
        <Input label="Location" value={eventLocation} onChange={setEventLocation} placeholder="e.g. Milpitas, CA" />
        <Input label="Max Items per Visitor" value={maxItems} onChange={(v) => setMaxItems(Number(v))} type="number" placeholder="2" />
        <Button onClick={handleCreate} disabled={!eventName.trim() || !eventDate || creating}>{creating ? "Creating..." : "Create Event"}</Button>
      </Card>
      <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "15px", fontWeight: 700, color: "#1d2939", margin: "0 0 12px 0" }}>Events</h3>
      {events.map((ev) => {
        const s = stats[ev.id];
        const checkinUrl = `${baseUrl}/checkin?event=${ev.id}`;
        return (
          <Card key={ev.id} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: "15px", fontWeight: 700, color: "#1d2939" }}>{ev.name}</span>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <Badge text={ev.is_open ? "Open" : "Closed"} color={ev.is_open ? "#2e7d32" : "#b42318"} />
                <Badge text={ev.date} />
                {editingMaxItems === ev.id && ev.is_open ? (
                  <input
                    type="number"
                    min={1}
                    max={10}
                    defaultValue={ev.max_items || 2}
                    autoFocus
                    onBlur={async (e) => {
                      const val = Math.min(10, Math.max(1, Number(e.target.value) || 2));
                      await updateEventMaxItems(ev.id, val);
                      setEditingMaxItems(null);
                      await loadEvents();
                    }}
                    onKeyDown={async (e) => {
                      if (e.key === "Enter") e.target.blur();
                      if (e.key === "Escape") setEditingMaxItems(null);
                    }}
                    style={{ width: 48, padding: "3px 6px", borderRadius: "6px", border: "1.5px solid #1e3a6e", fontFamily: "'Space Mono', monospace", fontSize: "12px", fontWeight: 700, textAlign: "center" }}
                  />
                ) : (
                  <span onClick={() => ev.is_open && setEditingMaxItems(ev.id)} style={{ cursor: ev.is_open ? "pointer" : "default", opacity: ev.is_open ? 1 : 0.4 }}>
                    <Badge text={`${ev.max_items || 2} items max`} />
                  </span>
                )}
              </div>
            </div>
            {ev.location && <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: "13px", color: "#667085", marginBottom: 8 }}>{ev.location}</div>}
            {/* Headline counts only — the breakdowns live on the Metrics tab. */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, fontFamily: "'Space Mono', monospace", fontSize: "12px", color: "#475467" }}>
              {s ? (
                <>
                  <span>{s.clients.total} clients</span>
                  <span>{s.items.total} items</span>
                </>
              ) : (
                <span style={{ color: "#98a2b3" }}>Loading stats...</span>
              )}
              {onViewMetrics && (
                <button
                  onClick={() => onViewMetrics(ev.id)}
                  style={{ marginLeft: "auto", background: "none", border: "none", padding: 0, fontFamily: "'Outfit', sans-serif", fontSize: "12px", fontWeight: 600, color: "#1e3a6e", cursor: "pointer" }}
                >
                  View metrics →
                </button>
              )}
            </div>
            <div style={{ marginTop: 10, padding: "8px 12px", background: "#f0f4f8", borderRadius: "8px", fontFamily: "'Space Mono', monospace", fontSize: "11px", color: "#475467", wordBreak: "break-all" }}>
              {checkinUrl}
            </div>
            <div style={{ marginTop: 12, textAlign: "center" }}>
              <QRCodeSVG value={checkinUrl} size={160} level="M" />
            </div>
            <div style={{ marginTop: 14, textAlign: "center", display: "flex", justifyContent: "center", gap: 8 }}>
              <Button
                variant={ev.is_open ? "danger" : "success"}
                onClick={async () => {
                  await toggleEventOpen(ev.id, !ev.is_open);
                  await loadEvents();
                }}
                style={{ padding: "8px 20px", fontSize: "13px", width: "auto", display: "inline-block" }}
              >
                {ev.is_open ? "Close Check-In" : "Reopen Check-In"}
              </Button>
              <Button
                variant="outline"
                onClick={() => exportAttendeesCSV(ev.id, ev.name)}
                style={{ padding: "8px 20px", fontSize: "13px", width: "auto", display: "inline-block" }}
              >
                Export Attendees
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
