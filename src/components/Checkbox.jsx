import { useEffect, useRef } from "react";

// Custom checkbox matching the Input component's visual vocabulary
// (1.5px #d0d5dd border, white fill, #1e3a6e accent on focus/checked).
//
// The native <input> stays in the DOM with appearance:none so label clicks,
// keyboard focus and screen readers keep working; the tick is an overlaid SVG
// because inline styles can't express a ::after pseudo-element.
//
// Two call styles are supported, both already in use:
//   <Checkbox label="Collect email" ... />        — single-line, self-spacing
//   <Checkbox ...><span>long copy</span></Checkbox> — caller controls spacing
// The `label` form carries a default marginBottom so the settings-modal stack
// keeps its rhythm; the children form does not, because those call sites set
// their own margins and an implicit one would misalign them.

const BORDER = "#d0d5dd";
const ACCENT = "#1e3a6e";

export default function Checkbox({
  label,
  checked,
  onChange,
  disabled = false,
  indeterminate = false,
  align = "flex-start",
  gap = 10,
  style,
  children,
}) {
  const ref = useRef(null);
  const cursor = disabled ? "not-allowed" : "pointer";
  const on = checked || indeterminate;

  // `indeterminate` is a DOM property, not an attribute — React can't set it
  // declaratively, so it has to be written to the node.
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <label
      style={{
        display: "flex",
        alignItems: align,
        gap,
        cursor,
        opacity: disabled ? 0.5 : 1,
        ...(children ? null : { marginBottom: 12 }),
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
          ref={ref}
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
            border: `1.5px solid ${on ? ACCENT : BORDER}`,
            background: on ? ACCENT : "#fff",
            cursor,
            outline: "none",
            transition:
              "background-color 0.15s, border-color 0.15s, box-shadow 0.15s",
          }}
          onFocus={(e) => (e.target.style.boxShadow = `0 0 0 3px ${ACCENT}22`)}
          onBlur={(e) => (e.target.style.boxShadow = "none")}
        />
        {on && (
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
              d={checked ? "M3.5 8.5l3 3 6-6" : "M3.5 8h9"}
              fill="none"
              stroke="#fff"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      {children ?? (
        <span
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: "14px",
            color: "#1d2939",
            lineHeight: 1.4,
          }}
        >
          {label}
        </span>
      )}
    </label>
  );
}
