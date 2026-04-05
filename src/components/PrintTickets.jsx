import { useState, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import Button from "./Button";
import { OUTCOMES } from "../lib/constants";

const font = "'Courier New', monospace";
const label = { fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 2, fontFamily: font, color: "#000" };
const value = { fontSize: "14px", fontWeight: 700, fontFamily: font, color: "#000", lineHeight: 1.4 };

function formatCheckInTime(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function PrintTickets({ workOrders, attendeeName, eventName, isVolunteer, onClose }) {
  const baseUrl = window.location.origin;
  const [printMode, setPrintMode] = useState("receipt");
  const isLabel = printMode === "label";
  const divider = { borderTop: "1px dashed #000", margin: isLabel ? "4px 0" : "10px 0" };

  const handlePrint = useCallback((mode) => {
    setPrintMode(mode);
    // Allow state to flush before opening print dialog
    setTimeout(() => window.print(), 50);
  }, []);

  const ticketLabel = workOrders.length === 1 ? "Ticket" : `${workOrders.length} Tickets`;

  return (
    <div>
      <div className="no-print">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <Button variant="ghost" onClick={onClose} style={{ width: "auto" }}>← Back</Button>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="primary" onClick={() => handlePrint("receipt")} style={{ width: "auto", padding: "10px 24px" }}>
              🖨️ Print Receipt (80mm)
            </Button>
            <Button variant="primary" onClick={() => handlePrint("label")} style={{ width: "auto", padding: "10px 24px" }}>
              🏷️ Print Label (4×6)
            </Button>
          </div>
        </div>
        <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: "13px", color: "#667085", textAlign: "center", marginBottom: 16 }}>
          Preview of {ticketLabel.toLowerCase()} that will be printed and pinned to the board.
        </p>
      </div>

      {workOrders.map((wo, idx) => (
        <div
          key={wo.id}
          className={`print-ticket ${isLabel ? "print-ticket--label" : ""}`}
          style={{
            width: isLabel ? 380 : 280,
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
          <div style={{ textAlign: "center", padding: isLabel ? "4px 0" : "8px 0" }}>
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
              {wo.code}{isVolunteer ? "*" : ""}
            </div>
          </div>

          <div style={divider} />

          {/* Check-in time */}
          {formatCheckInTime(wo.created_at) && (
            <div style={{ marginBottom: 8 }}>
              <div style={label}>CHECKED IN</div>
              <div style={value}>{formatCheckInTime(wo.created_at)}</div>
            </div>
          )}

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
          <div style={{ marginBottom: isLabel ? 4 : 8 }}>
            <div style={label}>OUTCOME</div>
            <div style={isLabel ? { display: "flex", flexWrap: "wrap", gap: "2px 12px" } : {}}>
              {OUTCOMES.map((o) => (
                <div key={o} style={{ fontSize: "13px", fontFamily: font, color: "#000", padding: isLabel ? "1px 0" : "4px 0" }}>
                  [ ] {o}
                </div>
              ))}
            </div>
          </div>

          {/* Fixer name */}
          <div style={{ fontSize: "13px", fontFamily: font, color: "#000", marginBottom: 4 }}>
            Fixer: _______________
          </div>

          <div style={divider} />

          {/* QR code */}
          <div style={{ textAlign: "center", padding: isLabel ? "4px 0" : "8px 0" }}>
            <QRCodeSVG value={`${baseUrl}/fix/${wo.id}`} size={isLabel ? 100 : 90} level="M" />
            <div style={{ fontSize: "9px", fontFamily: font, color: "#000", marginTop: 4 }}>
              Scan to submit outcome
            </div>
          </div>
        </div>
      ))}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: ${isLabel ? "4in 6in" : "80mm auto"}; margin: ${isLabel ? "3mm" : "2mm"}; }
          body { margin: 0; padding: 0; }
          .print-ticket {
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: ${isLabel ? "3mm" : "2mm"} !important;
            border: none !important;
            break-inside: avoid;
            color: #000 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print-ticket--label {
            font-size: 14px !important;
          }
        }
      `}</style>
    </div>
  );
}
