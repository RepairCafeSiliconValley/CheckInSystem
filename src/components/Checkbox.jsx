// Custom checkbox matching the Input component's visual vocabulary
// (1.5px #d0d5dd border, white fill, #1e3a6e accent on focus/checked).
//
// The native <input> stays in the DOM with appearance:none so label clicks,
// keyboard focus and screen readers keep working; the tick is an overlaid SVG
// because inline styles can't express a ::after pseudo-element.

const BORDER = "#d0d5dd";
const ACCENT = "#1e3a6e";

export default function Checkbox({
  checked,
  onChange,
  disabled = false,
  align = "flex-start",
  gap = 10,
  style,
  children,
}) {
  const cursor = disabled ? "not-allowed" : "pointer";

  return (
    <label
      style={{
        display: "flex",
        alignItems: align,
        gap,
        cursor,
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      <span
        style={{
          position: "relative",
          display: "inline-flex",
          flexShrink: 0,
          marginTop: align === "flex-start" ? 2 : 0,
        }}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          style={{
            appearance: "none",
            WebkitAppearance: "none",
            margin: 0,
            width: 18,
            height: 18,
            borderRadius: 6,
            border: `1.5px solid ${checked ? ACCENT : BORDER}`,
            background: checked ? ACCENT : "#fff",
            cursor,
            outline: "none",
            transition: "background-color 0.15s, border-color 0.15s, box-shadow 0.15s",
          }}
          onFocus={(e) => (e.target.style.boxShadow = `0 0 0 3px ${ACCENT}22`)}
          onBlur={(e) => (e.target.style.boxShadow = "none")}
        />
        {checked && (
          <svg
            viewBox="0 0 16 16"
            width="12"
            height="12"
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              pointerEvents: "none",
            }}
          >
            <path
              d="M3.5 8.5l3 3 6-6"
              fill="none"
              stroke="#fff"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      {children}
    </label>
  );
}
