import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import Logo from "../components/Logo";
import Card from "../components/Card";
import Button from "../components/Button";
import Input from "../components/Input";
import ItemForm from "../components/ItemForm";
import WaiverStep from "../components/WaiverStep";
import { fetchEventById, checkinVisitor } from "../lib/store";
import {
  WAIVER_VERSION,
  getWaiverFullText,
  computeWaiverHash,
} from "../lib/constants";

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
          margin: "0 0 20px 0",
          lineHeight: 1.5,
        }}
      >
        Thanks {data.firstName}! Please head to the check-in desk so a coordinator
        can review your item{data.items.length > 1 ? "s" : ""} and print your
        ticket{data.items.length > 1 ? "s" : ""}.
      </p>
      <div
        style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: "12px",
          fontWeight: 600,
          color: "#667085",
          textTransform: "uppercase",
          letterSpacing: "1px",
          marginBottom: 6,
        }}
      >
        Your ID
      </div>
      <div
        style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: "40px",
          fontWeight: 700,
          color: "#1e3a6e",
          letterSpacing: "4px",
          marginBottom: 20,
        }}
      >
        {data.baseCode}
      </div>
      {data.items.map((c) => (
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
              fontSize: "18px",
              fontWeight: 700,
              color: "#1e3a6e",
              letterSpacing: "2px",
              marginBottom: 4,
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

function CheckInForm({ event, onProceed, initialValues }) {
  const [firstName, setFirstName] = useState(initialValues?.firstName || "");
  const [lastName, setLastName] = useState(initialValues?.lastName || "");
  const [email, setEmail] = useState(initialValues?.email || "");
  const [phone, setPhone] = useState(initialValues?.phone || "");
  const [zipCode, setZipCode] = useState(initialValues?.zipCode || "");
  const [items, setItems] = useState(
    initialValues?.items || [{ name: "", description: "" }]
  );

  const canProceed =
    firstName.trim() &&
    lastName.trim() &&
    zipCode.trim() &&
    (!email.trim() || email.includes("@")) &&
    items.every((it) => it.name.trim() && it.description.trim());
  const addItem = () => {
    if (items.length < 2)
      setItems([...items, { name: "", description: "" }]);
  };
  const updateItem = (idx, u) => {
    const n = [...items];
    n[idx] = u;
    setItems(n);
  };
  const removeItem = (idx) => setItems(items.filter((_, i) => i !== idx));

  const handleProceed = () => {
    onProceed({ firstName: firstName.trim(), lastName: lastName.trim(), email, phone, zipCode, items });
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
        label="First Name"
        value={firstName}
        onChange={setFirstName}
        placeholder="First name"
        required
      />
      <Input
        label="Last Name"
        value={lastName}
        onChange={setLastName}
        placeholder="Last name"
        required
      />
      <Input
        label="Email Address"
        value={email}
        onChange={setEmail}
        placeholder="you@example.com (optional)"
        type="email"
      />
      <Input
        label="Cell Phone"
        value={phone}
        onChange={setPhone}
        placeholder="(555) 123-4567 (optional)"
        type="tel"
      />
      <Input
        label="Zip Code"
        value={zipCode}
        onChange={setZipCode}
        placeholder="e.g. 95035"
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
      <Button onClick={handleProceed} disabled={!canProceed}>
        Continue
      </Button>
    </div>
  );
}

export default function CheckIn() {
  const [searchParams] = useSearchParams();
  const eventId = searchParams.get("event");
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState("form"); // "form" | "waiver" | "confirm"
  const [formData, setFormData] = useState(null);
  const [confirmData, setConfirmData] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleWaiverAccept = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const waiverText = getWaiverFullText();
      const waiverHash = await computeWaiverHash();
      const result = await checkinVisitor(
        event.id,
        formData.firstName,
        formData.lastName,
        formData.email,
        formData.phone,
        formData.zipCode,
        formData.items,
        WAIVER_VERSION,
        waiverText,
        waiverHash
      );
      setConfirmData({
        firstName: formData.firstName,
        baseCode: result.baseCode,
        items: result.items,
      });
      setStep("confirm");
    } catch (err) {
      setError("Something went wrong. Please try again.");
    }
    setSubmitting(false);
  };

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

  if (!event.is_open) {
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
            <div style={{ fontSize: "32px", marginBottom: 12 }}>🔒</div>
            <h2
              style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: "18px",
                fontWeight: 700,
                color: "#1d2939",
                margin: "0 0 8px 0",
              }}
            >
              Check-In Closed
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
              This event is no longer accepting items for repair. Thank you for
              your interest!
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
        {step === "confirm" ? (
          <ConfirmationScreen
            data={confirmData}
            onReset={() => {
              setFormData(null);
              setConfirmData(null);
              setStep("form");
            }}
          />
        ) : step === "waiver" ? (
          <WaiverStep
            onAccept={handleWaiverAccept}
            onBack={() => {
              setStep("form");
              setError(null);
            }}
            submitting={submitting}
            error={error}
          />
        ) : (
          <CheckInForm
            event={event}
            onProceed={(data) => {
              setFormData(data);
              setStep("waiver");
            }}
            initialValues={formData}
          />
        )}
      </div>
      {/* <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "12px", textAlign: "center", background: "#f5f6f8" }}>
        <Link to="/staff" style={{ background: "none", border: "none", fontFamily: "'Outfit', sans-serif", fontSize: "11px", color: "#c0c5ce", cursor: "pointer", padding: "4px 8px", textDecoration: "none" }}>Staff Portal →</Link>
      </div> */}
    </div>
  );
}
