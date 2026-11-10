import { useState } from "react";
import Card from "./Card";
import Input from "./Input";
import Button from "./Button";
import TextArea from "./TextArea";
import ItemDetailsCard from "./ItemDetailsCard";
import { submitFixerOutcome } from "../lib/store";
import { getSavedFixerName, saveFixerName } from "../lib/fixerName";
import {
  OUTCOMES,
  NOT_FIXED_REASONS,
  OTHER_REASON,
  NOTE_HINT,
} from "../lib/constants";

// Shown by the ticket page once an item is With Fixer. Lifted from the old
// /fix/:id page unchanged apart from the shared item card.

const OUTCOME_EMOJI = {
  Fixed: "✅",
  Diagnosed: "🔍",
  "Not Fixed": "❌",
  "Taken Home": "🥡",
};

const heading = {
  fontFamily: "'Outfit', sans-serif",
  fontSize: "22px",
  fontWeight: 700,
  color: "#1d2939",
  margin: "0 0 4px 0",
};
const intro = {
  fontFamily: "'Outfit', sans-serif",
  fontSize: "14px",
  color: "#667085",
  margin: "0 0 24px 0",
  lineHeight: 1.5,
};
const choiceBase = {
  borderRadius: "8px",
  fontFamily: "'Outfit', sans-serif",
  transition: "all 0.15s",
};

export default function OutcomePanel({ workOrder, clientName, onSubmitted }) {
  const [fixerName, setFixerName] = useState(
    workOrder.fixer_name || getSavedFixerName(),
  );
  const [submitting, setSubmitting] = useState(false);
  const [selectedOutcome, setSelectedOutcome] = useState(null);
  const [notFixedReason, setNotFixedReason] = useState(null);
  const [notFixedNote, setNotFixedNote] = useState(""); // optional, only for "Other"
  const [error, setError] = useState(null);

  const handleSelectOutcome = (outcome) => {
    setSelectedOutcome(outcome);
    // Clear any not-fixed reason when switching to a different outcome.
    if (outcome !== "Not Fixed") setNotFixedReason(null);
    setError(null);
  };

  const handleSubmit = async () => {
    // Name + outcome (+ reason when Not Fixed) are guaranteed present here —
    // the Submit button stays disabled until they're set.
    setSubmitting(true);
    setError(null);
    try {
      await submitFixerOutcome(
        workOrder.id,
        fixerName,
        selectedOutcome,
        selectedOutcome === "Not Fixed" ? notFixedReason : null,
        selectedOutcome === "Not Fixed" && notFixedReason === OTHER_REASON
          ? notFixedNote
          : null,
      );
      saveFixerName(fixerName.trim());
      onSubmitted(selectedOutcome);
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  // Not Fixed additionally requires a reason before submitting.
  const needsNotFixedReason =
    selectedOutcome === "Not Fixed" && !notFixedReason;

  // Dynamic hint explaining why the Submit button is disabled.
  const hasName = fixerName.trim().length > 0;
  let submitHint = "";
  if (!hasName && !selectedOutcome)
    submitHint = "Enter your name and select an outcome to submit.";
  else if (!hasName) submitHint = "Enter your name to submit.";
  else if (!selectedOutcome) submitHint = "Select an outcome to submit.";
  else if (needsNotFixedReason)
    submitHint = "Select a reason it wasn't fixed to submit.";

  const choiceStyle = (isSelected, padding, fontSize) => ({
    ...choiceBase,
    padding,
    fontSize,
    border: isSelected ? "1.5px solid #1e3a6e" : "1.5px solid #d0d5dd",
    background: isSelected ? "#eef2f9" : "#fff",
    fontWeight: isSelected ? 600 : 500,
    color: submitting ? "#98a2b3" : isSelected ? "#1e3a6e" : "#475467",
    cursor: submitting ? "not-allowed" : "pointer",
  });

  return (
    <>
      <h2 style={heading}>Submit Repair Outcome</h2>
      <p style={intro}>
        Review the item details below, then record the outcome of your repair.
      </p>

      <ItemDetailsCard workOrder={workOrder} clientName={clientName} />

      <Card>
        <Input
          label="Fixer Name"
          value={fixerName}
          onChange={setFixerName}
          placeholder="Enter name of fixer"
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
          Repair Outcome
          <span style={{ color: "#e07850" }}> *</span>
        </p>
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}
        >
          {OUTCOMES.map((o) => (
            <button
              key={o}
              onClick={() => handleSelectOutcome(o)}
              disabled={submitting}
              style={choiceStyle(o === selectedOutcome, "14px 12px", "14px")}
            >
              {OUTCOME_EMOJI[o]} {o}
            </button>
          ))}
        </div>

        {/* Not-Fixed reason — required when "Not Fixed" is selected */}
        {selectedOutcome === "Not Fixed" && (
          <div style={{ marginTop: 12 }}>
            <p
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "#344054",
                margin: "0 0 8px 0",
              }}
            >
              Why wasn't it fixed?
              <span style={{ color: "#e07850" }}> *</span>
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
                  style={choiceStyle(r === notFixedReason, "10px 12px", "13px")}
                >
                  {r}
                </button>
              ))}
            </div>
            {notFixedReason === OTHER_REASON && (
              <div style={{ marginTop: 12 }}>
                <TextArea
                  label="Details (optional)"
                  value={notFixedNote}
                  onChange={setNotFixedNote}
                  placeholder="Briefly describe why it wasn't fixed"
                  rows={2}
                  hint={NOTE_HINT}
                />
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={
              submitting ||
              !selectedOutcome ||
              !fixerName.trim() ||
              needsNotFixedReason
            }
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
                margin: "8px 0 0 0",
              }}
            >
              {submitHint}
            </p>
          )}
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
  );
}
