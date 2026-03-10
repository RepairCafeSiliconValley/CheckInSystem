import { useState, useCallback, useMemo } from "react";

const CATEGORIES = [
  "Electronics", "Clothing & Textiles", "Appliances", "Furniture",
  "Jewelry", "Bikes", "Toys", "Other",
];
const OUTCOMES = ["Fixed", "Diagnosed", "Out of Scope", "Not Fixable"];
const ADMIN_PASSWORD = "repaircafe2026";

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 3; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return `R-${code}`;
}

const store = {
  events: [
    { id: "demo-event-1", name: "Milpitas Library", date: "2026-03-15", location: "Milpitas, CA" },
    { id: "demo-event-2", name: "Saratoga Community Center", date: "2026-04-12", location: "Saratoga, CA" },
  ],
  attendees: [
    { id: "att-demo-1", name: "Maria Garcia", email: "maria.g@email.com", eventId: "demo-event-1", createdAt: "2026-03-15T09:02:00Z" },
    { id: "att-demo-2", name: "James Chen", email: "jchen88@email.com", eventId: "demo-event-1", createdAt: "2026-03-15T09:05:00Z" },
    { id: "att-demo-3", name: "Priya Patel", email: "priya.p@email.com", eventId: "demo-event-1", createdAt: "2026-03-15T09:08:00Z" },
  ],
  workOrders: [
    { id: "wo-1", code: "R-M4K", attendeeId: "att-demo-1", eventId: "demo-event-1", itemName: "KitchenAid Mixer", category: "Appliances", description: "Motor makes grinding noise, won't turn on consistently", priority: 1, status: "pending", outcome: null, fixerName: "", createdAt: "2026-03-15T09:02:00Z" },
    { id: "wo-2", code: "R-G7P", attendeeId: "att-demo-1", eventId: "demo-event-1", itemName: "Winter jacket", category: "Clothing & Textiles", description: "Zipper is stuck halfway, pull tab broke off", priority: 2, status: "pending", outcome: null, fixerName: "", createdAt: "2026-03-15T09:02:00Z" },
    { id: "wo-3", code: "R-J2N", attendeeId: "att-demo-2", eventId: "demo-event-1", itemName: "Bluetooth speaker", category: "Electronics", description: "Charges but no sound comes out, tried resetting", priority: 1, status: "pending", outcome: null, fixerName: "", createdAt: "2026-03-15T09:05:00Z" },
    { id: "wo-4", code: "R-T9B", attendeeId: "att-demo-3", eventId: "demo-event-1", itemName: "Desk lamp", category: "Electronics", description: "Flickers intermittently, tried different bulbs", priority: 1, status: "pending", outcome: null, fixerName: "", createdAt: "2026-03-15T09:08:00Z" },
    { id: "wo-5", code: "R-W5D", attendeeId: "att-demo-3", eventId: "demo-event-1", itemName: "Wooden chair", category: "Furniture", description: "One leg is wobbly, joint seems loose", priority: 2, status: "pending", outcome: null, fixerName: "", createdAt: "2026-03-15T09:08:00Z" },
  ],
};

function getEventFromURL() { return store.events[0]; }

// ─── Shared Components ───

function Logo({ size = "normal" }) {
  const h = size === "small" ? "28px" : size === "tiny" ? "20px" : "44px";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size === "small" || size === "tiny" ? 8 : 12 }}>
      <div style={{ lineHeight: 1 }}>
        <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: h, letterSpacing: "-1px", lineHeight: 0.9 }}>
          <span style={{ color: "#1e3a6e" }}>REPAIR</span>
        </div>
        <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: h, letterSpacing: "-1px", lineHeight: 0.95 }}>
          <span style={{ color: "#e07850" }}>CAFE</span>
        </div>
        {size === "normal" && (
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "11px", letterSpacing: "3.5px", color: "#1e3a6e", marginTop: 2 }}>SILICON VALLEY</div>
        )}
      </div>
    </div>
  );
}

function Button({ children, onClick, variant = "primary", disabled = false, style = {} }) {
  const base = { padding: "14px 28px", borderRadius: "10px", border: "none", fontFamily: "'Outfit', sans-serif", fontWeight: 600, fontSize: "15px", cursor: disabled ? "not-allowed" : "pointer", transition: "all 0.2s ease", opacity: disabled ? 0.5 : 1, width: "100%", ...style };
  const variants = {
    primary: { background: "#1e3a6e", color: "#fff" },
    secondary: { background: "#f0f2f5", color: "#1e3a6e" },
    coral: { background: "#e07850", color: "#fff" },
    outline: { background: "transparent", color: "#1e3a6e", border: "2px solid #d0d5dd" },
    ghost: { background: "transparent", color: "#667085", padding: "8px 16px" },
    danger: { background: "#fef3f2", color: "#b42318", border: "1.5px solid #fecdca" },
    success: { background: "#e8f5e9", color: "#2e7d32", border: "1.5px solid #c8e6c9" },
  };
  return <button onClick={onClick} disabled={disabled} style={{ ...base, ...variants[variant] }}>{children}</button>;
}

