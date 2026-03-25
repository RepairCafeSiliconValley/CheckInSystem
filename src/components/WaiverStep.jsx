import { useState } from "react";
import Logo from "./Logo";
import Button from "./Button";
import { WAIVER_SECTIONS } from "../lib/constants";

export default function WaiverStep({ onAccept, onBack, submitting, error }) {
  const [agreed, setAgreed] = useState(false);

  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ display: "inline-block" }}>
          <Logo size="small" />
        </div>
      </div>

      <h2
        style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: "20px",
          fontWeight: 700,
          color: "#1d2939",
          margin: "0 0 4px 0",
        }}
      >
        Authorization & Waiver
      </h2>
      <p
        style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: "13px",
          color: "#667085",
          margin: "0 0 16px 0",
          lineHeight: 1.5,
        }}
      >
        Our goal is to assist with the repair of broken items and promote
        sustainability. Volunteers will make their best effort to help repair
        items; however, there is no guarantee of success. By participating in
        this event you acknowledge the following:
      </p>

      <div
        style={{
          maxHeight: 380,
          overflowY: "auto",
          border: "1.5px solid #d0d5dd",
          borderRadius: "10px",
          padding: "16px",
          marginBottom: 16,
          background: "#fff",
        }}
      >
        {WAIVER_SECTIONS.map((section, idx) => (
          <div key={idx} style={{ marginBottom: idx < WAIVER_SECTIONS.length - 1 ? 16 : 0 }}>
            <div
              style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: "14px",
                fontWeight: 700,
                color: "#1d2939",
                marginBottom: 4,
              }}
            >
              {section.heading}
            </div>
            <div
              style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: "13px",
                color: "#667085",
                lineHeight: 1.6,
              }}
            >
              {section.body}
            </div>
          </div>
        ))}
      </div>

      <label
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          marginBottom: 16,
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          style={{
            marginTop: 2,
            width: 18,
            height: 18,
            accentColor: "#1e3a6e",
            cursor: "pointer",
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: "14px",
            fontWeight: 600,
            color: "#1d2939",
            lineHeight: 1.4,
          }}
        >
          I have read and agree to the above waiver
        </span>
      </label>

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

      <Button onClick={onAccept} disabled={!agreed || submitting}>
        {submitting ? "Submitting..." : "Check In"}
      </Button>

      <div style={{ textAlign: "center", marginTop: 12 }}>
        <button
          onClick={onBack}
          disabled={submitting}
          style={{
            background: "none",
            border: "none",
            fontFamily: "'Outfit', sans-serif",
            fontSize: "14px",
            color: "#667085",
            cursor: "pointer",
            padding: "4px 8px",
          }}
        >
          ← Back to form
        </button>
      </div>
    </div>
  );
}
