import { useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import Button from "./Button";
import TicketCodeBadge, { TICKET_CODE_BADGE_MODE } from "./TicketCodeBadge";

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
function formatCheckInTime(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function PrintTickets({
  workOrders,
  attendeeName,
  isVolunteer,
  onClose,
}) {
  const baseUrl = window.location.origin;
  const divider = { borderTop: "1px solid #000", margin: "10px 0" };

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
            {formatCheckInTime(wo.created_at) && (
              <div
                style={{
                  padding: "4px 10px",
                  fontSize: "18px",
                  fontWeight: 700,
                  fontFamily: font,
                  color: "#000",
                }}
              >
                {formatCheckInTime(wo.created_at)}
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
              gridTemplateColumns: "76px 1fr 76px",
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
                  width: 76,
                  height: 76,
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
                  width: 76,
                  height: 76,
                  overflow: "hidden",
                }}
              >
                <QRCodeSVG
                  value={`${baseUrl}/fix/${wo.id}`}
                  size={76}
                  level="M"
                  style={{ width: "76px", height: "76px", display: "block" }}
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