function Input({ label, value, onChange, placeholder, type = "text", required = false }) {
  return (
    <div style={{ marginBottom: 16 }}>
      {label && <label style={{ display: "block", fontFamily: "'Outfit', sans-serif", fontSize: "13px", fontWeight: 600, color: "#344054", marginBottom: 6, letterSpacing: "0.3px" }}>{label}{required && <span style={{ color: "#e07850" }}> *</span>}</label>}
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: "100%", padding: "12px 14px", borderRadius: "10px", border: "1.5px solid #d0d5dd", fontFamily: "'Outfit', sans-serif", fontSize: "15px", color: "#1d2939", background: "#fff", boxSizing: "border-box", outline: "none", transition: "border-color 0.2s" }}
        onFocus={(e) => (e.target.style.borderColor = "#1e3a6e")} onBlur={(e) => (e.target.style.borderColor = "#d0d5dd")} />
    </div>
  );
}

function TextArea({ label, value, onChange, placeholder, required = false, rows = 3 }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontFamily: "'Outfit', sans-serif", fontSize: "13px", fontWeight: 600, color: "#344054", marginBottom: 6, letterSpacing: "0.3px" }}>{label}{required && <span style={{ color: "#e07850" }}> *</span>}</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows}
        style={{ width: "100%", padding: "12px 14px", borderRadius: "10px", border: "1.5px solid #d0d5dd", fontFamily: "'Outfit', sans-serif", fontSize: "15px", color: "#1d2939", background: "#fff", boxSizing: "border-box", outline: "none", resize: "vertical", transition: "border-color 0.2s" }}
        onFocus={(e) => (e.target.style.borderColor = "#1e3a6e")} onBlur={(e) => (e.target.style.borderColor = "#d0d5dd")} />
    </div>
  );
}

function Select({ label, value, onChange, options, placeholder, required = false }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontFamily: "'Outfit', sans-serif", fontSize: "13px", fontWeight: 600, color: "#344054", marginBottom: 6, letterSpacing: "0.3px" }}>{label}{required && <span style={{ color: "#e07850" }}> *</span>}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", padding: "12px 14px", borderRadius: "10px", border: "1.5px solid #d0d5dd", fontFamily: "'Outfit', sans-serif", fontSize: "15px", color: value ? "#1d2939" : "#98a2b3", background: "#fff", boxSizing: "border-box", outline: "none", appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%23667085' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 14px center" }}>
        <option value="" disabled>{placeholder}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function Card({ children, style = {}, onClick }) {
  return (
    <div onClick={onClick} style={{ background: "#fff", borderRadius: "14px", border: "1px solid #e8ebf0", padding: "20px", cursor: onClick ? "pointer" : "default", transition: onClick ? "box-shadow 0.15s ease" : "none", ...style }}
      onMouseEnter={(e) => { if (onClick) e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)"; }}
      onMouseLeave={(e) => { if (onClick) e.currentTarget.style.boxShadow = "none"; }}>
      {children}
    </div>
  );
}

function Badge({ text, color = "#1e3a6e" }) {
  return <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: "6px", background: color + "15", color: color, fontFamily: "'Space Mono', monospace", fontSize: "12px", fontWeight: 700, letterSpacing: "0.5px" }}>{text}</span>;
}

function StatusBadge({ status }) {
  const map = {
    pending: { label: "Pending Review", color: "#b54708", bg: "#fef6ee" },
    reviewed: { label: "Ready for Board", color: "#1e3a6e", bg: "#eef2f8" },
    "in-progress": { label: "With Fixer", color: "#6941c6", bg: "#f4f3ff" },
    completed: { label: "Completed", color: "#2e7d32", bg: "#e8f5e9" },
  };
  const s = map[status] || map.pending;
  return <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: "6px", background: s.bg, color: s.color, fontFamily: "'Outfit', sans-serif", fontSize: "11px", fontWeight: 700, letterSpacing: "0.3px" }}>{s.label}</span>;
}

// Helper: get the "worst" status for a group of orders (for grouping display)
function groupStatus(orders) {
  if (orders.some((o) => o.status === "pending")) return "pending";
  if (orders.some((o) => o.status === "in-progress")) return "in-progress";
  if (orders.some((o) => o.status === "reviewed")) return "reviewed";
  return "completed";
}

// ─── Password Gate ───

