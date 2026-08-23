export default function Checkbox({ label, checked, onChange, disabled = false }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)}
        style={{ width: 18, height: 18, accentColor: "#1e3a6e", cursor: disabled ? "not-allowed" : "pointer", flexShrink: 0 }} />
      <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: "14px", color: "#1d2939", lineHeight: 1.4 }}>{label}</span>
    </label>
  );
}
