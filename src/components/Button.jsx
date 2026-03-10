export default function Button({ children, onClick, variant = "primary", disabled = false, style = {} }) {
  const base = { padding: "14px 28px", borderRadius: "10px", border: "none", fontFamily: "'Outfit', sans-serif", fontWeight: 600, fontSize: "15px", cursor: disabled ? "not-allowed" : "pointer", transition: "all 0.2s ease", opacity: disabled ? 0.5 : 1, width: "100%", ...style };
  const variants = {
    primary: { background: "#1e3a6e", color: "#fff" },
    secondary: { background: "#f0f2f5", color: "#1e3a6e" },
    coral: { background: "#e07850", color: "#fff" },
    outline: { background: "transparent", color: "#1e3a6e", border: "2px solid #d0d5dd" },
    ghost: { background: "transparent", color: "#667085", padding: "8px 16px" },
    danger: { background: "#fef3f2", color: "#b42318", border: "1.5px solid #fecdca" },
    success: { background: "#e8f5e9", color: "#2e7d32", border: "1.5px solid #c8e6c9" },
  };
  return <button onClick={onClick} disabled={disabled} style={{ ...base, ...variants[variant] }}>{children}</button>;
}
