import { useState, useEffect } from "react";
import Card from "../components/Card";
import Input from "../components/Input";
import Select from "../components/Select";
import TextArea from "../components/TextArea";
import Button from "../components/Button";
import Badge from "../components/Badge";
import StatusBadge from "../components/StatusBadge";
import { CATEGORIES, OUTCOMES } from "../lib/constants";
import {
  fetchVisitorDetail,
  updateAttendee,
  updateWorkOrder,
} from "../lib/store";

export default function CoordinatorVisitorDetail({
  attendeeId,
  onBack,
  onPrint,
}) {
  const [attendee, setAttendee] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // Editable visitor fields
  const [attName, setAttName] = useState("");
  const [attEmail, setAttEmail] = useState("");

  // Editable item fields — keyed by work order id
  const [itemEdits, setItemEdits] = useState({});
  const [saved, setSaved] = useState(false);

  const loadData = async () => {
    try {
      const { attendee: att, orders: wo } =
        await fetchVisitorDetail(attendeeId);
      setAttendee(att);
      setOrders(wo);
      setAttName(att.name);
      setAttEmail(att.email);
      const edits = {};
      wo.forEach((w) => {
        edits[w.id] = {
          item_name: w.item_name,
          category: w.category,
          description: w.description,
          fixer_name: w.fixer_name || "",
        };
      });
      setItemEdits(edits);
    } catch (err) {
      console.error("Failed to load visitor:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [attendeeId]);

  if (loading) {
    return (
      <p
        style={{
          fontFamily: "'Outfit', sans-serif",
          color: "#667085",
          textAlign: "center",
          padding: 32,
        }}
      >
        Loading...
      </p>
    );
  }

  if (!attendee) {
    return (
      <div>
        <Button variant="ghost" onClick={onBack}>
          ← Back
        </Button>
        <p>Visitor not found.</p>
      </div>
    );
  }

  const updateItem = (woId, field, value) => {
    setItemEdits((prev) => ({
      ...prev,
      [woId]: { ...prev[woId], [field]: value },
    }));
  };

  const saveAll = async () => {
    try {
      await updateAttendee(attendeeId, {
        name: attName.trim(),
        email: attEmail.trim(),
      });
      for (const wo of orders) {
        const e = itemEdits[wo.id];
        if (e) {
          await updateWorkOrder(wo.id, {
            item_name: e.item_name.trim(),
            category: e.category,
            description: e.description.trim(),
            fixer_name: e.fixer_name.trim(),
          });
        }
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      await loadData();
    } catch (err) {
      console.error("Failed to save:", err);
    }
  };

  const hasPending = orders.some((o) => o.status === "pending");
  const hasReviewed = orders.some((o) => o.status === "reviewed");

  const approveAndPrint = async () => {
    await saveAll();
    for (const wo of orders) {
      if (wo.status === "pending") {
        await updateWorkOrder(wo.id, { status: "reviewed" });
      }
    }
    await loadData();
    onPrint(attendeeId);
  };

  const reprintAll = () => {
    onPrint(attendeeId);
  };

  const setOrderStatus = async (woId, status) => {
    await updateWorkOrder(woId, { status });
    await loadData();
  };

  const setOrderOutcome = async (woId, outcome) => {
    const e = itemEdits[woId];
    const updates = { outcome, status: "completed" };
    if (e?.fixer_name?.trim()) updates.fixer_name = e.fixer_name.trim();
    await updateWorkOrder(woId, updates);
    await loadData();
  };

  const editOutcome = async (woId) => {
    await updateWorkOrder(woId, {
      status: "in-progress",
      fixer_name: "",
      outcome: null,
    });
    await loadData();
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <Button variant="ghost" onClick={onBack} style={{ width: "auto" }}>
          ← Queue
        </Button>
      </div>

      {/* Visitor info */}
      <Card style={{ marginBottom: 16 }}>
        <h3
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: "14px",
            fontWeight: 700,
            color: "#98a2b3",
            textTransform: "uppercase",
            letterSpacing: "1px",
            margin: "0 0 12px 0",
          }}
        >
          Visitor
        </h3>
        <Input
          label="Name"
          value={attName}
          onChange={setAttName}
          placeholder="Full name"
          required
        />
        <Input
          label="Email"
          value={attEmail}
          onChange={setAttEmail}
          placeholder="Email"
          type="email"
          required
        />
      </Card>

      {/* Each item */}
      {orders.map((wo) => {
        const e = itemEdits[wo.id] || {};
        return (
          <Card
            key={wo.id}
            style={{
              marginBottom: 16,
              borderLeft: `4px solid ${wo.priority === 1 ? "#1e3a6e" : "#e07850"}`,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    fontFamily: "'Space Mono', monospace",
                    fontSize: "16px",
                    fontWeight: 700,
                    color: "#1e3a6e",
                    letterSpacing: "1px",
                  }}
                >
                  {wo.code}
                </span>
                <Badge
                  text={`Priority ${wo.priority}`}
                  color={wo.priority === 1 ? "#1e3a6e" : "#e07850"}
                />
              </div>
              <StatusBadge status={wo.status} />
            </div>

            {/* Editable fields (always visible for pending/reviewed) */}
            {(wo.status === "pending" || wo.status === "reviewed") && (
              <>
                <Input
                  label="Item Name"
                  value={e.item_name || ""}
                  onChange={(v) => updateItem(wo.id, "item_name", v)}
                  placeholder="Item name"
                  required
                />
                <Select
                  label="Category"
                  value={e.category || ""}
                  onChange={(v) => updateItem(wo.id, "category", v)}
                  options={CATEGORIES}
                  placeholder="Category"
                  required
                />
                <TextArea
                  label="Problem"
                  value={e.description || ""}
                  onChange={(v) => updateItem(wo.id, "description", v)}
                  placeholder="Describe the problem"
                  required
                  rows={2}
                />
              </>
            )}

            {/* Read-only summary for in-progress/completed */}
            {(wo.status === "in-progress" || wo.status === "completed") && (
              <div style={{ marginBottom: 12 }}>
                <div
                  style={{
                    fontFamily: "'Outfit', sans-serif",
                    fontSize: "16px",
                    fontWeight: 600,
                    color: "#1d2939",
                    marginBottom: 4,
                  }}
                >
                  {wo.item_name}
                </div>
                <Badge text={wo.category} />
                <p
                  style={{
                    fontFamily: "'Outfit', sans-serif",
                    fontSize: "13px",
                    color: "#667085",
                    margin: "8px 0 0 0",
                    lineHeight: 1.5,
                  }}
                >
                  {wo.description}
                </p>
              </div>
            )}

            {/* Status-specific actions */}
            {wo.status === "reviewed" && (
              <div style={{ marginTop: 8 }}>
                <Button
                  variant="primary"
                  onClick={() => setOrderStatus(wo.id, "in-progress")}
                  style={{ padding: "10px 20px", fontSize: "13px" }}
                >
                  Mark as With Fixer
                </Button>
              </div>
            )}

            {wo.status === "in-progress" && (
              <div style={{ marginTop: 8 }}>
                <Input
                  label="Fixer Name (optional)"
                  value={e.fixer_name || ""}
                  onChange={(v) => updateItem(wo.id, "fixer_name", v)}
                  placeholder="Who worked on this?"
                />
                <p
                  style={{
                    fontFamily: "'Outfit', sans-serif",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#344054",
                    margin: "0 0 8px 0",
                  }}
                >
                  Record Outcome:
                </p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                  }}
                >
                  {OUTCOMES.map((o) => (
                    <button
                      key={o}
                      onClick={() => setOrderOutcome(wo.id, o)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "1.5px solid #d0d5dd",
                        background: "#fff",
                        fontFamily: "'Outfit', sans-serif",
                        fontSize: "13px",
                        fontWeight: 500,
                        color: "#475467",
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      {o === "Fixed" && "✅ "}
                      {o === "Diagnosed" && "🔍 "}
                      {o === "Out of Scope" && "↩️ "}
                      {o === "Not Fixable" && "❌ "}
                      {o}
                    </button>
                  ))}
                </div>
                <div
                  style={{
                    marginTop: 10,
                    borderTop: "1px solid #e8ebf0",
                    paddingTop: 10,
                  }}
                >
                  <Button
                    variant="ghost"
                    onClick={() => setOrderStatus(wo.id, "reviewed")}
                    style={{ fontSize: "13px", padding: "8px 12px" }}
                  >
                    ← Back to Ready (undo With Fixer)
                  </Button>
                </div>
              </div>
            )}

            {wo.status === "completed" && (
              <div style={{ marginTop: 8 }}>
                <div
                  style={{
                    padding: "10px",
                    background: "#e8f5e9",
                    borderRadius: "8px",
                    textAlign: "center",
                    marginBottom: 8,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "'Outfit', sans-serif",
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "#2e7d32",
                    }}
                  >
                    {wo.outcome}
                  </span>
                  {wo.fixer_name && (
                    <span
                      style={{
                        fontFamily: "'Outfit', sans-serif",
                        fontSize: "12px",
                        color: "#667085",
                        marginLeft: 8,
                      }}
                    >
                      by {wo.fixer_name}
                    </span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  onClick={() => editOutcome(wo.id)}
                  style={{ fontSize: "13px", padding: "8px 12px" }}
                >
                  ✏️ Edit Outcome
                </Button>
              </div>
            )}
          </Card>
        );
      })}

      {/* Action bar */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          marginBottom: 16,
        }}
      >
        <Button onClick={saveAll}>Save Changes</Button>
        {saved && (
          <div style={{ textAlign: "center" }}>
            <span
              style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: "13px",
                color: "#2e7d32",
                fontWeight: 600,
              }}
            >
              Changes saved!
            </span>
          </div>
        )}

        {hasPending && (
          <Button variant="coral" onClick={approveAndPrint}>
            ✅ Approve & Print{" "}
            {orders.filter((o) => o.status === "pending").length === 1
              ? "Ticket"
              : "All Tickets"}
          </Button>
        )}

        {hasReviewed && !hasPending && (
          <Button variant="outline" onClick={reprintAll}>
            🖨️ Reprint{" "}
            {orders.filter(
              (o) => o.status === "reviewed" || o.status === "in-progress",
            ).length === 1
              ? "Ticket"
              : "Tickets"}
          </Button>
        )}
      </div>
    </div>
  );
}
