export default function Select({ label, value, onChange, options, placeholder, required = false }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontFamily: "'Outfit', sans-serif", fontSize: "13px", fontWeight: 600, color: "#344054", marginBottom: 6, letterSpacing: "0.3px" }}>{label}{required && <span style={{ color: "#e07850" }}> *</span>}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", padding: "12px 14px", borderRadius: "10px", border: "1.5px solid #d0d5dd", fontFamily: "'Outfit', sans-serif", fontSize: "15px", color: value ? "#1d2939" : "#98a2b3", background: "#fff", boxSizing: "border-box", outline: "none", appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%23667085' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 14px center" }}>
        <option value="" disabled>{placeholder}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
