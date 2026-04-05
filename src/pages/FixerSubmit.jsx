import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import Logo from "../components/Logo";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Input from "../components/Input";
import { fetchWorkOrderById, submitFixerOutcome } from "../lib/store";
import { OUTCOMES } from "../lib/constants";

const OUTCOME_EMOJI = {
  Fixed: "✅",
  Diagnosed: "🔍",
  "Not Fixed": "❌",
};

function SuccessScreen({ outcome, itemName }) {
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
        Outcome Submitted
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
        <strong>{itemName}</strong> has been marked as{" "}
        <strong>{outcome}</strong>. Thanks for volunteering!
      </p>
    </div>
  );
}

export default function FixerSubmit() {
  const { id } = useParams();
  const [workOrder, setWorkOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fixerName, setFixerName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchWorkOrderById(id).then((wo) => {
      setWorkOrder(wo);
      setLoading(false);
    });
  }, [id]);

  const handleOutcome = async (outcome) => {
    if (!fixerName.trim()) {
      setError("Please enter your name.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await submitFixerOutcome(workOrder.id, fixerName, outcome);
      setSubmitted(outcome);
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  // Loading
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

  // Not found
  if (!workOrder) {
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
              Item Not Found
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
              This link isn't valid — please check the QR code and try again, or
              ask a coordinator for help.
            </p>
          </Card>
        </div>
      </div>
    );
  }

  const visitorName = workOrder.attendees?.name || "Visitor";

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
        {submitted ? (
          <SuccessScreen
            outcome={submitted}
            itemName={workOrder.item_name}
          />
        ) : (
          <>
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <div style={{ display: "inline-block" }}>
                <Logo size="small" />
              </div>
            </div>

            {/* Pending — not yet reviewed */}
            {workOrder.status === "pending" && (
              <Card>
                <div style={{ fontSize: "32px", marginBottom: 12, textAlign: "center" }}>⏳</div>
                <h2
                  style={{
                    fontFamily: "'Outfit', sans-serif",
                    fontSize: "18px",
                    fontWeight: 700,
                    color: "#1d2939",
                    margin: "0 0 8px 0",
                    textAlign: "center",
                  }}
                >
                  Not Checked In Yet
                </h2>
                <p
                  style={{
                    fontFamily: "'Outfit', sans-serif",
                    fontSize: "14px",
                    color: "#667085",
                    lineHeight: 1.5,
                    margin: 0,
                    textAlign: "center",
                  }}
                >
                  This item hasn't been checked in yet. Please check with the
                  coordinator.
                </p>
              </Card>
            )}

            {/* Already completed */}
            {workOrder.status === "completed" && (
              <Card>
                <div style={{ fontSize: "32px", marginBottom: 12, textAlign: "center" }}>✅</div>
                <h2
                  style={{
                    fontFamily: "'Outfit', sans-serif",
                    fontSize: "18px",
                    fontWeight: 700,
                    color: "#1d2939",
                    margin: "0 0 8px 0",
                    textAlign: "center",
                  }}
                >
                  Already Completed
                </h2>
                <div
                  style={{
                    padding: "10px",
                    background: "#e8f5e9",
                    borderRadius: "8px",
                    textAlign: "center",
                    marginTop: 12,
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
                    {workOrder.outcome}
                  </span>
                  {workOrder.fixer_name && (
                    <span
                      style={{
                        fontFamily: "'Outfit', sans-serif",
                        fontSize: "12px",
                        color: "#667085",
                        marginLeft: 8,
                      }}
                    >
                      by {workOrder.fixer_name}
                    </span>
                  )}
                </div>
              </Card>
            )}

            {/* Form — reviewed or in-progress */}
            {workOrder.status === "pending_assignment" && (
              <>
                <h2
                  style={{
                    fontFamily: "'Outfit', sans-serif",
                    fontSize: "22px",
                    fontWeight: 700,
                    color: "#1d2939",
                    margin: "0 0 4px 0",
                  }}
                >
                  Submit Repair Outcome
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
                  Review the item details below, then record the outcome of your
                  repair.
                </p>

                {/* Item details */}
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
                    <div
                      style={{
                        fontSize: "10px",
                        fontWeight: 600,
                        color: "#98a2b3",
                        textTransform: "uppercase",
                        letterSpacing: "1px",
                        marginBottom: 2,
                      }}
                    >
                      Client
                    </div>
                    <div
                      style={{
                        fontSize: "15px",
                        fontWeight: 600,
                        color: "#1d2939",
                      }}
                    >
                      {visitorName}
                    </div>
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    <div
                      style={{
                        fontSize: "10px",
                        fontWeight: 600,
                        color: "#98a2b3",
                        textTransform: "uppercase",
                        letterSpacing: "1px",
                        marginBottom: 2,
                      }}
                    >
                      Item
                    </div>
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
                    <Badge text={workOrder.category} />
                  </div>

                  <div>
                    <div
                      style={{
                        fontSize: "10px",
                        fontWeight: 600,
                        color: "#98a2b3",
                        textTransform: "uppercase",
                        letterSpacing: "1px",
                        marginBottom: 2,
                      }}
                    >
                      Issue
                    </div>
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

                {/* Fixer name + outcome */}
                <Card>
                  <Input
                    label="Your Name"
                    value={fixerName}
                    onChange={setFixerName}
                    placeholder="Enter your name"
                    required
                  />

                  <p
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "#344054",
                      margin: "0 0 8px 0",
                    }}
                  >
                    Repair Outcome:
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
                        onClick={() => handleOutcome(o)}
                        disabled={submitting}
                        style={{
                          padding: "14px 12px",
                          borderRadius: "8px",
                          border: "1.5px solid #d0d5dd",
                          background: "#fff",
                          fontFamily: "'Outfit', sans-serif",
                          fontSize: "14px",
                          fontWeight: 500,
                          color: submitting ? "#98a2b3" : "#475467",
                          cursor: submitting ? "not-allowed" : "pointer",
                          transition: "all 0.15s",
                        }}
                      >
                        {OUTCOME_EMOJI[o]} {o}
                      </button>
                    ))}
                  </div>

                  {error && (
                    <div
                      style={{
                        padding: "8px 12px",
                        background: "#fef3f2",
                        borderRadius: "8px",
                        marginTop: 12,
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
                </Card>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
