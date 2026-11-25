import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import Card from "../components/Card";
import Input from "../components/Input";
import Button from "../components/Button";
import Badge from "../components/Badge";
import Modal from "../components/Modal";
import Checkbox from "../components/Checkbox";
import TextMessageField from "../components/TextMessageField";
import QrIcon from "../components/QrIcon";
import {
  fetchEvents,
  createEvent,
  fetchMetricsRows,
  toggleEventOpen,
  updateEvent,
  exportAttendeesCSV,
  fetchEventPrinter,
  saveEventPrinter,
  fetchCloudPrinters,
} from "../lib/store";
import { computeByEvent, formatKg, plural } from "../lib/metrics";
import { DEFAULT_TEXT_MESSAGE } from "../lib/textMessage";
import { printSettings, normalizeMac, formatLastSeen, isPrinterOnline } from "../lib/printing";

// Clamp to the CHECK constraint on events.max_items (1–10).
const clampMaxItems = (v) => Math.min(10, Math.max(1, Number(v) || 2));

// The Events tab: create events, configure them, open and close them, show a
// check-in QR, export attendees, and hop to an event's metrics.
export default function Events({ onViewMetrics }) {
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [maxItems, setMaxItems] = useState(2);
  const [collectEmail, setCollectEmail] = useState(true);
  const [collectPhone, setCollectPhone] = useState(true);
  const [collectWeight, setCollectWeight] = useState(false);
  const [textMessage, setTextMessage] = useState(DEFAULT_TEXT_MESSAGE);
  const [events, setEvents] = useState([]);
  const [stats, setStats] = useState({});
  const [creating, setCreating] = useState(false);
  // The event whose settings modal is open, plus its unsaved draft values.
  const [settingsEvent, setSettingsEvent] = useState(null);
  const [draft, setDraft] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState(null);
  // Printers that have checked in with the cloudprnt Edge Function, for the
  // status line and the "use this one" suggestions in Configure Event.
  // `at` is when they were read, the "now" their ages are measured from.
  const [printers, setPrinters] = useState({ rows: [], at: 0 });
  // The event whose check-in QR / URL popup is open.
  const [qrEvent, setQrEvent] = useState(null);
  const [copied, setCopied] = useState(false);

  const fetchEventsWithStats = async () => {
    // One read of every event's rows, grouped in JS. This used to be a
    // sequential fetch per event — O(events) round trips on every render.
    const [evs, rows] = await Promise.all([fetchEvents(), fetchMetricsRows(null)]);
    const statsMap = {};
    computeByEvent(rows, evs).forEach(({ event, metrics }) => {
      statsMap[event.id] = metrics;
    });
    return { evs, statsMap };
  };

  const applyEvents = ({ evs, statsMap }) => {
    setEvents(evs);
    setStats(statsMap);
  };

  const loadEvents = async () => applyEvents(await fetchEventsWithStats());

  // State is set from the promise callback, not in the effect body.
  useEffect(() => {
    fetchEventsWithStats().then(applyEvents);
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
        textMessageTemplate: textMessage.trim(),
      });
      setEventName("");
      setEventDate("");
      setEventLocation("");
      setMaxItems(2);
      setCollectEmail(true);
      setCollectPhone(true);
      setCollectWeight(false);
      setTextMessage(DEFAULT_TEXT_MESSAGE);
      await loadEvents();
    } catch (err) {
      console.error("Failed to create event:", err);
    }
    setCreating(false);
  };

  const openSettings = (ev) => {
    const print = printSettings(ev);
    setSettingsEvent(ev);
    setSettingsError(null);
    setDraft({
      maxItems: ev.max_items || 2,
      collectEmail: ev.collect_email !== false,
      collectPhone: ev.collect_phone !== false,
      collectWeight: ev.collect_weight === true,
      textMessage: ev.text_message_template ?? DEFAULT_TEXT_MESSAGE,
      useLegacyPrint: print.legacy,
      printPreview: print.preview,
      printerMac: "",
    });
    // The printer lives in its own admin-only table; fill it in when it lands.
    setPrinters({ rows: [], at: 0 });
    Promise.all([fetchEventPrinter(ev.id), fetchCloudPrinters()])
      .then(([mac, seen]) => {
        setDraft((d) => (d ? { ...d, printerMac: mac || "" } : d));
        setPrinters({ rows: seen, at: Date.now() });
      })
      .catch((err) => console.error("Failed to load printer settings:", err));
  };

  const closeSettings = () => {
    setSettingsEvent(null);
    setDraft(null);
    setSettingsError(null);
  };

  const handleSaveSettings = async () => {
    const mac = draft.printerMac.trim() ? normalizeMac(draft.printerMac) : null;
    if (draft.printerMac.trim() && !mac) {
      setSettingsError("The printer MAC address should be 12 hex digits, like 00:11:62:AA:BB:CC.");
      return;
    }
    setSettingsError(null);
    setSavingSettings(true);
    try {
      await updateEvent(settingsEvent.id, {
        max_items: clampMaxItems(draft.maxItems),
        collect_email: draft.collectEmail,
        collect_phone: draft.collectPhone,
        collect_weight: draft.collectWeight,
        // The DB CHECK rejects a blank template; fall back to the default
        // rather than letting Save fail on an empty box.
        text_message_template:
          draft.textMessage.trim() || DEFAULT_TEXT_MESSAGE,
        use_legacy_print: draft.useLegacyPrint,
        print_preview: draft.printPreview,
      });
      // Kept even while legacy printing is on, so switching back to CloudPRNT
      // doesn't mean typing the address again.
      await saveEventPrinter(settingsEvent.id, mac);
      closeSettings();
      await loadEvents();
    } catch (err) {
      console.error("Failed to save event settings:", err);
      setSettingsError(err?.message || "Couldn't save the settings.");
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
        <TextMessageField
          value={textMessage}
          onChange={setTextMessage}
          disabled={!collectPhone}
          disabledNote="Texting is off because this event isn't collecting phone numbers. Tickets still print the claim QR, so fixers can claim items — no text is sent."
        />
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
                {ev.is_open
                  ? "Close Check-In"
                  : ev.first_opened_at
                    ? "Reopen Check-In"
                    : "Open Check-In"}
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
          <TextMessageField
            value={draft.textMessage}
            onChange={(v) => setDraft({ ...draft, textMessage: v })}
            disabled={!draft.collectPhone}
            disabledNote="Texting is off because this event isn't collecting phone numbers. Tickets still print the claim QR, so fixers can claim items — no text is sent."
          />
          <PrintSettingsFields
            draft={draft}
            setDraft={setDraft}
            printers={printers}
          />
          {settingsError && (
            <p
              role="alert"
              style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: "13px",
                color: "#b42318",
                margin: "12px 0 0 0",
              }}
            >
              {settingsError}
            </p>
          )}
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

