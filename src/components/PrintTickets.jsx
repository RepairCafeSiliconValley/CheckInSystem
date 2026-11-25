import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import Button from "./Button";
import TicketCodeBadge, { TICKET_CODE_BADGE_MODE, VolunteerPill } from "./TicketCodeBadge";
import { formatClockTime } from "../lib/metrics";
import { ticketUrl } from "../lib/ticketLink";
import { isReprint, nextPrintCount } from "../lib/printing";

const font = "'Courier New', monospace";
const labelStyle = {
  fontSize: "10px",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "1px",
  fontFamily: font,
  color: "#000",
};
const valueStyle = {
  fontSize: "14px",
  fontWeight: 700,
  fontFamily: font,
  color: "#000",
};
const qrCaptionStyle = {
  fontSize: "12px",
  fontWeight: 700,
  fontFamily: font,
  color: "#000",
  marginTop: 4,
  textAlign: "center",
  lineHeight: 1.3,
};

export default function PrintTickets({
  workOrders,
  attendeeName,
  isVolunteer,
  // Will this client actually receive a text when the item is claimed? Needs
  // all three gates: the event collects phone numbers, a usable number is on
  // file, and they consented. Shown as a pill beside the priority number; the
  // claim QR and its caption are the same either way. Defaults to false so a
  // caller that hasn't been updated makes no promise it can't keep.
  canTextClient = false,
  submittedAt,
  onClose,
  // Optional: straight back to the queue, skipping the visitor detail. The
  // front desk's next step after printing is the next visitor, and "← Back"
  // then "← Queue" was two clicks for it.
  onDone,
  // How Print prints (printing.js): "legacy" opens the browser's print dialog,
  // "cloud" sends the tickets to the event's Star printer.
  engine = "legacy",
  // Legacy printing without a preview: open the print dialog straight away.
  autoPrint = false,
  // Counts the print (and for "cloud", queues it). Resolves to
  // [{ work_order_id, times_printed }]. Optional so the view still prints
  // without it.
  onPrint,
}) {
  const baseUrl = window.location.origin;
  const divider = { borderTop: "1px solid #000", margin: "10px 0" };
  // One time for the whole visit, matching the queue card — an item added
  // later at the desk still belongs to the same submission.
  const submittedLabel = formatClockTime(submittedAt);

  // Once Print has been pressed, Back to Queue becomes the primary button.
  // Not an automatic return on afterprint: that also fires when the dialog is
  // cancelled, and a jammed ticket needs the preview to print again.
  const [printed, setPrinted] = useState(false);
  const [busy, setBusy] = useState(false);
  // { kind: "error" | "ok", text } shown under the buttons.
  const [message, setMessage] = useState(null);

  // Each item's print count for the print shown here: one more than stored
  // until Print is pressed, then what the database counted. Decides REPRINT.
  const [counts, setCounts] = useState(() =>
    Object.fromEntries(workOrders.map((wo) => [wo.id, nextPrintCount(wo)])),
  );

  const handlePrint = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    let results = null;
    let failure = null;
    try {
      results = onPrint ? await onPrint() : [];
    } catch (err) {
      failure = err?.message || "Printing failed.";
    }
    if (results) {
      setCounts((prev) => ({
        ...prev,
        ...Object.fromEntries(results.map((r) => [r.work_order_id, r.times_printed])),
      }));
    }

    if (engine === "cloud") {
      if (failure) {
        setMessage({ kind: "error", text: failure });
      } else {
        setPrinted(true);
        const n = results.length;
        setMessage({ kind: "ok", text: `Sent ${n} ${n === 1 ? "ticket" : "tickets"} to the printer.` });
      }
    } else {
      // The browser dialog prints whether or not the count was saved: the
      // ticket matters more at the desk than the tally.
      setPrinted(true);
      if (failure) {
        setMessage({ kind: "error", text: `Printed, but the print wasn't recorded: ${failure}` });
      }
      // Let the REPRINT banner render before the dialog snapshots the page.
      setTimeout(() => window.print(), 50);
    }
    setBusy(false);
  }, [engine, onPrint]);

  // Once, on arrival. A timer rather than a direct call keeps state updates
  // out of the effect body, and its cleanup is what stops StrictMode's
  // mount-unmount-mount from printing twice.
  useEffect(() => {
    if (!autoPrint) return undefined;
    const timer = setTimeout(handlePrint, 0);
    return () => clearTimeout(timer);
    // handlePrint is stable for the life of the view; listing it would reprint
    // if the caller ever passed a new onPrint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPrint]);

  const ticketLabel =
    workOrders.length === 1 ? "Ticket" : `${workOrders.length} Tickets`;

  return (
    <div>
      <div className="no-print">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 20,
          }}
        >
          <Button variant="ghost" onClick={onClose} style={{ width: "auto" }}>
            ← Client
          </Button>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Button
              variant={onDone && printed ? "outline" : "primary"}
              onClick={handlePrint}
              disabled={busy}
              style={{ width: "auto", padding: "10px 24px" }}
            >
              {busy ? "Printing…" : "🖨️ Print"}
            </Button>
            {onDone && (
              <Button
                variant={printed ? "primary" : "outline"}
                onClick={onDone}
                style={{ width: "auto", padding: "10px 24px" }}
              >
                Back to Queue
              </Button>
            )}
          </div>
        </div>
        <p
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: "13px",
            color: "#667085",
            textAlign: "center",
            marginBottom: 16,
          }}
        >
          Preview of {ticketLabel.toLowerCase()} that will be printed and pinned
          to the board.
        </p>
        {message && (
          <p
            role={message.kind === "error" ? "alert" : "status"}
            style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: "14px",
              fontWeight: 600,
              color: message.kind === "error" ? "#b42318" : "#2e7d32",
              textAlign: "center",
              marginBottom: 16,
            }}
          >
            {message.text}
          </p>
        )}
      </div>

      {workOrders.map((wo, idx) => (
        <div
          key={wo.id}
          className="print-ticket"
          style={{
            width: 280,
            margin: "0 auto",
            padding: "12px",
            background: "#fff",
            fontFamily: font,
            color: "#000",
            marginBottom: idx < workOrders.length - 1 ? 24 : 0,
            pageBreakAfter: idx < workOrders.length - 1 ? "always" : "auto",
          }}
        >
          {/* Printed before: say so, big, so a duplicate on the board is
              obvious. Matches the CloudPRNT ticket (starTicket.js). */}
          {isReprint(counts[wo.id]) && (
            <div
              className="reprint-banner"
              style={{
                fontSize: "34px",
                fontWeight: 900,
                fontFamily: font,
                color: "#000",
                textAlign: "center",
                letterSpacing: "4px",
                lineHeight: 1.1,
                marginBottom: 8,
              }}
            >
              REPRINT
            </div>
          )}

          {/* Top row: time + ticket code */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            {submittedLabel && (
              <div
                style={{
                  padding: "4px 10px",
                  fontSize: "18px",
                  fontWeight: 700,
                  fontFamily: font,
                  color: "#000",
                }}
              >
                {submittedLabel}
              </div>
            )}
            <TicketCodeBadge
              code={wo.priority}
              canTextClient={canTextClient}
              mode={TICKET_CODE_BADGE_MODE.PRIORITY}
            />
          </div>
          <div style={divider} />

          {/* Category */}
          <div
            style={{
              fontSize: "15px",
              fontWeight: 700,
              fontFamily: font,
              color: "#000",
              textTransform: "uppercase",
              textAlign: "center",
              marginBottom: 4,
            }}
          >
            {wo.category}
          </div>

          <div style={divider} />

          {/* Item */}
          <div style={{ marginBottom: 6 }}>
            <span style={labelStyle}>ITEM: </span>
            <span style={valueStyle}>{wo.item_name}</span>
          </div>

          {/* Issue */}
          <div style={{ marginBottom: 4 }}>
            <span style={labelStyle}>ISSUE: </span>
            <span style={valueStyle}>{wo.description}</span>
          </div>

          <div style={divider} />

          {/* Client */}
          <div style={{ marginBottom: 4 }}>
            <span style={labelStyle}>CLIENT: </span>
            <span style={valueStyle}>{attendeeName}</span>
            {isVolunteer && <VolunteerPill />}
          </div>

          <div style={divider} />

          {/* Ticket code above one centred QR.
              There used to be two codes side by side — claim on the left,
              submit-outcome on the right — which made volunteers choose
              between them and squeezed each into a 76px column. Both now point
              at the one ticket page, which decides what to show from the item's status,
              so a single code can take the full ticket width. At 140px the
              modules are nearly twice as wide, which is what makes this scan
              reliably off thermal paper.

              The link is the short upper-case /T/<code> form (ticketLink.js),
              not the full UUID: that made a 37×37 QR, and this one is 29×29, so each
              module is about a quarter wider again. */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "8px 0",
            }}
          >
            <TicketCodeBadge
              code={wo.code?.split("-")[0]}
              mode={TICKET_CODE_BADGE_MODE.COMPACT}
            />
            <div
              style={{
                width: 140,
                height: 140,
                overflow: "hidden",
                marginTop: 6,
              }}
            >
              <QRCodeSVG
                value={ticketUrl(baseUrl, wo.id)}
                size={140}
                level="M"
                style={{ width: "140px", height: "140px", display: "block" }}
              />
            </div>
            {/* Whether this client gets a text is shown by the badge next to
                the priority number at the top, not here. */}
            <div style={qrCaptionStyle}>
              SCAN TO CLAIM OR
              <br />
              SUBMIT OUTCOME
            </div>
          </div>
        </div>
      ))}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: 72mm auto; margin: 0; }
          body { margin: 0; padding: 0; }
          .print-ticket {
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 2mm !important;
            border: none !important;
            break-inside: avoid;
            color: #000 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
    </div>
  );
}
