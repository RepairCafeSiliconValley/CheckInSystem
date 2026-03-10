export default function TextArea({ label, value, onChange, placeholder, required = false, rows = 3 }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontFamily: "'Outfit', sans-serif", fontSize: "13px", fontWeight: 600, color: "#344054", marginBottom: 6, letterSpacing: "0.3px" }}>{label}{required && <span style={{ color: "#e07850" }}> *</span>}</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows}
        style={{ width: "100%", padding: "12px 14px", borderRadius: "10px", border: "1.5px solid #d0d5dd", fontFamily: "'Outfit', sans-serif", fontSize: "15px", color: "#1d2939", background: "#fff", boxSizing: "border-box", outline: "none", resize: "vertical", transition: "border-color 0.2s" }}
        onFocus={(e) => (e.target.style.borderColor = "#1e3a6e")} onBlur={(e) => (e.target.style.borderColor = "#d0d5dd")} />
    </div>
  );
}
