import { useState } from "react";
import TextArea from "./TextArea";
import Button from "./Button";
import { OTHER_REASON } from "../lib/constants";

// Grid of reason buttons. Every reason commits on click except "Other", which
// first reveals an optional note and an explicit confirm. Calls
// onPick(reason, note) — note is null unless "Other" was chosen.
export default function ReasonPicker({ label, reasons, onPick, compact = false }) {
  const [otherOpen, setOtherOpen] = useState(false);
  const [note, setNote] = useState("");

  return (
    <div>
      <p
        style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: "12px",
          fontWeight: 600,
          color: "#344054",
          margin: "0 0 6px 0",
        }}
      >
        {label}
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
        }}
      >
        {reasons.map((r) => {
          const isOther = r === OTHER_REASON;
          const isOpen = isOther && otherOpen;
          return (
            <button
              key={r}
              onClick={() => {
                if (isOther) {
                  setOtherOpen(true);
                  setNote("");
                } else {
                  onPick(r, null);
                }
              }}
              style={{
                padding: compact ? "8px 12px" : "10px 12px",
                borderRadius: "8px",
                border: isOpen ? "1.5px solid #1e3a6e" : "1.5px solid #d0d5dd",
                background: isOpen ? "#eef2f9" : "#fff",
                fontFamily: "'Outfit', sans-serif",
                fontSize: compact ? "12px" : "13px",
                fontWeight: 500,
                color: "#475467",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {r}
            </button>
          );
        })}
      </div>
      {otherOpen && (
        <div style={{ marginTop: 8 }}>
          <TextArea
            label="Details (optional)"
            value={note}
            onChange={setNote}
            placeholder="Briefly describe the reason"
            rows={2}
          />
          <Button
            variant="primary"
            onClick={() => onPick(OTHER_REASON, note)}
            style={{ fontSize: "13px", padding: "8px 12px" }}
          >
            Confirm "Other"
          </Button>
        </div>
      )}
    </div>
  );
}
