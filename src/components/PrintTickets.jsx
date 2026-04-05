import { useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import Button from "./Button";
import { OUTCOMES } from "../lib/constants";

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
  const divider = { borderTop: "1px dashed #000", margin: "10px 0" };

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
                  border: "1px solid #000",
                  padding: "4px 10px",
                  fontSize: "16px",
                  fontWeight: 700,
                  fontFamily: font,
                  color: "#000",
                }}
              >
                {formatCheckInTime(wo.created_at)}
              </div>
            )}
            <div
              style={{
                background: "#000",
                color: "#fff",
                padding: "4px 12px",
                fontSize: "18px",
                fontWeight: 700,
                fontFamily: font,
                letterSpacing: "2px",
                printColorAdjust: "exact",
                WebkitPrintColorAdjust: "exact",
              }}
            >
              {wo.code}
              {isVolunteer ? "*" : ""}
            </div>
          </div>

          {/* Category */}
          <div
            style={{
              fontSize: "13px",
              fontWeight: 700,
              fontFamily: font,
              color: "#000",
              textTransform: "uppercase",
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

          {/* Outcome checkboxes */}
          <div style={{ marginBottom: 8 }}>
            <div style={labelStyle}>OUTCOME</div>
            <div style={{ marginTop: 4 }}>
              {OUTCOMES.map((o) => (
                <div
                  key={o}
                  style={{
                    fontSize: "13px",
                    fontFamily: font,
                    color: "#000",
                    padding: "4px 0",
                  }}
                >
                  [ ] {o}
                </div>
              ))}
            </div>
          </div>

          {/* Fixer name */}
          <div style={{ marginBottom: 4 }}>
            <span style={labelStyle}>FIXER: </span>
            <span
              style={{
                borderBottom: "1px solid #000",
                display: "inline-block",
                width: "70%",
                verticalAlign: "middle",
              }}
            >
              &nbsp;
            </span>
          </div>

          <div style={divider} />

          {/* QR code */}
          <div style={{ textAlign: "center", padding: "8px 0" }}>
            <QRCodeSVG value={`${baseUrl}/fix/${wo.id}`} size={90} level="M" />
            <div
              style={{
                fontSize: "9px",
                fontFamily: font,
                color: "#000",
                marginTop: 4,
              }}
            >
              Scan to submit outcome
            </div>
          </div>
        </div>
      ))}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: 80mm auto; margin: 2mm; }
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
