export default function Badge({ text, color = "#1e3a6e" }) {
  return <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: "6px", background: color + "15", color: color, fontFamily: "'Space Mono', monospace", fontSize: "12px", fontWeight: 700, letterSpacing: "0.5px" }}>{text}</span>;
}
