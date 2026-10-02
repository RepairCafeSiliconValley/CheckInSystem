import { STATUSES } from "../lib/constants";

// Labels come from STATUSES so the queue, metrics and badges never disagree.
const MAP = Object.fromEntries(STATUSES.map((s) => [s.key, s]));

export default function StatusBadge({ status }) {
  const s = MAP[status] || MAP.pending;
  return <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: "6px", background: s.bg, color: s.color, fontFamily: "'Outfit', sans-serif", fontSize: "11px", fontWeight: 700, letterSpacing: "0.3px" }}>{s.label}</span>;
}
