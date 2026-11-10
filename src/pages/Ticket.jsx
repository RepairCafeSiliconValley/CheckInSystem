import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import Logo from "../components/Logo";
import Card from "../components/Card";
import ClaimPanel from "../components/ClaimPanel";
import OutcomePanel from "../components/OutcomePanel";
import ClaimResultBanner from "../components/ClaimResultBanner";
import { fetchWorkOrderById, resolveTicketCode } from "../lib/store";

// The one thing a ticket's QR points at. Claiming and submitting an outcome
// used to be /claim/:id and /fix/:id with a QR each, which made volunteers
// choose between two codes that both just update this ticket. Status decides
// which half shows:
//
//   pending            → not checked in yet
//   pending_assignment → claim it (ClaimPanel)
//   assigned           → record the outcome (OutcomePanel)
//   completed/canceled → nothing to do
//
// Claiming doesn't navigate: the refetch flips status to 'assigned' and the
// outcome form appears in place, with the text result as a banner above it.
//
// Three routes land here: /T/:code, the short code printed on tickets since the
// QR was shrunk (see ticketLink.js), and /fix/:id and /claim/:id with the full
// UUID, which older tickets carry on paper. A code is turned into the id first;
// everything after that works on the id.

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
const bigEmoji = { fontSize: "32px", marginBottom: 12, textAlign: "center" };

function Shell({ children }) {
  return (
    <div style={wrap}>
      <div style={{ maxWidth: 440, margin: "0 auto", padding: "20px 16px 80px" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ display: "inline-block" }}>
            <Logo size="small" variant="horizontal" />
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function Notice({ emoji, title, children }) {
  return (
    <Card>
      <div style={bigEmoji}>{emoji}</div>
      <h2 style={heading}>{title}</h2>
      {children}
    </Card>
  );
}

function SubmittedScreen({ outcome, itemName }) {
  return (
    <div style={{ textAlign: "center" }}>
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
        <strong>{itemName}</strong> has been marked as <strong>{outcome}</strong>
        . Thanks for volunteering!
      </p>
    </div>
  );
}

export default function Ticket() {
  const { id, code } = useParams();
  const [workOrder, setWorkOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  // Set once an item is claimed on this visit, so the banner only appears to
  // the fixer who did it — not to anyone who scans an already-claimed ticket.
  const [claimResult, setClaimResult] = useState(null);
  const [submittedOutcome, setSubmittedOutcome] = useState(null);

  // Re-resolving the code on the refetch after a claim costs one small RPC and
  // keeps this a single path.
  const load = useCallback(
    () =>
      (code ? resolveTicketCode(code) : Promise.resolve(id))
        .then((workOrderId) => (workOrderId ? fetchWorkOrderById(workOrderId) : null))
        .then(setWorkOrder),
    [id, code],
  );

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const handleClaimed = async (result) => {
    setClaimResult(result);
    // Refetch rather than patching local state: the Edge Function also sets
    // fixer_name and assigned_at, and this keeps one source of truth.
    await load();
  };

  if (loading) {
    return (
      <div
        style={{
          ...wrap,
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

  if (!workOrder) {
    return (
      <Shell>
        <Notice emoji="😕" title="Item Not Found">
          <p style={bodyText}>
            This link isn't valid — please check the QR code and try again, or
            ask a coordinator for help.
          </p>
        </Notice>
      </Shell>
    );
  }

  if (submittedOutcome) {
    return (
      <Shell>
        <SubmittedScreen
          outcome={submittedOutcome}
          itemName={workOrder.item_name}
        />
      </Shell>
    );
  }

  const clientName = workOrder.client_name || "the client";

  switch (workOrder.status) {
    case "pending":
      return (
        <Shell>
          <Notice emoji="⏳" title="Not Checked In Yet">
            <p style={bodyText}>
              This item hasn't been checked in yet. Please check with the
              coordinator.
            </p>
          </Notice>
        </Shell>
      );

    case "completed":
      return (
        <Shell>
          <Notice emoji="✅" title="Already Completed">
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
              {workOrder.not_fixed_reason && (
                <div
                  style={{
                    fontFamily: "'Outfit', sans-serif",
                    fontSize: "12px",
                    color: "#667085",
                    marginTop: 4,
                  }}
                >
                  Reason: {workOrder.not_fixed_reason}
                </div>
              )}
            </div>
          </Notice>
        </Shell>
      );

    case "canceled":
      return (
        <Shell>
          <Notice emoji="🚫" title="Item Cancelled">
            <p style={bodyText}>
              This item was canceled — there's nothing to do here. Please check
              with the coordinator.
            </p>
          </Notice>
        </Shell>
      );

    case "assigned":
      return (
        <Shell>
          {claimResult && (
            <ClaimResultBanner
              result={claimResult}
              clientName={clientName}
              itemName={workOrder.item_name}
            />
          )}
          <OutcomePanel
            workOrder={workOrder}
            clientName={clientName}
            onSubmitted={setSubmittedOutcome}
          />
        </Shell>
      );

    default:
      // pending_assignment — printed and waiting for someone to pick it up.
      return (
        <Shell>
          <ClaimPanel
            workOrder={workOrder}
            clientName={clientName}
            onClaimed={handleClaimed}
          />
        </Shell>
      );
  }
}
