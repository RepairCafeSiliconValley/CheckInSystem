import { useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import Button from "./Button";
import TicketCodeBadge, { TICKET_CODE_BADGE_MODE } from "./TicketCodeBadge";
import { formatClockTime } from "../lib/metrics";
import { fixerQrValue } from "../lib/qrUrl";

// Side of the QR square and of the stamp placeholder that mirrors it.
//
// 88px is 23.3mm, which on a 203 dpi head is 186 dots across — about 5 dots per
// module once the quiet zone is counted, up from 4.35 at the old 76px. Module
// edges snap to whole dots (qrcode.react sets shape-rendering: crispEdges), so
// a fractional dots-per-module is what printed as an uneven, pixelated symbol.
//
// Don't raise this past 88 without re-measuring the code badge between the two
// squares. 72mm less 2mm padding each side is ~257px, less this row's 6px
// paddingRight leaves ~251px, so two squares at 88px leave the badge ~75px. A
// 3-character code needs ~62px (3 chars x 10.8px Courier New at 18px, plus 2px
// letter-spacing each, plus 24px padding) — about 13px of slack. At 95px the
// badge would get ~61px and clip, which is why this is 88 and not 95.
const QR_SIZE_PX = 88;

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
  submittedAt,
  onClose,
}) {
  const divider = { borderTop: "1px solid #000", margin: "10px 0" };
  // One time for the whole visit, matching the queue card — an item added
  // later at the desk still belongs to the same submission.
  const submittedLabel = formatClockTime(submittedAt);

  const handlePrint = useCallback(() => {
    setTimeout(() => window.print(), 50);
  }, []);

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
            marginBottom: 20,
          }}
        >
          <Button variant="ghost" onClick={onClose} style={{ width: "auto" }}>
            ← Back
          </Button>
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              variant="primary"
              onClick={handlePrint}
              style={{ width: "auto", padding: "10px 24px" }}
            >
              🖨️ Print
            </Button>
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
              isVolunteer={isVolunteer}
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
          </div>

          <div style={divider} />

          {/* Stamp placeholder, ticket code, and QR code in one vertically centered row.
              Uses CSS Grid with fixed-width outer columns (not flexbox
              space-between) so the placeholder and QR are pinned to fixed
              positions relative to the row's own width. The code badge's
              rendered width — which can vary with font metrics between
              environments — lives entirely inside the middle column and
              can never push the QR out of place. */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `${QR_SIZE_PX}px 1fr ${QR_SIZE_PX}px`,
              alignItems: "center",
              padding: "8px 0 8px 0",
              paddingRight: 6,
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  width: QR_SIZE_PX,
                  height: QR_SIZE_PX,
                  border: "1px dashed #000",
                  boxSizing: "border-box",
                }}
              />
              {/* invisible spacer matching the QR caption so both squares stay aligned */}
              <div style={{ ...qrCaptionStyle, visibility: "hidden" }}>
                SUBMIT
                <br />
                RESOLUTION
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifySelf: "center",
                maxWidth: "100%",
                overflow: "hidden",
              }}
            >
              <TicketCodeBadge
                code={wo.code?.split("-")[0]}
                isVolunteer={isVolunteer}
                mode={TICKET_CODE_BADGE_MODE.COMPACT}
              />
              {/* invisible spacer matching the QR caption so the code stays level with the boxes */}
              <div style={{ ...qrCaptionStyle, visibility: "hidden" }}>
                SUBMIT
                <br />
                RESOLUTION
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  width: QR_SIZE_PX,
                  height: QR_SIZE_PX,
                  overflow: "hidden",
                }}
              >
                {/* marginSize is the quiet zone, in modules. qrcode.react
                    defaults it to 0, which printed the symbol flush to the box
                    edge with the caption below touching its bottom row — out of
                    spec, and a common reason a scanner can't find the code. */}
                <QRCodeSVG
                  value={fixerQrValue(wo.id)}
                  size={QR_SIZE_PX}
                  level="M"
                  marginSize={2}
                  style={{
                    width: `${QR_SIZE_PX}px`,
                    height: `${QR_SIZE_PX}px`,
                    display: "block",
                  }}
                />
              </div>
              <div style={qrCaptionStyle}>
                SUBMIT
                <br />
                RESOLUTION
              </div>
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
