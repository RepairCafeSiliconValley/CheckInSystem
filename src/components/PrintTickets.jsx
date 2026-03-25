import { QRCodeSVG } from "qrcode.react";
import Button from "./Button";
import { OUTCOMES } from "../lib/constants";

const font = "'Courier New', monospace";
const divider = { borderTop: "1px dashed #000", margin: "10px 0" };
const label = { fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 2, fontFamily: font, color: "#000" };
const value = { fontSize: "14px", fontWeight: 700, fontFamily: font, color: "#000", lineHeight: 1.4 };

export default function PrintTickets({ workOrders, attendeeName, eventName, onClose }) {
  const baseUrl = window.location.origin;

  return (
    <div>
      <div className="no-print">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <Button variant="ghost" onClick={onClose} style={{ width: "auto" }}>← Back</Button>
          <Button variant="primary" onClick={() => window.print()} style={{ width: "auto", padding: "10px 24px" }}>
            🖨️ Print {workOrders.length === 1 ? "Ticket" : `${workOrders.length} Tickets`}
          </Button>
        </div>
        <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: "13px", color: "#667085", textAlign: "center", marginBottom: 16 }}>
          {workOrders.length === 1 ? "Preview of the ticket" : `Preview of ${workOrders.length} tickets`} that will be printed and pinned to the board.
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
          {/* Event name */}
          {eventName && (
            <div style={{ textAlign: "center", fontSize: "11px", fontFamily: font, color: "#000", marginBottom: 4 }}>
              {eventName}
            </div>
          )}

          <div style={divider} />

          {/* Ticket code */}
          <div style={{ textAlign: "center", padding: "8px 0" }}>
            <div style={{
              display: "inline-block",
              background: "#000",
              color: "#fff",
              padding: "6px 16px",
              fontSize: "28px",
              fontWeight: 700,
              fontFamily: font,
              letterSpacing: "3px",
              printColorAdjust: "exact",
              WebkitPrintColorAdjust: "exact",
            }}>
              {wo.code}
            </div>
          </div>

          <div style={divider} />

          {/* Visitor */}
          <div style={{ marginBottom: 8 }}>
            <div style={label}>VISITOR</div>
            <div style={value}>{attendeeName}</div>
          </div>

          {/* Item */}
          <div style={{ marginBottom: 8 }}>
            <div style={label}>ITEM</div>
            <div style={value}>{wo.item_name}</div>
          </div>

          {/* Category & Priority */}
          <div style={{ marginBottom: 4 }}>
            <div style={{ fontSize: "12px", fontFamily: font, color: "#000" }}>
              {wo.category} · Priority {wo.priority}
            </div>
          </div>

          <div style={divider} />

          {/* Problem */}
          <div style={{ marginBottom: 4 }}>
            <div style={label}>PROBLEM</div>
            <div style={{ fontSize: "12px", fontFamily: font, color: "#000", lineHeight: 1.5 }}>
              {wo.description}
            </div>
          </div>

          <div style={divider} />

          {/* Outcome checkboxes */}
          <div style={{ marginBottom: 8 }}>
            <div style={label}>OUTCOME</div>
            {OUTCOMES.map((o) => (
              <div key={o} style={{ fontSize: "13px", fontFamily: font, color: "#000", padding: "4px 0" }}>
                [ ] {o}
              </div>
            ))}
          </div>

          {/* Fixer name */}
          <div style={{ fontSize: "13px", fontFamily: font, color: "#000", marginBottom: 4 }}>
            Fixer: _______________
          </div>

          <div style={divider} />

          {/* QR code */}
          <div style={{ textAlign: "center", padding: "8px 0" }}>
            <QRCodeSVG value={`${baseUrl}/fix/${wo.code}`} size={90} level="M" />
            <div style={{ fontSize: "9px", fontFamily: font, color: "#000", marginTop: 4 }}>
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