function PasswordGate({ onUnlock }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const attempt = () => {
    if (pw === ADMIN_PASSWORD) { onUnlock(); }
    else { setError(true); setShake(true); setTimeout(() => setShake(false), 500); }
  };
  return (
    <div style={{ minHeight: "100vh", background: "#f5f6f8", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ maxWidth: 380, width: "100%", textAlign: "center" }}>
        <div style={{ display: "inline-block", marginBottom: 32 }}><Logo /></div>
        <Card style={{ textAlign: "left" }}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#f0f4f8", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", fontSize: "22px" }}>🔒</div>
            <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "20px", fontWeight: 700, color: "#1d2939", margin: "0 0 4px 0" }}>Staff Access</h2>
            <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: "13px", color: "#667085", margin: 0 }}>Enter the shared password to continue.</p>
          </div>
          <div style={{ animation: shake ? "shake 0.4s ease" : "none" }}>
            <Input label="Password" value={pw} onChange={(v) => { setPw(v); setError(false); }} placeholder="Enter password" type="password" required />
          </div>
          {error && <div style={{ padding: "8px 12px", background: "#fef3f2", borderRadius: "8px", marginBottom: 14 }}><span style={{ fontFamily: "'Outfit', sans-serif", fontSize: "13px", color: "#b42318" }}>Incorrect password.</span></div>}
          <Button onClick={attempt} disabled={!pw.trim()}>Unlock</Button>
          <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: "11px", color: "#98a2b3", marginTop: 14, textAlign: "center", lineHeight: 1.4 }}>
            For demo: <span style={{ fontFamily: "'Space Mono', monospace", background: "#f0f2f5", padding: "1px 6px", borderRadius: "4px", fontSize: "11px" }}>repaircafe2026</span>
          </p>
        </Card>
      </div>
      <style>{`@keyframes shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-8px); } 40% { transform: translateX(8px); } 60% { transform: translateX(-5px); } 80% { transform: translateX(5px); } }`}</style>
    </div>
  );
}

// ─── Item Form (visitor check-in) ───

function ItemForm({ index, item, onChange, onRemove, canRemove }) {
  const update = (field, value) => onChange({ ...item, [field]: value });
  return (
    <Card style={{ marginBottom: 16, border: "1.5px solid #e8ebf0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: index === 0 ? "#1e3a6e" : "#e07850", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Space Mono', monospace", fontSize: "13px", fontWeight: 700 }}>{index + 1}</div>
          <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: "14px", fontWeight: 600, color: "#344054" }}>{index === 0 ? "Primary Item" : "Second Item"}</span>
        </div>
        {canRemove && <button onClick={onRemove} style={{ background: "none", border: "none", color: "#98a2b3", cursor: "pointer", fontSize: "18px", padding: "4px 8px" }}>✕</button>}
      </div>
      <Input label="Item Name" value={item.name} onChange={(v) => update("name", v)} placeholder="e.g. Coffee machine, winter jacket" required />
      <Select label="Category" value={item.category} onChange={(v) => update("category", v)} options={CATEGORIES} placeholder="Select a category" required />
      <TextArea label="What's wrong with it?" value={item.description} onChange={(v) => update("description", v)} placeholder="Describe the problem..." required />
    </Card>
  );
}

// ─── Visitor Check-In ───

function CheckInScreen({ onComplete }) {
  const event = getEventFromURL();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [items, setItems] = useState([{ name: "", category: "", description: "" }]);
  const [submitting, setSubmitting] = useState(false);
  const canSubmit = name.trim() && email.trim() && email.includes("@") && items.every((it) => it.name.trim() && it.category && it.description.trim());
  const addItem = () => { if (items.length < 2) setItems([...items, { name: "", category: "", description: "" }]); };
  const updateItem = (idx, u) => { const n = [...items]; n[idx] = u; setItems(n); };
  const removeItem = (idx) => setItems(items.filter((_, i) => i !== idx));

  const handleSubmit = () => {
    setSubmitting(true);
    const attendeeId = `att-${Date.now()}`;
    store.attendees.push({ id: attendeeId, name: name.trim(), email: email.trim(), eventId: event.id, createdAt: new Date().toISOString() });
    const codes = items.map((item, idx) => {
      const code = generateCode();
      store.workOrders.push({ id: `wo-${Date.now()}-${idx}`, code, attendeeId, eventId: event.id, itemName: item.name.trim(), category: item.category, description: item.description.trim(), priority: idx + 1, status: "pending", outcome: null, fixerName: "", createdAt: new Date().toISOString() });
      return { code, itemName: item.name.trim(), priority: idx + 1 };
    });
    setTimeout(() => { setSubmitting(false); onComplete({ name: name.trim(), codes }); }, 600);
  };

  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ display: "inline-block" }}><Logo /></div>
        <div style={{ marginTop: 16, padding: "8px 16px", background: "#f0f4f8", borderRadius: "8px", display: "inline-block" }}>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "12px", color: "#475467" }}>{event.name} · {event.date}</span>
        </div>
      </div>
      <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "22px", fontWeight: 700, color: "#1d2939", margin: "0 0 4px 0" }}>Check In</h2>
      <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: "14px", color: "#667085", margin: "0 0 24px 0", lineHeight: 1.5 }}>Enter your info below, then bring your item to the check-in desk.</p>
      <Input label="Full Name" value={name} onChange={setName} placeholder="Your name" required />
      <Input label="Email Address" value={email} onChange={setEmail} placeholder="you@example.com" type="email" required />
      <div style={{ height: 1, background: "#e8ebf0", margin: "24px 0" }} />
      <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "17px", fontWeight: 700, color: "#1d2939", margin: "0 0 4px 0" }}>Items for Repair</h3>
      <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: "13px", color: "#667085", margin: "0 0 16px 0" }}>You may bring up to 2 items. Item #1 is your top priority.</p>
      {items.map((item, idx) => <ItemForm key={idx} index={idx} item={item} onChange={(u) => updateItem(idx, u)} onRemove={() => removeItem(idx)} canRemove={items.length > 1} />)}
      {items.length < 2 && <div style={{ marginBottom: 24 }}><Button variant="outline" onClick={addItem}>+ Add Second Item</Button></div>}
      <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>{submitting ? "Submitting..." : "Check In"}</Button>
    </div>
  );
}

