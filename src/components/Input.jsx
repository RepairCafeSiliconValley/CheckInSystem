export default function Input({ label, value, onChange, onBlur, placeholder, type = "text", required = false }) {
  return (
    <div style={{ marginBottom: 16 }}>
      {label && <label style={{ display: "block", fontFamily: "'Outfit', sans-serif", fontSize: "13px", fontWeight: 600, color: "#344054", marginBottom: 6, letterSpacing: "0.3px" }}>{label}{required && <span style={{ color: "#e07850" }}> *</span>}</label>}
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: "100%", padding: "12px 14px", borderRadius: "10px", border: "1.5px solid #d0d5dd", fontFamily: "'Outfit', sans-serif", fontSize: "15px", color: "#1d2939", background: "#fff", boxSizing: "border-box", outline: "none", transition: "border-color 0.2s" }}
        onFocus={(e) => (e.target.style.borderColor = "#1e3a6e")}
        onBlur={(e) => { e.target.style.borderColor = "#d0d5dd"; onBlur?.(); }} />
    </div>
  );
}
