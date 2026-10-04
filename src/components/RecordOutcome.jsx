import { useState } from "react";
import Input from "./Input";
import TextArea from "./TextArea";
import Button from "./Button";
import { OUTCOMES, NOT_FIXED_REASONS, OTHER_REASON } from "../lib/constants";

const OUTCOME_EMOJI = {
  Fixed: "✅",
  Diagnosed: "🔍",
  "Not Fixed": "❌",
  "Taken Home": "🥡",
};

// Staff-side outcome recording for a printed (pending_assignment) work order.
// Mirrors the fixer page (/fix/:id): pick an outcome (plus a reason for
// "Not Fixed"), then confirm with Submit. Nothing is saved until Submit.
// Calls onRecord(outcome, notFixedReason, notFixedNote).
export default function RecordOutcome({
  fixerName,
  onFixerNameChange,
  onFixerNameBlur,
  onRecord,
}) {
  const [selectedOutcome, setSelectedOutcome] = useState(null);
  const [notFixedReason, setNotFixedReason] = useState(null);
  const [notFixedNote, setNotFixedNote] = useState(""); // optional, only for "Other"
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSelectOutcome = (outcome) => {
    setSelectedOutcome(outcome);
    // Clear any not-fixed reason when switching to a different outcome.
    if (outcome !== "Not Fixed") setNotFixedReason(null);
    setError(null);
  };

  const needsNotFixedReason =
    selectedOutcome === "Not Fixed" && !notFixedReason;

  let submitHint = "";
  if (!selectedOutcome) submitHint = "Select an outcome to submit.";
  else if (needsNotFixedReason)
    submitHint = "Select a reason it wasn't fixed to submit.";

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onRecord(
        selectedOutcome,
        selectedOutcome === "Not Fixed" ? notFixedReason : null,
        selectedOutcome === "Not Fixed" && notFixedReason === OTHER_REASON
          ? notFixedNote
          : null,
      );
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  const choiceStyle = (isSelected, compact) => ({
    padding: compact ? "8px 12px" : "10px 12px",
    borderRadius: "8px",
    border: isSelected ? "1.5px solid #1e3a6e" : "1.5px solid #d0d5dd",
    background: isSelected ? "#eef2f9" : "#fff",
    fontFamily: "'Outfit', sans-serif",
    fontSize: compact ? "12px" : "13px",
    fontWeight: isSelected ? 600 : 500,
    color: submitting ? "#98a2b3" : isSelected ? "#1e3a6e" : "#475467",
    cursor: submitting ? "not-allowed" : "pointer",
    transition: "all 0.15s",
  });

  return (
    <div style={{ marginTop: 8 }}>
      <Input
        label="Fixer Name (optional)"
        value={fixerName}
        onChange={onFixerNameChange}
        onBlur={onFixerNameBlur}
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
            onClick={() => handleSelectOutcome(o)}
            disabled={submitting}
            style={choiceStyle(o === selectedOutcome, false)}
          >
            {OUTCOME_EMOJI[o]} {o}
          </button>
        ))}
      </div>

      {/* Not-Fixed reason — required when "Not Fixed" is selected */}
      {selectedOutcome === "Not Fixed" && (
        <div style={{ marginTop: 8 }}>
          <p
            style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: "12px",
              fontWeight: 600,
              color: "#344054",
              margin: "0 0 6px 0",
            }}
          >
            Why wasn't it fixed?
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
            }}
          >
            {NOT_FIXED_REASONS.map((r) => (
              <button
                key={r}
                onClick={() => setNotFixedReason(r)}
                disabled={submitting}
                style={choiceStyle(r === notFixedReason, true)}
              >
                {r}
              </button>
            ))}
          </div>
          {notFixedReason === OTHER_REASON && (
            <div style={{ marginTop: 8 }}>
              <TextArea
                label="Details (optional)"
                value={notFixedNote}
                onChange={setNotFixedNote}
                placeholder="Briefly describe why it wasn't fixed"
                rows={2}
              />
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={submitting || !selectedOutcome || needsNotFixedReason}
          style={{ fontSize: "13px", padding: "8px 12px" }}
        >
          {submitting ? "Submitting…" : "Submit Outcome"}
        </Button>
        {!submitting && submitHint && (
          <p
            style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: "12px",
              color: "#98a2b3",
              textAlign: "center",
              margin: "6px 0 0 0",
            }}
          >
            {submitHint}
          </p>
        )}
        {error && (
          <p
            style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: "12px",
              color: "#b42318",
              textAlign: "center",
              margin: "6px 0 0 0",
            }}
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