function ConfirmationScreen({ data, onReset }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ display: "inline-block", marginBottom: 24 }}><Logo size="small" /></div>
      <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#e8f5e9", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: "28px" }}>✓</div>
      <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "22px", fontWeight: 700, color: "#1d2939", margin: "0 0 6px 0" }}>You're checked in!</h2>
      <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: "14px", color: "#667085", margin: "0 0 28px 0", lineHeight: 1.5 }}>
        Thanks {data.name}! Please head to the check-in desk so a coordinator can review your item{data.codes.length > 1 ? "s" : ""} and print your ticket{data.codes.length > 1 ? "s" : ""}.
      </p>
      {data.codes.map((c) => (
        <Card key={c.code} style={{ marginBottom: 12, textAlign: "center", background: "#f8f9fb" }}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "36px", fontWeight: 700, color: "#1e3a6e", letterSpacing: "3px", marginBottom: 6 }}>{c.code}</div>
          <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: "14px", color: "#667085" }}>
            {c.itemName}<span style={{ margin: "0 6px", color: "#d0d5dd" }}>·</span>
            <span style={{ color: c.priority === 1 ? "#1e3a6e" : "#e07850" }}>Priority {c.priority}</span>
          </div>
        </Card>
      ))}
      <div style={{ marginTop: 24 }}><Button variant="secondary" onClick={onReset}>Check in another person</Button></div>
    </div>
  );
}

// ─── Print Tickets (prints ALL tickets for a visitor on one page) ───

function PrintTickets({ workOrders, attendeeName, eventName, onClose }) {
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
            <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: "16px", fontWeight: 600, color: "#1d2939" }}>{wo.itemName}</div>
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

// ─── Coordinator Queue (grouped by visitor) ───

