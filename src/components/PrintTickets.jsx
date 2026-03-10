import Logo from "./Logo";
import Button from "./Button";
import Badge from "./Badge";
import { OUTCOMES } from "../lib/constants";

export default function PrintTickets({ workOrders, attendeeName, eventName, onClose }) {
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
        <div key={wo.id} className="print-ticket" style={{ maxWidth: 400, margin: "0 auto", border: "2px solid #1e3a6e", borderRadius: "12px", padding: "24px", background: "#fff", marginBottom: idx < workOrders.length - 1 ? 24 : 0, pageBreakAfter: idx < workOrders.length - 1 ? "always" : "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <Logo size="tiny" />
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "11px", color: "#667085" }}>{eventName}</div>
            </div>
          </div>

          <div style={{ textAlign: "center", padding: "16px 0", borderTop: "1px solid #e8ebf0", borderBottom: "1px solid #e8ebf0", marginBottom: 16 }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "42px", fontWeight: 700, color: "#1e3a6e", letterSpacing: "4px" }}>{wo.code}</div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: "10px", fontWeight: 600, color: "#98a2b3", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 2 }}>Visitor</div>
            <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: "16px", fontWeight: 600, color: "#1d2939" }}>{attendeeName}</div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: "10px", fontWeight: 600, color: "#98a2b3", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 2 }}>Item</div>
            <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: "16px", fontWeight: 600, color: "#1d2939" }}>{wo.item_name}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <Badge text={wo.category} />
              <Badge text={`Priority ${wo.priority}`} color={wo.priority === 1 ? "#1e3a6e" : "#e07850"} />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: "10px", fontWeight: 600, color: "#98a2b3", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 2 }}>Problem</div>
            <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: "14px", color: "#344054", lineHeight: 1.5 }}>{wo.description}</div>
          </div>

          <div style={{ borderTop: "1px dashed #d0d5dd", paddingTop: 12 }}>
            <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: "10px", fontWeight: 600, color: "#98a2b3", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>Outcome (to be filled by coordinator)</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {OUTCOMES.map((o) => (
                <div key={o} style={{ padding: "6px 10px", border: "1.5px solid #d0d5dd", borderRadius: "6px", fontFamily: "'Outfit', sans-serif", fontSize: "12px", color: "#667085", textAlign: "center" }}>☐ {o}</div>
              ))}
            </div>
            <div style={{ marginTop: 10, padding: "8px 10px", border: "1.5px solid #d0d5dd", borderRadius: "6px" }}>
              <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: "12px", color: "#98a2b3" }}>Fixer name: ___________________________</span>
            </div>
          </div>
        </div>
      ))}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; padding: 20px; }
          .print-ticket { border: 2px solid #000 !important; max-width: none !important; break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}
