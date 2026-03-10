export default function Card({ children, style = {}, onClick }) {
  return (
    <div onClick={onClick} style={{ background: "#fff", borderRadius: "14px", border: "1px solid #e8ebf0", padding: "20px", cursor: onClick ? "pointer" : "default", transition: onClick ? "box-shadow 0.15s ease" : "none", ...style }}
      onMouseEnter={(e) => { if (onClick) e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)"; }}
      onMouseLeave={(e) => { if (onClick) e.currentTarget.style.boxShadow = "none"; }}>
      {children}
    </div>
  );
}
