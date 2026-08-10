// One row of a breakdown: label, count, and a proportional bar.
//
// The workhorse of the Metrics tab — every breakdown section is a list of
// these. Stays a single narrow column at any screen width, which is the whole
// point: no breakdown can grow wide enough to need horizontal scrolling.
//
// Bar geometry follows the shared mark spec: grows from a square baseline with
// a rounded data-end, track is a light step of the same neutral, hairline
// thin. Zero rows dim to 0.4 rather than disappearing, so an empty category
// still reads as "we track this, it's zero" (matches Admin.jsx's existing idiom).
export default function StatBar({
  label,
  count,
  total,
  color = "#1e3a6e",
  right,
  indent = false,
  muted = false,
  onClick,
  expanded,
  children,
}) {
  const width = total > 0 ? Math.max((count / total) * 100, count > 0 ? 1.5 : 0) : 0;
  const dim = count === 0;

  return (
    <div style={{ marginBottom: 10, paddingLeft: indent ? 14 : 0 }}>
      <div
        onClick={onClick}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={(e) => {
          if (onClick && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onClick();
          }
        }}
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          cursor: onClick ? "pointer" : "default",
          opacity: dim ? 0.4 : 1,
        }}
      >
        {onClick && (
          <span
            style={{
              fontSize: "10px",
              color: "#98a2b3",
              width: 9,
              flexShrink: 0,
              transition: "transform 0.15s",
              display: "inline-block",
              transform: expanded ? "rotate(90deg)" : "none",
            }}
          >
            ▶
          </span>
        )}
        <span
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: "13px",
            color: muted ? "#667085" : "#344054",
            flex: 1,
            minWidth: 0,
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: "13px",
            fontWeight: 700,
            color: "#1d2939",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {count}
        </span>
        {right && (
          <span
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: "11px",
              color: "#667085",
              minWidth: 38,
              textAlign: "right",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {right}
          </span>
        )}
      </div>

      <div
        style={{
          height: 6,
          background: "#f0f2f5",
          borderRadius: 3,
          marginTop: 4,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${width}%`,
            background: color,
            borderRadius: "0 3px 3px 0",
            transition: "width 0.25s ease",
          }}
        />
      </div>

      {expanded && children ? <div style={{ marginTop: 10 }}>{children}</div> : null}
    </div>
  );
}
