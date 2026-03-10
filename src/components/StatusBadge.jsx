export default function StatusBadge({ status }) {
  const map = {
    pending: { label: "Pending Review", color: "#b54708", bg: "#fef6ee" },
    reviewed: { label: "Ready for Board", color: "#1e3a6e", bg: "#eef2f8" },
    "in-progress": { label: "With Fixer", color: "#6941c6", bg: "#f4f3ff" },
    completed: { label: "Completed", color: "#2e7d32", bg: "#e8f5e9" },
  };
  const s = map[status] || map.pending;
  return <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: "6px", background: s.bg, color: s.color, fontFamily: "'Outfit', sans-serif", fontSize: "11px", fontWeight: 700, letterSpacing: "0.3px" }}>{s.label}</span>;
}