// The Printing section of Configure Event: which way tickets print
// (printing.js), whether the desk sees a preview first, and which CloudPRNT
// printer the event uses. The MAC address only matters for CloudPRNT, so the
// field hides while legacy printing is on.
function PrintSettingsFields({ draft, setDraft, printers: { rows: printers, at: now } }) {
  const mac = normalizeMac(draft.printerMac);
  const current = mac ? printers.find((p) => p.printer_mac === mac) : null;
  const online = isPrinterOnline(current?.last_poll_at, now);
  // Printers seen in the last day that aren't the one entered: the usual way
  // to find a new printer's address is to plug it in and pick it here.
  const suggestions = printers
    .filter((p) => p.printer_mac !== mac)
    .filter((p) => now - new Date(p.last_poll_at).getTime() < 24 * 3600 * 1000)
    .slice(0, 5);
  const note = {
    fontFamily: "'Outfit', sans-serif",
    fontSize: "12px",
    color: "#667085",
    margin: "-8px 0 12px 0",
    lineHeight: 1.4,
  };

  return (
    <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #eaecf0" }}>
      <div
        style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: "13px",
          fontWeight: 700,
          color: "#344054",
          marginBottom: 12,
        }}
      >
        Printing
      </div>
      <Checkbox
        label="Use legacy window.print()"
        checked={draft.useLegacyPrint}
        onChange={(v) => setDraft({ ...draft, useLegacyPrint: v })}
      />
      <p style={note}>
        {draft.useLegacyPrint
          ? "Tickets print through the browser's print dialog."
          : "Tickets go straight to the event's Star printer (CloudPRNT), from any device."}
      </p>
      <Checkbox
        label="Enable print preview"
        checked={draft.printPreview}
        onChange={(v) => setDraft({ ...draft, printPreview: v })}
      />
      <p style={note}>
        {draft.printPreview
          ? "The desk sees the tickets first and presses Print."
          : "Approve & Print and Reprint print at once, without a preview."}
      </p>

      {!draft.useLegacyPrint && (
        <>
          <Input
            label="Printer MAC address"
            value={draft.printerMac}
            onChange={(v) => setDraft({ ...draft, printerMac: v })}
            placeholder="00:11:62:AA:BB:CC"
          />
          <p style={note}>
            {!draft.printerMac.trim()
              ? "No printer set: printing will say so until one is entered."
              : !mac
                ? "That isn't a MAC address yet: 12 hex digits."
                : current
                  ? `${online ? "Online" : "Offline"} — last checked in ${formatLastSeen(current.last_poll_at, now)}${current.status_code ? ` (${current.status_code})` : ""}.`
                  : "This printer hasn't checked in yet. See docs/cloudprnt-printing.md to set it up."}
          </p>
          {suggestions.length > 0 && (
            <div style={{ ...note, margin: "0 0 12px 0" }}>
              Printers seen recently:{" "}
              {suggestions.map((p) => (
                <button
                  key={p.printer_mac}
                  type="button"
                  onClick={() => setDraft({ ...draft, printerMac: p.printer_mac.toUpperCase() })}
                  style={{
                    margin: "4px 6px 0 0",
                    padding: "2px 8px",
                    borderRadius: 12,
                    border: "1px solid #d0d5dd",
                    background: "#fff",
                    fontFamily: "'Space Mono', monospace",
                    fontSize: "11px",
                    color: "#1e3a6e",
                    cursor: "pointer",
                  }}
                >
                  {p.printer_mac.toUpperCase()} · {formatLastSeen(p.last_poll_at, now)}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