function CoordinatorQueue({ onSelectVisitor, event, selectedEventId, onEventChange }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  // Group work orders by attendee
  const visitorGroups = useMemo(() => {
    const orders = store.workOrders.filter((w) => w.eventId === event.id);
    const grouped = {};
    orders.forEach((wo) => {
      if (!grouped[wo.attendeeId]) {
        const att = store.attendees.find((a) => a.id === wo.attendeeId);
        grouped[wo.attendeeId] = { attendee: att, orders: [] };
      }
      grouped[wo.attendeeId].orders.push(wo);
    });
    return Object.values(grouped)
      .map((g) => ({
        ...g,
        orders: g.orders.sort((a, b) => a.priority - b.priority),
        groupStatus: groupStatus(g.orders),
        latestCreatedAt: Math.max(...g.orders.map((o) => new Date(o.createdAt).getTime())),
      }))
      .sort((a, b) => b.latestCreatedAt - a.latestCreatedAt);
  }, [event.id, store.workOrders.length, store.attendees.length]);

  const filtered = visitorGroups.filter((g) => {
    const matchesFilter = filter === "all" || g.groupStatus === filter;
    const q = search.toLowerCase();
    if (!q) return matchesFilter;
    const matchesSearch =
      g.attendee?.name?.toLowerCase().includes(q) ||
      g.attendee?.email?.toLowerCase().includes(q) ||
      g.orders.some((o) => o.code.toLowerCase().includes(q) || o.itemName.toLowerCase().includes(q));
    return matchesFilter && matchesSearch;
  });

  const allOrders = store.workOrders.filter((w) => w.eventId === event.id);
  const counts = {
    all: visitorGroups.length,
    pending: visitorGroups.filter((g) => g.groupStatus === "pending").length,
    reviewed: visitorGroups.filter((g) => g.groupStatus === "reviewed").length,
    "in-progress": visitorGroups.filter((g) => g.groupStatus === "in-progress").length,
    completed: visitorGroups.filter((g) => g.groupStatus === "completed").length,
  };

  const filterButtons = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "reviewed", label: "Ready" },
    { key: "in-progress", label: "Active" },
    { key: "completed", label: "Done" },
  ];

  return (
    <div>
      {/* Event selector */}
      <div style={{ marginBottom: 12 }}>
        <select value={selectedEventId} onChange={(e) => onEventChange(e.target.value)}
          style={{ width: "100%", padding: "10px 32px 10px 12px", borderRadius: "10px", border: "1.5px solid #d0d5dd", fontFamily: "'Outfit', sans-serif", fontSize: "14px", fontWeight: 600, color: "#1e3a6e", background: "#fff", outline: "none", appearance: "none", boxSizing: "border-box", backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%23667085' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", cursor: "pointer" }}>
          {store.events.map((ev) => (
            <option key={ev.id} value={ev.id}>{ev.name} — {ev.date}{ev.location ? ` (${ev.location})` : ""}</option>
          ))}
        </select>
      </div>

      <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "22px", fontWeight: 700, color: "#1d2939", margin: "0 0 4px 0" }}>Queue</h2>
      <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: "13px", color: "#667085", margin: "0 0 16px 0" }}>
        {event.name} · {visitorGroups.length} visitors · {allOrders.length} items · {counts.pending} awaiting review
      </p>

      <div style={{ marginBottom: 12 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, email, code, or item..."
          style={{ width: "100%", padding: "11px 14px", borderRadius: "10px", border: "1.5px solid #d0d5dd", fontFamily: "'Outfit', sans-serif", fontSize: "14px", color: "#1d2939", background: "#fff", boxSizing: "border-box", outline: "none" }}
          onFocus={(e) => (e.target.style.borderColor = "#1e3a6e")} onBlur={(e) => (e.target.style.borderColor = "#d0d5dd")} />
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto" }}>
        {filterButtons.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            style={{ padding: "6px 12px", borderRadius: "8px", border: "none", fontFamily: "'Outfit', sans-serif", fontSize: "12px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s", background: filter === f.key ? "#1e3a6e" : "#f0f2f5", color: filter === f.key ? "#fff" : "#667085" }}>
            {f.label} ({counts[f.key]})
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "32px 16px" }}>
          <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: "14px", color: "#98a2b3" }}>{search ? "No results found." : "No visitors in this category."}</p>
        </div>
      )}

      {filtered.map((g) => (
        <Card key={g.attendee?.id} onClick={() => onSelectVisitor(g.attendee?.id)} style={{ marginBottom: 10, padding: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div>
              <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: "16px", fontWeight: 700, color: "#1d2939" }}>{g.attendee?.name}</div>
              <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: "12px", color: "#98a2b3", marginTop: 1 }}>{g.attendee?.email}</div>
            </div>
            <StatusBadge status={g.groupStatus} />
          </div>
          {g.orders.map((o) => (
            <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "#f8f9fb", borderRadius: "8px", marginTop: 6 }}>
              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "13px", fontWeight: 700, color: "#1e3a6e" }}>{o.code}</span>
              <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: "13px", color: "#344054", flex: 1 }}>{o.itemName}</span>
              <Badge text={`P${o.priority}`} color={o.priority === 1 ? "#1e3a6e" : "#e07850"} />
              {o.outcome && <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: "11px", color: "#2e7d32", fontWeight: 600 }}>{o.outcome}</span>}
            </div>
          ))}
        </Card>
      ))}
    </div>
  );
}

// ─── Coordinator Visitor Detail (review all items for one visitor) ───

