import Card from "./Card";
import Badge from "./Badge";

// Code, client, item and issue — the context a fixer needs to confirm they
// scanned the right ticket. Both halves of the ticket page show it, and before the
// two pages merged each carried its own near-identical copy.

const fieldLabel = {
  fontSize: "10px",
  fontWeight: 600,
  color: "#98a2b3",
  textTransform: "uppercase",
  letterSpacing: "1px",
  marginBottom: 2,
};

export default function ItemDetailsCard({ workOrder, clientName }) {
  return (
    <Card style={{ marginBottom: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <span
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: "16px",
            fontWeight: 700,
            color: "#1e3a6e",
            letterSpacing: "1px",
          }}
        >
          {workOrder.code}
        </span>
        <Badge
          text={`Priority ${workOrder.priority}`}
          color={workOrder.priority === 1 ? "#1e3a6e" : "#e07850"}
        />
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={fieldLabel}>Client</div>
        <div style={{ fontSize: "15px", fontWeight: 600, color: "#1d2939" }}>
          {clientName}
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={fieldLabel}>Item</div>
        <div
          style={{
            fontSize: "15px",
            fontWeight: 600,
            color: "#1d2939",
            marginBottom: 4,
          }}
        >
          {workOrder.item_name}
        </div>
        {workOrder.category && <Badge text={workOrder.category} />}
      </div>

      <div>
        <div style={fieldLabel}>Issue</div>
        <p
          style={{
            fontSize: "14px",
            color: "#344054",
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          {workOrder.description}
        </p>
      </div>
    </Card>
  );
}
