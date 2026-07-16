import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import Logo from "../components/Logo";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Input from "../components/Input";
import Button from "../components/Button";
import { fetchWorkOrderById, claimAndNotify } from "../lib/store";

const wrap = {
  minHeight: "100vh",
  background: "#f5f6f8",
  fontFamily: "'Outfit', sans-serif",
};
const heading = {
  fontFamily: "'Outfit', sans-serif",
  fontSize: "18px",
  fontWeight: 700,
  color: "#1d2939",
  margin: "0 0 8px 0",
  textAlign: "center",
};
const bodyText = {
  fontFamily: "'Outfit', sans-serif",
  fontSize: "14px",
  color: "#667085",
  lineHeight: 1.5,
  margin: 0,
  textAlign: "center",
};
const fieldLabel = {
  fontSize: "10px",
  fontWeight: 600,
  color: "#98a2b3",
  textTransform: "uppercase",
  letterSpacing: "1px",
  marginBottom: 2,
};

function Centered({ children }) {
  return (
    <div style={{ ...wrap, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ textAlign: "center", maxWidth: 400, width: "100%" }}>{children}</div>
    </div>
  );
}

// Copy for the post-claim success screen, keyed off the Edge Function's reason.
function outcomeCopy(result, clientName) {
  if (result.texted) {
    return { emoji: "📲", title: "Client Notified", body: `We've texted ${clientName} to come to the repair area.` };
  }
  switch (result.reason) {
    case "already_sent":
      return { emoji: "✅", title: "Already Notified", body: `${clientName} was already texted. They're on their way.` };
    case "no_phone":
      return { emoji: "🔔", title: "No Phone on File", body: `${clientName} didn't leave a number — please go call them over.` };
    case "sms_not_configured":
      return { emoji: "🔔", title: "Item Claimed", body: `Texting isn't set up yet — please go call ${clientName} over.` };
    default:
      return { emoji: "🔔", title: "Item Claimed", body: `We couldn't send the text — please go call ${clientName} over.` };
  }
}

