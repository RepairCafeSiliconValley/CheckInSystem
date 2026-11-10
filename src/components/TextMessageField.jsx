import InfoTooltip from "./InfoTooltip";
import {
  DEFAULT_TEXT_MESSAGE,
  TEMPLATE_VARIABLES,
  SAMPLE_VALUES,
  renderTemplateParts,
  smsSegments,
  fixSmartPunctuation,
} from "../lib/textMessage";

// The per-event text message editor, shared by the Create Event form and the
// event settings modal so the two can't drift.
//
// Beyond the textarea it carries a segment counter, because SMS is billed per
// segment and the cost cliff is invisible: one curly apostrophe drops the
// limit from 160 characters to 70. Tablet keyboards insert those automatically.

const labelStyle = {
  display: "block",
  fontFamily: "'Outfit', sans-serif",
  fontSize: "13px",
  fontWeight: 600,
  color: "#344054",
  marginBottom: 6,
  letterSpacing: "0.3px",
};

const noteStyle = {
  fontFamily: "'Outfit', sans-serif",
  fontSize: "12px",
  color: "#667085",
  lineHeight: 1.5,
};

const previewLabelStyle = {
  fontSize: "10px",
  fontWeight: 600,
  color: "#98a2b3",
  textTransform: "uppercase",
  letterSpacing: "1px",
  marginBottom: 4,
};

// Faint tint on the runs that came from a token, so it's obvious at a glance
// which words are substituted rather than typed.
const substitutedStyle = {
  background: "#eef2f8",
  color: "#1e3a6e",
  borderRadius: 3,
  padding: "0 2px",
};

export default function TextMessageField({
  value,
  onChange,
  disabled = false,
  disabledNote,
}) {
  // Count the rendered preview, not the raw template: "[item_name]" is 11
  // characters but the real value is usually longer, so measuring the template
  // would under-report what actually gets sent.
  const previewParts = renderTemplateParts(value, SAMPLE_VALUES);
  const previewText = previewParts.map((p) => p.text).join("");
  const info = smsSegments(previewText);

  return (
    <div style={{ marginBottom: 16, opacity: disabled ? 0.5 : 1 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 6,
        }}
      >
        <span style={{ ...labelStyle, marginBottom: 0 }}>Text message</span>
        <InfoTooltip label="Which placeholders you can use" disabled={disabled}>
          <strong style={{ color: "#1d2939" }}>
            These get replaced when the text is sent:
          </strong>
          <ul style={{ margin: "6px 0 0 0", padding: "0 0 0 16px" }}>
            {TEMPLATE_VARIABLES.map((v) => (
              <li key={v.token} style={{ marginBottom: 4 }}>
                <code
                  style={{
                    fontFamily: "'Space Mono', monospace",
                    fontSize: "11px",
                    color: "#1e3a6e",
                  }}
                >
                  {v.token}
                </code>{" "}
                — {v.description}
              </li>
            ))}
          </ul>
          <span style={{ display: "block", marginTop: 6, color: "#667085" }}>
            Anything else in square brackets is sent as-is.
          </span>
        </InfoTooltip>
      </div>

      {disabled && disabledNote ? (
        <p style={{ ...noteStyle, margin: 0 }}>{disabledNote}</p>
      ) : null}

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={4}
        placeholder={DEFAULT_TEXT_MESSAGE}
        style={{
          width: "100%",
          padding: "12px 14px",
          borderRadius: "10px",
          border: "1.5px solid #d0d5dd",
          fontFamily: "'Outfit', sans-serif",
          fontSize: "15px",
          color: "#1d2939",
          background: "#fff",
          boxSizing: "border-box",
          outline: "none",
          resize: "vertical",
          transition: "border-color 0.2s",
        }}
        onFocus={(e) => (e.target.style.borderColor = "#1e3a6e")}
        onBlur={(e) => (e.target.style.borderColor = "#d0d5dd")}
      />

      {!disabled && previewText && (
        <div
          style={{
            marginTop: 8,
            padding: "10px 12px",
            background: "#f9fafb",
            border: "1px solid #e8ebf0",
            borderRadius: 8,
          }}
        >
          <div style={previewLabelStyle}>Preview</div>
          <p
            style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: "14px",
              color: "#1d2939",
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            {previewParts.map((p, i) =>
              p.isValue ? (
                <span key={i} style={substitutedStyle}>
                  {p.text}
                </span>
              ) : (
                <span key={i}>{p.text}</span>
              ),
            )}
          </p>
          <p style={{ ...noteStyle, fontSize: "11px", margin: "6px 0 0 0" }}>
            Highlighted words are examples — they're replaced with real values
            when the text is sent.
          </p>
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
          marginTop: 6,
        }}
      >
        {/* Always neutral. A longer message is a choice the coordinator made
            and only costs a fraction of a cent more; amber is reserved for the
            UCS-2 case below, which they didn't choose and can't see. */}
        <span
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: "11px",
            color: "#667085",
          }}
        >
          {info.units} / {info.limit} · {info.segments}{" "}
          {info.segments === 1 ? "segment" : "segments"}
        </span>
        {!disabled && value !== DEFAULT_TEXT_MESSAGE && (
          <button
            type="button"
            onClick={() => onChange(DEFAULT_TEXT_MESSAGE)}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              fontFamily: "'Outfit', sans-serif",
              fontSize: "12px",
              color: "#1e3a6e",
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            Reset to default
          </button>
        )}
      </div>

      {info.encoding === "UCS-2" && (
        <div
          style={{
            padding: "8px 12px",
            background: "#fef6ee",
            borderRadius: "8px",
            marginTop: 8,
          }}
        >
          <span style={{ ...noteStyle, color: "#b54708" }}>
            {info.offenders.map((c) => `“${c}”`).join(", ")}{" "}
            {info.offenders.length === 1 ? "isn’t" : "aren’t"} supported by
            basic SMS, so this message costs twice as much to send per text.
          </span>
          {info.canFix && (
            <button
              type="button"
              onClick={() => onChange(fixSmartPunctuation(value))}
              style={{
                display: "block",
                marginTop: 6,
                background: "none",
                border: "none",
                padding: 0,
                fontFamily: "'Outfit', sans-serif",
                fontSize: "12px",
                fontWeight: 600,
                color: "#b54708",
                textDecoration: "underline",
                cursor: "pointer",
              }}
            >
              Fix punctuation
            </button>
          )}
        </div>
      )}
    </div>
  );
}
