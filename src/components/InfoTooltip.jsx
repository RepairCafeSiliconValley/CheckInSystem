import { useEffect, useRef, useState } from "react";

// Small "i" affordance that reveals explanatory content.
//
// Click-to-toggle rather than hover-only: the admin screens get used on
// tablets at the check-in desk, where there is no hover. Hover is layered on
// top as an enhancement for mouse users.

export default function InfoTooltip({
  label = "More information",
  disabled = false,
  children,
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const wrapRef = useRef(null);

  // Dismiss on Escape or a click elsewhere, so a tapped tooltip isn't sticky.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => e.key === "Escape" && setOpen(false);
    const onPointerDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  // When disabled the icon stays visible (so the layout doesn't shift and the
  // affordance is still legible) but neither hover nor click reveals anything.
  const visible = !disabled && (open || hovered);

  return (
    <span
      ref={wrapRef}
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => !disabled && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={visible}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 16,
          height: 16,
          padding: 0,
          borderRadius: "50%",
          border: "none",
          background: visible ? "#1e3a6e" : "#98a2b3",
          color: "#fff",
          cursor: disabled ? "default" : "pointer",
          transition: "background-color 0.15s",
        }}
      >
        <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor" aria-hidden="true" focusable="false">
          <circle cx="8" cy="4" r="1.15" />
          <rect x="7" y="6.5" width="2" height="6" rx="1" />
        </svg>
      </button>

      {visible && (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 300,
            minWidth: 240,
            maxWidth: 300,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #e8ebf0",
            background: "#fff",
            boxShadow: "0 8px 20px rgba(16,24,40,0.12)",
            fontFamily: "'Outfit', sans-serif",
            fontSize: "12px",
            lineHeight: 1.5,
            color: "#344054",
            textAlign: "left",
            whiteSpace: "normal",
            cursor: "default",
          }}
        >
          {children}
        </span>
      )}
    </span>
  );
}