export default function ClaimWorkOrder() {
  const { id } = useParams();
  const [workOrder, setWorkOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fixerName, setFixerName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchWorkOrderById(id).then((wo) => {
      setWorkOrder(wo);
      setFixerName(wo?.fixer_name || "");
      setLoading(false);
    });
  }, [id]);

  const handleClaim = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await claimAndNotify(workOrder.id, fixerName);
      setResult(res);
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Centered>
        <p style={{ fontFamily: "'Outfit', sans-serif", color: "#667085" }}>Loading...</p>
      </Centered>
    );
  }

  if (!workOrder) {
    return (
      <Centered>
        <div style={{ display: "inline-block", marginBottom: 24 }}>
          <Logo variant="horizontal" />
        </div>
        <Card>
          <div style={{ fontSize: "32px", marginBottom: 12 }}>😕</div>
          <h2 style={heading}>Item Not Found</h2>
          <p style={bodyText}>
            This link isn't valid — please check the QR code and try again, or ask a
            coordinator for help.
          </p>
        </Card>
      </Centered>
    );
  }

  const clientName = workOrder.client_name || "the client";

  // Success screen after a claim.
  if (result) {
    const copy = outcomeCopy(result, clientName);
    return (
      <Centered>
        <div style={{ display: "inline-block", marginBottom: 24 }}>
          <Logo size="small" variant="horizontal" />
        </div>
        <Card>
          <div style={{ fontSize: "32px", marginBottom: 12 }}>{copy.emoji}</div>
          <h2 style={heading}>{copy.title}</h2>
          <p style={{ ...bodyText, marginBottom: 16 }}>{copy.body}</p>
          <div style={{ padding: "8px 10px", background: "#f4f3ff", borderRadius: 8, marginBottom: 16 }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#6941c6" }}>
              {workOrder.item_name} — now With Fixer
            </span>
          </div>
          <Link to={`/fix/${workOrder.id}`} style={{ textDecoration: "none" }}>
            <Button variant="secondary">Submit outcome when done →</Button>
          </Link>
        </Card>
      </Centered>
    );
  }

  // Terminal / not-yet-ready states — nothing to claim.
  if (workOrder.status === "pending") {
    return (
      <Centered>
        <Card>
          <div style={{ fontSize: "32px", marginBottom: 12 }}>⏳</div>
          <h2 style={heading}>Not Ready Yet</h2>
          <p style={bodyText}>
            This item hasn't been reviewed by a coordinator yet. Please check with the
            coordinator before starting.
          </p>
        </Card>
      </Centered>
    );
  }
  if (workOrder.status === "completed") {
    return (
      <Centered>
        <Card>
          <div style={{ fontSize: "32px", marginBottom: 12 }}>✅</div>
          <h2 style={heading}>Already Completed</h2>
          <p style={bodyText}>This item has already been finished. Nothing to do here.</p>
        </Card>
      </Centered>
    );
  }
  if (workOrder.status === "canceled") {
    return (
      <Centered>
        <Card>
          <div style={{ fontSize: "32px", marginBottom: 12 }}>🚫</div>
          <h2 style={heading}>Item Canceled</h2>
          <p style={bodyText}>
            This item was canceled — there's nothing to do here. Please check with the
            coordinator.
          </p>
        </Card>
      </Centered>
    );
  }

  // Already claimed by a fixer — offer the outcome page instead of re-summoning.
  if (workOrder.status === "assigned") {
    return (
      <Centered>
        <div style={{ display: "inline-block", marginBottom: 24 }}>
          <Logo size="small" variant="horizontal" />
        </div>
        <Card>
          <div style={{ fontSize: "32px", marginBottom: 12 }}>🛠️</div>
          <h2 style={heading}>Already With a Fixer</h2>
          <p style={{ ...bodyText, marginBottom: 16 }}>
            {workOrder.fixer_name
              ? `${workOrder.fixer_name} is already on this item.`
              : "This item is already being worked on."}{" "}
            The client has been called over.
          </p>
          <Link to={`/fix/${workOrder.id}`} style={{ textDecoration: "none" }}>
            <Button variant="primary">Submit outcome →</Button>
          </Link>
        </Card>
      </Centered>
    );
  }

  // status === "pending_assignment" → the claim form.
  return (
    <div style={wrap}>
      <div style={{ maxWidth: 440, margin: "0 auto", padding: "20px 16px 80px" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ display: "inline-block" }}>
            <Logo size="small" variant="horizontal" />
          </div>
        </div>

        <h2 style={{ ...heading, fontSize: "22px", textAlign: "left", margin: "0 0 4px 0" }}>
          Start Working on This Item
        </h2>
        <p style={{ ...bodyText, textAlign: "left", margin: "0 0 24px 0" }}>
          Enter your name to claim this item and text the client to come to the repair
          area.
        </p>

        {/* Item details */}
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "16px", fontWeight: 700, color: "#1e3a6e", letterSpacing: "1px" }}>
              {workOrder.code}
            </span>
            <Badge text={`Priority ${workOrder.priority}`} color={workOrder.priority === 1 ? "#1e3a6e" : "#e07850"} />
          </div>

          <div style={{ marginBottom: 10 }}>
            <div style={fieldLabel}>Client</div>
            <div style={{ fontSize: "15px", fontWeight: 600, color: "#1d2939" }}>{clientName}</div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <div style={fieldLabel}>Item</div>
            <div style={{ fontSize: "15px", fontWeight: 600, color: "#1d2939", marginBottom: 4 }}>
              {workOrder.item_name}
            </div>
            {workOrder.category && <Badge text={workOrder.category} />}
          </div>

          <div>
            <div style={fieldLabel}>Issue</div>
            <p style={{ fontSize: "14px", color: "#344054", lineHeight: 1.5, margin: 0 }}>
              {workOrder.description}
            </p>
          </div>
        </Card>

        {/* Fixer name + claim */}
        <Card>
          <Input
            label="Your Name"
            value={fixerName}
            onChange={setFixerName}
            placeholder="Enter your name"
            required
          />

          <div style={{ marginTop: 16 }}>
            <Button variant="primary" onClick={handleClaim} disabled={submitting || !fixerName.trim()}>
              {submitting ? "Starting…" : "Start work & call client over"}
            </Button>
            {!submitting && !fixerName.trim() && (
              <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: "12px", color: "#98a2b3", textAlign: "center", margin: "8px 0 0 0" }}>
                Enter your name to start.
              </p>
            )}
          </div>

          {error && (
            <div style={{ padding: "8px 12px", background: "#fef3f2", borderRadius: "8px", marginTop: 12 }}>
              <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: "13px", color: "#b42318" }}>{error}</span>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
