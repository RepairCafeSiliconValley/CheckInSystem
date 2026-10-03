import { useState } from "react";
import Input from "./Input";
import ReasonPicker from "./ReasonPicker";
import { OUTCOMES, NOT_FIXED_REASONS } from "../lib/constants";

const OUTCOME_EMOJI = {
  Fixed: "✅",
  Diagnosed: "🔍",
  "Not Fixed": "❌",
  "Taken Home": "🥡",
};

// Staff-side outcome recording for a printed (pending_assignment) work order.
// Most outcomes record on click; "Not Fixed" first opens the reason picker.
// Calls onRecord(outcome, notFixedReason, notFixedNote).
export default function RecordOutcome({
  fixerName,
  onFixerNameChange,
  onFixerNameBlur,
  onRecord,
}) {
  const [notFixedOpen, setNotFixedOpen] = useState(false);

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
        {OUTCOMES.map((o) => {
          const isNotFixedOpen = o === "Not Fixed" && notFixedOpen;
          return (
            <button
              key={o}
              onClick={() =>
                o === "Not Fixed"
                  ? setNotFixedOpen((open) => !open)
                  : onRecord(o, null, null)
              }
              style={{
                padding: "10px 12px",
                borderRadius: "8px",
                border: isNotFixedOpen
                  ? "1.5px solid #1e3a6e"
                  : "1.5px solid #d0d5dd",
                background: isNotFixedOpen ? "#eef2f9" : "#fff",
                fontFamily: "'Outfit', sans-serif",
                fontSize: "13px",
                fontWeight: 500,
                color: "#475467",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {OUTCOME_EMOJI[o]} {o}
            </button>
          );
        })}
      </div>

      {/* Not-Fixed reason picker — appears when "Not Fixed" is chosen */}
      {notFixedOpen && (
        <div style={{ marginTop: 8 }}>
          <ReasonPicker
            label="Why wasn't it fixed?"
            reasons={NOT_FIXED_REASONS}
            onPick={(reason, note) => onRecord("Not Fixed", reason, note)}
            compact
          />
        </div>
      )}
    </div>
  );
}
