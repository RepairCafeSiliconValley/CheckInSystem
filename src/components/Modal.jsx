import { useEffect } from "react";

export default function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKeyDown = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    // zIndex clears the StaffPortal bottom tab bar, which sits at 100.
    <div onClick={onClose} style={{ position: "fixed", top: 0, right: 0, bottom: 0, left: 0, background: "rgba(16,24,40,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", zIndex: 200 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: "14px", border: "1px solid #e8ebf0", padding: "20px", width: "100%", maxWidth: "420px", maxHeight: "85vh", overflowY: "auto", boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "15px", fontWeight: 700, color: "#1d2939", margin: 0 }}>{title}</h3>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", padding: 0, fontSize: "20px", lineHeight: 1, color: "#667085", cursor: "pointer" }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
