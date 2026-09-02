import { useEffect, useRef } from "react";

export default function Checkbox({ label, checked, onChange, disabled = false, indeterminate = false, style = {} }) {
  const ref = useRef(null);
  // `indeterminate` is a DOM property, not an attribute — React can't set it
  // declaratively, so it has to be written to the node.
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, ...style }}>
      <input ref={ref} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)}
        style={{ width: 18, height: 18, accentColor: "#1e3a6e", cursor: disabled ? "not-allowed" : "pointer", flexShrink: 0 }} />
      <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: "14px", color: "#1d2939", lineHeight: 1.4 }}>{label}</span>
    </label>
  );
}
