export default function Badge({ text, color = "#1e3a6e", onClick, title, ariaLabel }) {
  const style = { display: "inline-block", padding: "3px 10px", borderRadius: "6px", background: color + "15", color: color, fontFamily: "'Space Mono', monospace", fontSize: "12px", fontWeight: 700, letterSpacing: "0.5px" };
  if (onClick) {
    // inline-flex so an icon child centers and stays flush with text badges.
    return <button onClick={onClick} title={title} aria-label={ariaLabel} style={{ ...style, display: "inline-flex", alignItems: "center", minHeight: "21px", border: "none", cursor: "pointer" }}>{text}</button>;
  }
  return <span style={style}>{text}</span>;
}