function CoordinatorVisitorDetail({ attendeeId, onBack, onPrint }) {
  const att = store.attendees.find((a) => a.id === attendeeId);
  const orders = store.workOrders.filter((w) => w.attendeeId === attendeeId).sort((a, b) => a.priority - b.priority);
  const [, forceRender] = useState(0);

  // Editable visitor fields
  const [attName, setAttName] = useState(att?.name || "");
  const [attEmail, setAttEmail] = useState(att?.email || "");

  // Editable item fields — keyed by work order id
  const [itemEdits, setItemEdits] = useState(() => {
    const edits = {};
    orders.forEach((wo) => {
      edits[wo.id] = { itemName: wo.itemName, category: wo.category, description: wo.description, fixerName: wo.fixerName || "" };
    });
    return edits;
  });

  const [saved, setSaved] = useState(false);

  if (!att) return <div><Button variant="ghost" onClick={onBack}>← Back</Button><p>Visitor not found.</p></div>;

  const updateItem = (woId, field, value) => {
    setItemEdits((prev) => ({ ...prev, [woId]: { ...prev[woId], [field]: value } }));
  };

  const saveAll = () => {
    const attIdx = store.attendees.findIndex((a) => a.id === attendeeId);
    if (attIdx >= 0) store.attendees[attIdx] = { ...store.attendees[attIdx], name: attName.trim(), email: attEmail.trim() };
    orders.forEach((wo) => {
      const e = itemEdits[wo.id];
      if (e) {
        const idx = store.workOrders.findIndex((w) => w.id === wo.id);
        if (idx >= 0) store.workOrders[idx] = { ...store.workOrders[idx], itemName: e.itemName.trim(), category: e.category, description: e.description.trim(), fixerName: e.fixerName.trim() };
      }
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    forceRender((n) => n + 1);
  };

  const hasPending = orders.some((o) => o.status === "pending");
  const hasReviewed = orders.some((o) => o.status === "reviewed");

  const approveAndPrint = () => {
    saveAll();
    orders.forEach((wo) => {
      if (wo.status === "pending") {
        const idx = store.workOrders.findIndex((w) => w.id === wo.id);
        if (idx >= 0) store.workOrders[idx].status = "reviewed";
      }
    });
    forceRender((n) => n + 1);
    onPrint(attendeeId);
  };

  const reprintAll = () => {
    onPrint(attendeeId);
  };

  const setOrderStatus = (woId, status) => {
    const idx = store.workOrders.findIndex((w) => w.id === woId);
    if (idx >= 0) { store.workOrders[idx].status = status; forceRender((n) => n + 1); }
  };

  const setOrderOutcome = (woId, outcome) => {
    const idx = store.workOrders.findIndex((w) => w.id === woId);
    if (idx >= 0) {
      const e = itemEdits[woId];
      if (e?.fixerName?.trim()) store.workOrders[idx].fixerName = e.fixerName.trim();
      store.workOrders[idx].outcome = outcome;
      store.workOrders[idx].status = "completed";
      forceRender((n) => n + 1);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <Button variant="ghost" onClick={onBack} style={{ width: "auto" }}>← Queue</Button>
      </div>

      {/* Visitor info */}
      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "14px", fontWeight: 700, color: "#98a2b3", textTransform: "uppercase", letterSpacing: "1px", margin: "0 0 12px 0" }}>Visitor</h3>
        <Input label="Name" value={attName} onChange={setAttName} placeholder="Full name" required />
        <Input label="Email" value={attEmail} onChange={setAttEmail} placeholder="Email" type="email" required />
      </Card>

      {/* Each item */}
      {orders.map((wo) => {
        const e = itemEdits[wo.id] || {};
        const currentWo = store.workOrders.find((w) => w.id === wo.id);
        return (
          <Card key={wo.id} style={{ marginBottom: 16, borderLeft: `4px solid ${wo.priority === 1 ? "#1e3a6e" : "#e07850"}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "16px", fontWeight: 700, color: "#1e3a6e", letterSpacing: "1px" }}>{wo.code}</span>
                <Badge text={`Priority ${wo.priority}`} color={wo.priority === 1 ? "#1e3a6e" : "#e07850"} />
              </div>
              <StatusBadge status={currentWo.status} />
            </div>

            {/* Editable fields (always visible for pending/reviewed) */}
            {(currentWo.status === "pending" || currentWo.status === "reviewed") && (
              <>
                <Input label="Item Name" value={e.itemName || ""} onChange={(v) => updateItem(wo.id, "itemName", v)} placeholder="Item name" required />
                <Select label="Category" value={e.category || ""} onChange={(v) => updateItem(wo.id, "category", v)} options={CATEGORIES} placeholder="Category" required />
                <TextArea label="Problem" value={e.description || ""} onChange={(v) => updateItem(wo.id, "description", v)} placeholder="Describe the problem" required rows={2} />
              </>
            )}

            {/* Read-only summary for in-progress/completed */}
            {(currentWo.status === "in-progress" || currentWo.status === "completed") && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: "16px", fontWeight: 600, color: "#1d2939", marginBottom: 4 }}>{currentWo.itemName}</div>
                <Badge text={currentWo.category} />
                <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: "13px", color: "#667085", margin: "8px 0 0 0", lineHeight: 1.5 }}>{currentWo.description}</p>
              </div>
            )}

            {/* Status-specific actions */}
            {currentWo.status === "reviewed" && (
              <div style={{ marginTop: 8 }}>
                <Button variant="primary" onClick={() => setOrderStatus(wo.id, "in-progress")} style={{ padding: "10px 20px", fontSize: "13px" }}>
                  Mark as With Fixer
                </Button>
              </div>
            )}

            {currentWo.status === "in-progress" && (
              <div style={{ marginTop: 8 }}>
                <Input label="Fixer Name (optional)" value={e.fixerName || ""} onChange={(v) => updateItem(wo.id, "fixerName", v)} placeholder="Who worked on this?" />
                <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: "13px", fontWeight: 600, color: "#344054", margin: "0 0 8px 0" }}>Record Outcome:</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {OUTCOMES.map((o) => (
                    <button key={o} onClick={() => setOrderOutcome(wo.id, o)}
                      style={{ padding: "10px 12px", borderRadius: "8px", border: currentWo.outcome === o ? "2px solid #1e3a6e" : "1.5px solid #d0d5dd", background: currentWo.outcome === o ? "#eef2f8" : "#fff", fontFamily: "'Outfit', sans-serif", fontSize: "13px", fontWeight: currentWo.outcome === o ? 700 : 500, color: currentWo.outcome === o ? "#1e3a6e" : "#475467", cursor: "pointer", transition: "all 0.15s" }}>
                      {o === "Fixed" && "✅ "}{o === "Diagnosed" && "🔍 "}{o === "Out of Scope" && "↩️ "}{o === "Not Fixable" && "❌ "}{o}
                    </button>
                  ))}
                </div>
                <div style={{ marginTop: 10, borderTop: "1px solid #e8ebf0", paddingTop: 10 }}>
                  <Button variant="ghost" onClick={() => setOrderStatus(wo.id, "reviewed")} style={{ fontSize: "13px", padding: "8px 12px" }}>
                    ← Back to Ready (undo With Fixer)
                  </Button>
                </div>
              </div>
            )}

            {currentWo.status === "completed" && (
              <div style={{ marginTop: 8 }}>
                <div style={{ padding: "10px", background: "#e8f5e9", borderRadius: "8px", textAlign: "center", marginBottom: 8 }}>
                  <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: "14px", fontWeight: 600, color: "#2e7d32" }}>{currentWo.outcome}</span>
                  {currentWo.fixerName && <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: "12px", color: "#667085", marginLeft: 8 }}>by {currentWo.fixerName}</span>}
                </div>
                <Button variant="ghost" onClick={() => { setOrderStatus(wo.id, "in-progress"); const idx = store.workOrders.findIndex((w) => w.id === wo.id); if (idx >= 0) store.workOrders[idx].outcome = null; forceRender((n) => n + 1); }} style={{ fontSize: "13px", padding: "8px 12px" }}>
                  ✏️ Edit Outcome
                </Button>
              </div>
            )}
          </Card>
        );
      })}

      {/* Action bar */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        <Button onClick={saveAll}>Save Changes</Button>
        {saved && <div style={{ textAlign: "center" }}><span style={{ fontFamily: "'Outfit', sans-serif", fontSize: "13px", color: "#2e7d32", fontWeight: 600 }}>Changes saved!</span></div>}

        {hasPending && (
          <Button variant="coral" onClick={approveAndPrint}>
            ✅ Approve & Print {orders.filter((o) => o.status === "pending").length === 1 ? "Ticket" : "All Tickets"}
          </Button>
        )}

        {hasReviewed && !hasPending && (
          <Button variant="outline" onClick={reprintAll}>
            🖨️ Reprint {orders.filter((o) => o.status === "reviewed" || o.status === "in-progress").length === 1 ? "Ticket" : "Tickets"}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Admin Screen ───

function AdminScreen() {
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [, forceRender] = useState(0);
  const createEvent = () => {
    if (eventName.trim() && eventDate) {
      store.events.push({ id: `evt-${Date.now()}`, name: eventName.trim(), date: eventDate, location: eventLocation.trim() });
      setEventName(""); setEventDate(""); setEventLocation(""); forceRender((n) => n + 1);
    }
  };
  return (
    <div>
      <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "22px", fontWeight: 700, color: "#1d2939", margin: "0 0 20px 0" }}>Event Admin</h2>
      <Card style={{ marginBottom: 24 }}>
        <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "15px", fontWeight: 700, color: "#1d2939", margin: "0 0 14px 0" }}>Create New Event</h3>
        <Input label="Event Name" value={eventName} onChange={setEventName} placeholder="e.g. Milpitas Library" required />
        <Input label="Date" value={eventDate} onChange={setEventDate} placeholder="YYYY-MM-DD" type="date" required />
        <Input label="Location" value={eventLocation} onChange={setEventLocation} placeholder="e.g. Milpitas, CA" />
        <Button onClick={createEvent} disabled={!eventName.trim() || !eventDate}>Create Event</Button>
      </Card>
      <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "15px", fontWeight: 700, color: "#1d2939", margin: "0 0 12px 0" }}>Events</h3>
      {store.events.map((ev) => {
        const orders = store.workOrders.filter((w) => w.eventId === ev.id);
        const attendees = store.attendees.filter((a) => a.eventId === ev.id);
        const fixed = orders.filter((w) => w.outcome === "Fixed").length;
        return (
          <Card key={ev.id} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: "15px", fontWeight: 700, color: "#1d2939" }}>{ev.name}</span>
              <Badge text={ev.date} />
            </div>
            {ev.location && <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: "13px", color: "#667085", marginBottom: 8 }}>{ev.location}</div>}
            <div style={{ display: "flex", gap: 16, fontFamily: "'Space Mono', monospace", fontSize: "12px", color: "#475467" }}>
              <span>{attendees.length} visitors</span>
              <span>{orders.length} items</span>
              <span style={{ color: "#2e7d32" }}>{fixed} fixed</span>
            </div>
            <div style={{ marginTop: 10, padding: "8px 12px", background: "#f0f4f8", borderRadius: "8px", fontFamily: "'Space Mono', monospace", fontSize: "11px", color: "#475467", wordBreak: "break-all" }}>
              QR link: repaircafe.app/checkin?event={ev.id}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Main App ───

export default function App() {
  const [route, setRoute] = useState("checkin");
  const [staffTab, setStaffTab] = useState("queue");
  const [authed, setAuthed] = useState(false);
  const [confirmData, setConfirmData] = useState(null);
  const [selectedVisitorId, setSelectedVisitorId] = useState(null);
  const [printingVisitorId, setPrintingVisitorId] = useState(null);
  const [selectedEventId, setSelectedEventId] = useState(store.events[0]?.id || "");
  const [, forceRender] = useState(0);

  const selectedEvent = store.events.find((e) => e.id === selectedEventId) || store.events[0];

  const switchRoute = useCallback((r) => {
    setRoute(r); setConfirmData(null); setSelectedVisitorId(null); setPrintingVisitorId(null); forceRender((n) => n + 1);
  }, []);

  // Visitor route
  if (route === "checkin") {
    return (
      <>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
        <div style={{ minHeight: "100vh", background: "#f5f6f8", fontFamily: "'Outfit', sans-serif" }}>
          <div style={{ maxWidth: 440, margin: "0 auto", padding: "20px 16px 80px" }}>
            {confirmData ? <ConfirmationScreen data={confirmData} onReset={() => setConfirmData(null)} /> : <CheckInScreen onComplete={(data) => setConfirmData(data)} />}
          </div>
          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "12px", textAlign: "center", background: "#f5f6f8" }}>
            <button onClick={() => switchRoute("staff")} style={{ background: "none", border: "none", fontFamily: "'Outfit', sans-serif", fontSize: "11px", color: "#c0c5ce", cursor: "pointer", padding: "4px 8px" }}>Staff Portal →</button>
          </div>
        </div>
      </>
    );
  }

  // Staff — password gate
  if (route === "staff" && !authed) {
    return (
      <>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
        <PasswordGate onUnlock={() => setAuthed(true)} />
        <div style={{ position: "fixed", bottom: 20, left: 0, right: 0, textAlign: "center" }}>
          <button onClick={() => switchRoute("checkin")} style={{ background: "none", border: "none", fontFamily: "'Outfit', sans-serif", fontSize: "12px", color: "#98a2b3", cursor: "pointer" }}>← Back to Check-In</button>
        </div>
      </>
    );
  }

  // Staff — print view
  if (printingVisitorId) {
    const att = store.attendees.find((a) => a.id === printingVisitorId);
    const orders = store.workOrders.filter((w) => w.attendeeId === printingVisitorId && (w.status === "reviewed" || w.status === "in-progress" || w.status === "pending")).sort((a, b) => a.priority - b.priority);
    const event = store.events.find((e) => e.id === att?.eventId);
    return (
      <>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
        <div style={{ minHeight: "100vh", background: "#f5f6f8", fontFamily: "'Outfit', sans-serif" }}>
          <div style={{ maxWidth: 500, margin: "0 auto", padding: "20px 16px" }}>
            <PrintTickets workOrders={orders} attendeeName={att?.name || "Unknown"} eventName={event?.name || ""} onClose={() => setPrintingVisitorId(null)} />
          </div>
        </div>
      </>
    );
  }

  // Staff — authenticated
  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
      <div style={{ minHeight: "100vh", background: "#f5f6f8", fontFamily: "'Outfit', sans-serif" }}>
        <div style={{ background: "#fff", borderBottom: "1px solid #e8ebf0", padding: "10px 16px" }}>
          <div style={{ maxWidth: 540, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Logo size="tiny" />
            <button onClick={() => { setAuthed(false); switchRoute("checkin"); }} style={{ background: "none", border: "none", fontFamily: "'Outfit', sans-serif", fontSize: "12px", color: "#98a2b3", cursor: "pointer" }}>🔒 Lock</button>
          </div>
        </div>

        <div style={{ maxWidth: 540, margin: "0 auto", padding: "16px 16px 100px" }}>
          {staffTab === "queue" && !selectedVisitorId && (
            <CoordinatorQueue event={selectedEvent} selectedEventId={selectedEventId} onEventChange={(id) => { setSelectedEventId(id); setSelectedVisitorId(null); forceRender((n) => n + 1); }} onSelectVisitor={(id) => setSelectedVisitorId(id)} />
          )}
          {staffTab === "queue" && selectedVisitorId && (
            <CoordinatorVisitorDetail attendeeId={selectedVisitorId} onBack={() => { setSelectedVisitorId(null); forceRender((n) => n + 1); }} onPrint={(attId) => setPrintingVisitorId(attId)} />
          )}
          {staffTab === "admin" && <AdminScreen />}
        </div>

        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid #e8ebf0", display: "flex", justifyContent: "center", padding: "8px 0 env(safe-area-inset-bottom, 12px)", zIndex: 100 }}>
          <div style={{ display: "flex", maxWidth: 540, width: "100%", justifyContent: "space-around" }}>
            {[{ key: "queue", label: "Queue", icon: "📋" }, { key: "admin", label: "Admin", icon: "⚙️" }].map((t) => (
              <button key={t.key} onClick={() => { setStaffTab(t.key); setSelectedVisitorId(null); forceRender((n) => n + 1); }}
                style={{ background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "6px 16px", cursor: "pointer", opacity: staffTab === t.key ? 1 : 0.45, transition: "opacity 0.15s" }}>
                <span style={{ fontSize: "20px" }}>{t.icon}</span>
                <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: "11px", fontWeight: staffTab === t.key ? 700 : 500, color: staffTab === t.key ? "#1e3a6e" : "#667085", letterSpacing: "0.3px" }}>{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
