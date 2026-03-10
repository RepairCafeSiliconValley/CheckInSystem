export default function Logo({ size = "normal" }) {
  const h = size === "small" ? "28px" : size === "tiny" ? "20px" : "44px";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size === "small" || size === "tiny" ? 8 : 12 }}>
      <div style={{ lineHeight: 1 }}>
        <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: h, letterSpacing: "-1px", lineHeight: 0.9 }}>
          <span style={{ color: "#1e3a6e" }}>REPAIR</span>
        </div>
        <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: h, letterSpacing: "-1px", lineHeight: 0.95 }}>
          <span style={{ color: "#e07850" }}>CAFE</span>
        </div>
        {size === "normal" && (
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "11px", letterSpacing: "3.5px", color: "#1e3a6e", marginTop: 2 }}>SILICON VALLEY</div>
        )}
      </div>
    </div>
  );
}
