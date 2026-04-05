import { useState, useEffect, useRef } from "react";
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
  const [saved, setSaved] = useState(false);

  // Editable visitor fields
  const [attName, setAttName] = useState("");
  const [attEmail, setAttEmail] = useState("");
  const [attPhone, setAttPhone] = useState("");
  const [attZipCode, setAttZipCode] = useState("");

  // Editable item fields — keyed by work order id
  const [itemEdits, setItemEdits] = useState({});

  // Refs to always have latest values in async callbacks without stale closures
  const attNameRef = useRef("");
  const attEmailRef = useRef("");
  const attPhoneRef = useRef("");
  const attZipCodeRef = useRef("");
  const itemEditsRef = useRef({});
  const ordersRef = useRef([]);

  attNameRef.current = attName;
  attEmailRef.current = attEmail;
  attPhoneRef.current = attPhone;
  attZipCodeRef.current = attZipCode;
  itemEditsRef.current = itemEdits;
  ordersRef.current = orders;

  const showSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const loadData = async () => {
    try {
      const { attendee: att, orders: wo } = await fetchVisitorDetail(attendeeId);
      setAttendee(att);
      setOrders(wo);
      setAttName(att.name);
      setAttEmail(att.email || "");
      setAttPhone(att.phone || "");
      setAttZipCode(att.zip_code || "");
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
      <p style={{ fontFamily: "'Outfit', sans-serif", color: "#667085", textAlign: "center", padding: 32 }}>
        Loading...
      </p>
    );
  }

  if (!attendee) {
    return (
      <div>
        <Button variant="ghost" onClick={onBack}>← Back</Button>
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

  // Save only attendee fields (on blur of any attendee text input)
  const saveAttendee = async () => {
    try {
      await updateAttendee(attendeeId, {
        name: attNameRef.current.trim(),
        email: attEmailRef.current.trim() || null,
        phone: attPhoneRef.current.trim() || null,
        zip_code: attZipCodeRef.current.trim(),
      });
      showSaved();
    } catch (err) {
      console.error("Failed to save attendee:", err);
    }
  };

  // Save only a single work order (on blur or category change)
  const saveWorkOrder = async (woId) => {
    const e = itemEditsRef.current[woId];
    if (!e) return;
    try {
      await updateWorkOrder(woId, {
        item_name: e.item_name.trim(),
        category: e.category,
        description: e.description.trim(),
        fixer_name: e.fixer_name.trim(),
      });
      showSaved();
    } catch (err) {
      console.error("Failed to save work order:", err);
    }
  };

  // Save everything — used by Approve & Print and back navigation
  const saveAll = async () => {
    try {
      await updateAttendee(attendeeId, {
        name: attNameRef.current.trim(),
        email: attEmailRef.current.trim() || null,
        phone: attPhoneRef.current.trim() || null,
        zip_code: attZipCodeRef.current.trim(),
      });
      for (const wo of ordersRef.current) {
        const e = itemEditsRef.current[wo.id];
        if (e) {
          await updateWorkOrder(wo.id, {
            item_name: e.item_name.trim(),
            category: e.category,
            description: e.description.trim(),
            fixer_name: e.fixer_name.trim(),
          });
        }
      }
    } catch (err) {
      console.error("Failed to save:", err);
    }
  };

  const handleBack = async () => {
    await saveAll();
    onBack();
  };

  const hasPending = orders.some((o) => o.status === "pending");
  const hasPendingAssignment = orders.some((o) => o.status === "pending_assignment");
  const allCategoriesAssigned = orders.every(
    (o) => (itemEdits[o.id]?.category || o.category) && (itemEdits[o.id]?.category || o.category) !== ""
  );

  const approveAndPrint = async () => {
    await saveAll();
    for (const wo of orders) {
      if (wo.status === "pending") {
        await updateWorkOrder(wo.id, { status: "pending_assignment", printed_at: new Date().toISOString() });
      }
    }
    await loadData();
    onPrint(attendeeId);
  };

  const reprintAll = () => {
    onPrint(attendeeId);
  };

  const setOrderOutcome = async (woId, outcome) => {
    const e = itemEdits[woId];
    const updates = { outcome, status: "completed", completed_at: new Date().toISOString() };
    if (e?.fixer_name?.trim()) updates.fixer_name = e.fixer_name.trim();
    await updateWorkOrder(woId, updates);
    await loadData();
  };

  const editOutcome = async (woId) => {
    await updateWorkOrder(woId, {
      status: "pending_assignment",
      fixer_name: "",
      outcome: null,
      completed_at: null,
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
        <Button variant="ghost" onClick={handleBack} style={{ width: "auto" }}>
          ← Queue
        </Button>
        {saved && (
          <span
            style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: "12px",
              color: "#2e7d32",
              fontWeight: 600,
            }}
          >
            Saved
          </span>
        )}
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
          onBlur={saveAttendee}
          placeholder="Full name"
          required
        />
        <Input
          label="Email"
          value={attEmail}
          onChange={setAttEmail}
          onBlur={saveAttendee}
          placeholder="Email (optional)"
          type="email"
        />
        <Input
          label="Cell Phone"
          value={attPhone}
          onChange={setAttPhone}
          onBlur={saveAttendee}
          placeholder="Phone (optional)"
          type="tel"
        />
        <Input
          label="Zip Code"
          value={attZipCode}
          onChange={setAttZipCode}
          onBlur={saveAttendee}
          placeholder="Zip code"
          required
        />
        <div
          style={{
            marginTop: 12,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontFamily: "'Outfit', sans-serif",
              fontSize: "14px",
              fontWeight: 500,
              color: "#344054",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={attendee.is_volunteer || false}
              onChange={async (e) => {
                await updateAttendee(attendeeId, { is_volunteer: e.target.checked });
                await loadData();
              }}
              style={{ width: 18, height: 18, cursor: "pointer" }}
            />
            Volunteer
          </label>
          {attendee.is_volunteer && (
            <span
              style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: "11px",
                fontWeight: 700,
                color: "#1e3a6e",
                background: "#e8f0fe",
                padding: "2px 8px",
                borderRadius: "4px",
              }}
            >
              VOL
            </span>
          )}
        </div>
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

            {/* Editable fields (always visible for pending/pending_assignment) */}
            {(wo.status === "pending" || wo.status === "pending_assignment") && (
              <>
                <Input
                  label="Item Name"
                  value={e.item_name || ""}
                  onChange={(v) => updateItem(wo.id, "item_name", v)}
                  onBlur={() => saveWorkOrder(wo.id)}
                  placeholder="Item name"
                  required
                />
                <Select
                  label="Category"
                  value={e.category || ""}
                  onChange={(v) => {
                    updateItem(wo.id, "category", v);
                    // Save immediately on selection — use setTimeout to let state update first
                    setTimeout(() => saveWorkOrder(wo.id), 0);
                  }}
                  options={CATEGORIES}
                  placeholder="Category"
                  required
                />
                <TextArea
                  label="Problem"
                  value={e.description || ""}
                  onChange={(v) => updateItem(wo.id, "description", v)}
                  onBlur={() => saveWorkOrder(wo.id)}
                  placeholder="Describe the problem"
                  required
                  rows={2}
                />
              </>
            )}

            {/* Read-only summary for completed */}
            {wo.status === "completed" && (
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

            {/* Outcome recording for pending_assignment */}
            {wo.status === "pending_assignment" && (
              <div style={{ marginTop: 8 }}>
                <Input
                  label="Fixer Name (optional)"
                  value={e.fixer_name || ""}
                  onChange={(v) => updateItem(wo.id, "fixer_name", v)}
                  onBlur={() => saveWorkOrder(wo.id)}
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
                    gridTemplateColumns: "1fr 1fr 1fr",
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
                      {o === "Not Fixed" && "❌ "}
                      {o}
                    </button>
                  ))}
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
        {hasPending && (
          <>
            <Button variant="coral" onClick={approveAndPrint} disabled={!allCategoriesAssigned}>
              Approve & Print{" "}
              {orders.filter((o) => o.status === "pending").length === 1
                ? "Ticket"
                : "All Tickets"}
            </Button>
            {!allCategoriesAssigned && (
              <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: "13px", color: "#b42318", textAlign: "center", margin: "4px 0 0 0" }}>
                Assign a category to each item before printing
              </p>
            )}
          </>
        )}

        {hasPendingAssignment && !hasPending && (
          <Button variant="outline" onClick={reprintAll}>
            🖨️ Reprint{" "}
            {orders.filter(
              (o) => o.status === "pending_assignment",
            ).length === 1
              ? "Ticket"
              : "Tickets"}
          </Button>
        )}
      </div>
    </div>
  );
}
