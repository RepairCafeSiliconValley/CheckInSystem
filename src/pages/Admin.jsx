import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import Card from "../components/Card";
import Input from "../components/Input";
import Button from "../components/Button";
import Badge from "../components/Badge";
import Modal from "../components/Modal";
import Checkbox from "../components/Checkbox";
import QrIcon from "../components/QrIcon";
import {
  fetchEvents,
  createEvent,
  fetchMetricsRows,
  toggleEventOpen,
  updateEvent,
  exportAttendeesCSV,
} from "../lib/store";
import { computeByEvent, formatKg, plural } from "../lib/metrics";

// Clamp to the CHECK constraint on events.max_items (1–10).
const clampMaxItems = (v) => Math.min(10, Math.max(1, Number(v) || 2));

export default function Admin({ onViewMetrics }) {
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [maxItems, setMaxItems] = useState(2);
  const [collectEmail, setCollectEmail] = useState(true);
  const [collectPhone, setCollectPhone] = useState(true);
  const [collectWeight, setCollectWeight] = useState(false);
  const [events, setEvents] = useState([]);
  const [stats, setStats] = useState({});
  const [creating, setCreating] = useState(false);
  // The event whose settings modal is open, plus its unsaved draft values.
  const [settingsEvent, setSettingsEvent] = useState(null);
  const [draft, setDraft] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);
  // The event whose check-in QR / URL popup is open.
  const [qrEvent, setQrEvent] = useState(null);
  const [copied, setCopied] = useState(false);

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

  useEffect(() => {
    loadEvents();
  }, []);

  const handleCreate = async () => {
    if (!eventName.trim() || !eventDate) return;
    setCreating(true);
    try {
      await createEvent({
        name: eventName.trim(),
        date: eventDate,
        location: eventLocation.trim(),
        maxItems: clampMaxItems(maxItems),
        collectEmail,
        collectPhone,
        collectWeight,
      });
      setEventName("");
      setEventDate("");
      setEventLocation("");
      setMaxItems(2);
      setCollectEmail(true);
      setCollectPhone(true);
      setCollectWeight(false);
      await loadEvents();
    } catch (err) {
      console.error("Failed to create event:", err);
    }
    setCreating(false);
  };

  const openSettings = (ev) => {
    setSettingsEvent(ev);
    setDraft({
      maxItems: ev.max_items || 2,
      collectEmail: ev.collect_email !== false,
      collectPhone: ev.collect_phone !== false,
      collectWeight: ev.collect_weight === true,
    });
  };

  const closeSettings = () => {
    setSettingsEvent(null);
    setDraft(null);
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await updateEvent(settingsEvent.id, {
        max_items: clampMaxItems(draft.maxItems),
        collect_email: draft.collectEmail,
        collect_phone: draft.collectPhone,
        collect_weight: draft.collectWeight,
      });
      closeSettings();
      await loadEvents();
    } catch (err) {
      console.error("Failed to save event settings:", err);
    }
    setSavingSettings(false);
  };

  const baseUrl = window.location.origin;
  const checkinUrlFor = (id) => `${baseUrl}/checkin?event=${id}`;

  const closeQr = () => {
    setQrEvent(null);
    setCopied(false);
  };

  const copyCheckinUrl = async () => {
    try {
      await navigator.clipboard.writeText(checkinUrlFor(qrEvent.id));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Clipboard needs a secure context; the URL below stays selectable.
      console.error("Failed to copy check-in URL:", err);
    }
  };

  return (
    <div>
      <h2
        style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: "22px",
          fontWeight: 700,
          color: "#1d2939",
          margin: "0 0 20px 0",
        }}
      >
        Event Admin
      </h2>
      <Card style={{ marginBottom: 24 }}>
        <h3
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: "15px",
            fontWeight: 700,
            color: "#1d2939",
            margin: "0 0 14px 0",
          }}
        >
          Create New Event
        </h3>
        <Input
          label="Event Name"
          value={eventName}
          onChange={setEventName}
          placeholder="e.g. Milpitas Library"
          required
        />
        <Input
          label="Date"
          value={eventDate}
          onChange={setEventDate}
          placeholder="YYYY-MM-DD"
          type="date"
          required
        />
        <Input
          label="Location"
          value={eventLocation}
          onChange={setEventLocation}
          placeholder="e.g. Milpitas, CA"
        />
        <Input
          label="Max Items per Visitor"
          value={maxItems}
          onChange={(v) => setMaxItems(Number(v))}
          type="number"
          placeholder="2"
        />
        <div style={{ marginBottom: 4 }}>
          <Checkbox
            label="Collect email address"
            checked={collectEmail}
            onChange={setCollectEmail}
          />
          <Checkbox
            label="Collect phone number"
            checked={collectPhone}
            onChange={setCollectPhone}
          />
          <Checkbox
            label="Record item weight (kg)"
            checked={collectWeight}
            onChange={setCollectWeight}
          />
        </div>
        <Button
          onClick={handleCreate}
          disabled={!eventName.trim() || !eventDate || creating}
        >
          {creating ? "Creating..." : "Create Event"}
        </Button>
      </Card>
      <h3
        style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: "15px",
          fontWeight: 700,
          color: "#1d2939",
          margin: "0 0 12px 0",
        }}
      >
        Events
      </h3>
      {events.map((ev) => {
        const s = stats[ev.id];
        return (
          <Card key={ev.id} style={{ marginBottom: 10 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <span
                style={{
                  fontFamily: "'Outfit', sans-serif",
                  fontSize: "15px",
                  fontWeight: 700,
                  color: "#1d2939",
                }}
              >
                {ev.name}
              </span>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <Badge
                  text={ev.is_open ? "Open" : "Closed"}
                  color={ev.is_open ? "#2e7d32" : "#b42318"}
                />
                <Badge text={ev.date} />
                <Badge
                  text={<QrIcon />}
                  onClick={() => setQrEvent(ev)}
                  title="Show check-in QR code"
                  ariaLabel="Show check-in QR code"
                />
              </div>
            </div>
            {ev.location && (
              <div
                style={{
                  fontFamily: "'Outfit', sans-serif",
                  fontSize: "13px",
                  color: "#667085",
                  marginBottom: 8,
                }}
              >
                {ev.location}
              </div>
            )}
            {/* Headline counts only — the breakdowns live on the Metrics tab. */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                fontFamily: "'Space Mono', monospace",
                fontSize: "12px",
                color: "#475467",
              }}
            >
              {s ? (
                <>
                  <span>{plural(s.clients.total, "client")}</span>
                  <span>{plural(s.items.total, "item")}</span>
                  {s.weight.present && <span>{formatKg(s.weight.totalKg)}</span>}
                </>
              ) : (
                <span style={{ color: "#98a2b3" }}>Loading stats...</span>
              )}
              {onViewMetrics && (
                <button
                  onClick={() => onViewMetrics(ev.id)}
                  style={{
                    marginLeft: "auto",
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
                  View metrics →
                </button>
              )}
            </div>
            <div
              style={{
                marginTop: 14,
                textAlign: "center",
                display: "flex",
                justifyContent: "center",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <Button
                variant={ev.is_open ? "danger" : "success"}
                onClick={async () => {
                  await toggleEventOpen(ev.id, !ev.is_open);
                  await loadEvents();
                }}
                style={{
                  padding: "8px 20px",
                  fontSize: "13px",
                  width: "auto",
                  display: "inline-block",
                }}
              >
                {ev.is_open ? "Close Check-In" : "Reopen Check-In"}
              </Button>
              <Button
                variant="outline"
                onClick={() => openSettings(ev)}
                style={{
                  padding: "8px 20px",
                  fontSize: "13px",
                  width: "auto",
                  display: "inline-block",
                }}
              >
                Configure Event
              </Button>
              <Button
                variant="outline"
                onClick={() => exportAttendeesCSV(ev.id, ev.name)}
                style={{
                  padding: "8px 20px",
                  fontSize: "13px",
                  width: "auto",
                  display: "inline-block",
                }}
              >
                Export Attendees
              </Button>
            </div>
          </Card>
        );
      })}

      {settingsEvent && draft && (
        <Modal
          title={`Configure Event — ${settingsEvent.name}`}
          onClose={closeSettings}
        >
          <Input
            label="Max Items per Visitor"
            value={draft.maxItems}
            onChange={(v) => setDraft({ ...draft, maxItems: v })}
            type="number"
            placeholder="2"
            min="1"
            step="1"
          />
          <Checkbox
            label="Collect email address"
            checked={draft.collectEmail}
            onChange={(v) => setDraft({ ...draft, collectEmail: v })}
          />
          <Checkbox
            label="Collect phone number"
            checked={draft.collectPhone}
            onChange={(v) => setDraft({ ...draft, collectPhone: v })}
          />
          <Checkbox
            label="Record item weight (kg)"
            checked={draft.collectWeight}
            onChange={(v) => setDraft({ ...draft, collectWeight: v })}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
            <Button onClick={handleSaveSettings} disabled={savingSettings}>
              {savingSettings ? "Saving..." : "Save"}
            </Button>
            <Button variant="ghost" onClick={closeSettings}>
              Cancel
            </Button>
          </div>
        </Modal>
      )}

      {qrEvent && (
        <Modal title={`Check-In QR code — ${qrEvent.name}`} onClose={closeQr}>
          <div style={{ textAlign: "center", marginBottom: 14 }}>
            <QRCodeSVG value={checkinUrlFor(qrEvent.id)} size={200} level="M" />
          </div>
          <div
            style={{
              padding: "8px 12px",
              background: "#f0f4f8",
              borderRadius: "8px",
              fontFamily: "'Space Mono', monospace",
              fontSize: "11px",
              color: "#475467",
              wordBreak: "break-all",
            }}
          >
            {checkinUrlFor(qrEvent.id)}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
            <Button onClick={copyCheckinUrl}>
              {copied ? "Copied!" : "Copy link"}
            </Button>
            <Button variant="ghost" onClick={closeQr}>
              Close
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
