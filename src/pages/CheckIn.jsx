import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import Logo from "../components/Logo";
import Card from "../components/Card";
import Button from "../components/Button";
import Input from "../components/Input";
import ItemForm from "../components/ItemForm";
import { fetchEventById, checkinVisitor } from "../lib/store";

function ConfirmationScreen({ data, onReset }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ display: "inline-block", marginBottom: 24 }}>
        <Logo size="small" />
      </div>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: "#e8f5e9",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 16px",
          fontSize: "28px",
        }}
      >
        ✓
      </div>
      <h2
        style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: "22px",
          fontWeight: 700,
          color: "#1d2939",
          margin: "0 0 6px 0",
        }}
      >
        You're checked in!
      </h2>
      <p
        style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: "14px",
          color: "#667085",
          margin: "0 0 28px 0",
          lineHeight: 1.5,
        }}
      >
        Thanks {data.name}! Please head to the check-in desk so a coordinator
        can review your item{data.codes.length > 1 ? "s" : ""} and print your
        ticket{data.codes.length > 1 ? "s" : ""}.
      </p>
      {data.codes.map((c) => (
        <Card
          key={c.code}
          style={{
            marginBottom: 12,
            textAlign: "center",
            background: "#f8f9fb",
          }}
        >
          <div
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: "36px",
              fontWeight: 700,
              color: "#1e3a6e",
              letterSpacing: "3px",
              marginBottom: 6,
            }}
          >
            {c.code}
          </div>
          <div
            style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: "14px",
              color: "#667085",
            }}
          >
            {c.itemName}
            <span style={{ margin: "0 6px", color: "#d0d5dd" }}>·</span>
            <span style={{ color: c.priority === 1 ? "#1e3a6e" : "#e07850" }}>
              Priority {c.priority}
            </span>
          </div>
        </Card>
      ))}
      <div style={{ marginTop: 24 }}>
        <Button variant="secondary" onClick={onReset}>
          Check in another person
        </Button>
      </div>
    </div>
  );
}

function CheckInForm({ event, onComplete }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [items, setItems] = useState([
    { name: "", category: "", description: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const canSubmit =
    name.trim() &&
    email.trim() &&
    email.includes("@") &&
    items.every((it) => it.name.trim() && it.category && it.description.trim());
  const addItem = () => {
    if (items.length < 2)
      setItems([...items, { name: "", category: "", description: "" }]);
  };
  const updateItem = (idx, u) => {
    const n = [...items];
    n[idx] = u;
    setItems(n);
  };
  const removeItem = (idx) => setItems(items.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const codes = await checkinVisitor(event.id, name, email, items);
      onComplete({ name: name.trim(), codes });
    } catch (err) {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ display: "inline-block" }}>
          <Logo />
        </div>
        <div
          style={{
            marginTop: 16,
            padding: "8px 16px",
            background: "#f0f4f8",
            borderRadius: "8px",
            display: "inline-block",
          }}
        >
          <span
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: "12px",
              color: "#475467",
            }}
          >
            {event.name} · {event.date}
          </span>
        </div>
      </div>
      <h2
        style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: "22px",
          fontWeight: 700,
          color: "#1d2939",
          margin: "0 0 4px 0",
        }}
      >
        Check In
      </h2>
      <p
        style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: "14px",
          color: "#667085",
          margin: "0 0 24px 0",
          lineHeight: 1.5,
        }}
      >
        Enter your info below, then bring your item to the check-in desk.
      </p>
      <Input
        label="Full Name"
        value={name}
        onChange={setName}
        placeholder="Your name"
        required
      />
      <Input
        label="Email Address"
        value={email}
        onChange={setEmail}
        placeholder="you@example.com"
        type="email"
        required
      />
      <div style={{ height: 1, background: "#e8ebf0", margin: "24px 0" }} />
      <h3
        style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: "17px",
          fontWeight: 700,
          color: "#1d2939",
          margin: "0 0 4px 0",
        }}
      >
        Items for Repair
      </h3>
      <p
        style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: "13px",
          color: "#667085",
          margin: "0 0 16px 0",
        }}
      >
        You may bring up to 2 items. Item #1 is your top priority.
      </p>
      {items.map((item, idx) => (
        <ItemForm
          key={idx}
          index={idx}
          item={item}
          onChange={(u) => updateItem(idx, u)}
          onRemove={() => removeItem(idx)}
          canRemove={items.length > 1}
        />
      ))}
      {items.length < 2 && (
        <div style={{ marginBottom: 24 }}>
          <Button variant="outline" onClick={addItem}>
            + Add Second Item
          </Button>
        </div>
      )}
      {error && (
        <div
          style={{
            padding: "8px 12px",
            background: "#fef3f2",
            borderRadius: "8px",
            marginBottom: 14,
          }}
        >
          <span
            style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: "13px",
              color: "#b42318",
            }}
          >
            {error}
          </span>
        </div>
      )}
      <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
        {submitting ? "Submitting..." : "Check In"}
      </Button>
    </div>
  );
}

export default function CheckIn() {
  const [searchParams] = useSearchParams();
  const eventId = searchParams.get("event");
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirmData, setConfirmData] = useState(null);

  useEffect(() => {
    if (!eventId) {
      setLoading(false);
      return;
    }
    fetchEventById(eventId).then((ev) => {
      setEvent(ev);
      setLoading(false);
    });
  }, [eventId]);

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#f5f6f8",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p style={{ fontFamily: "'Outfit', sans-serif", color: "#667085" }}>
          Loading...
        </p>
      </div>
    );
  }

  if (!event) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#f5f6f8",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 400 }}>
          <div style={{ display: "inline-block", marginBottom: 24 }}>
            <Logo />
          </div>
          <Card>
            <div style={{ fontSize: "32px", marginBottom: 12 }}>😕</div>
            <h2
              style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: "18px",
                fontWeight: 700,
                color: "#1d2939",
                margin: "0 0 8px 0",
              }}
            >
              Invalid Check-In Link
            </h2>
            <p
              style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: "14px",
                color: "#667085",
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              This check-in link isn't valid — ask a volunteer for help.
            </p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f5f6f8",
        fontFamily: "'Outfit', sans-serif",
      }}
    >
      <div
        style={{ maxWidth: 440, margin: "0 auto", padding: "20px 16px 80px" }}
      >
        {confirmData ? (
          <ConfirmationScreen
            data={confirmData}
            onReset={() => setConfirmData(null)}
          />
        ) : (
          <CheckInForm
            event={event}
            onComplete={(data) => setConfirmData(data)}
          />
        )}
      </div>
      {/* <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "12px", textAlign: "center", background: "#f5f6f8" }}>
        <Link to="/staff" style={{ background: "none", border: "none", fontFamily: "'Outfit', sans-serif", fontSize: "11px", color: "#c0c5ce", cursor: "pointer", padding: "4px 8px", textDecoration: "none" }}>Staff Portal →</Link>
      </div> */}
    </div>
  );
}
