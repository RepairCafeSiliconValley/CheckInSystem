import { Link } from "react-router-dom";
import Logo from "./Logo";

// Full-page placeholder while a portal checks for an existing session.
export function PortalLoading() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f5f6f8",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <p style={{ fontFamily: "'Outfit', sans-serif", color: "#667085" }}>
        Loading...
      </p>
    </div>
  );
}

// Shared frame for the signed-in portals (/queue and /admin): a header with
// the logo, who is signed in, a link across to the other portal and Logout,
// an optional banner under it, the page content, and a bottom tab bar
// (zIndex 100) when there is more than one tab.
export default function PortalShell({
  tabs = [],
  activeTab,
  onTabChange,
  identity,
  crossLink,
  onLogout,
  banner,
  children,
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f5f6f8",
        fontFamily: "'Outfit', sans-serif",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderBottom: "1px solid #e8ebf0",
          padding: "10px 16px",
        }}
      >
        <div
          style={{
            maxWidth: 640,
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Logo size="tiny" />
          <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
            {identity && (
              <span
                title={identity}
                style={{
                  fontFamily: "'Outfit', sans-serif",
                  fontSize: "12px",
                  color: "#667085",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: 160,
                }}
              >
                {identity}
              </span>
            )}
            {crossLink && (
              <Link
                to={crossLink.to}
                style={{
                  fontFamily: "'Outfit', sans-serif",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#1e3a6e",
                  textDecoration: "none",
                }}
              >
                {crossLink.label}
              </Link>
            )}
            <button
              onClick={onLogout}
              title="Signs out of both /queue and /admin on this device"
              style={{
                background: "none",
                border: "none",
                fontFamily: "'Outfit', sans-serif",
                fontSize: "12px",
                color: "#98a2b3",
                cursor: "pointer",
              }}
            >
              👋 Logout
            </button>
          </div>
        </div>
      </div>

      {banner}

      <div
        style={{ maxWidth: 640, margin: "0 auto", padding: "16px 16px 100px" }}
      >
        {children}
      </div>

      {tabs.length > 1 && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            background: "#fff",
            borderTop: "1px solid #e8ebf0",
            display: "flex",
            justifyContent: "center",
            padding: "8px 0 env(safe-area-inset-bottom, 12px)",
            zIndex: 100,
          }}
        >
          <div
            style={{
              display: "flex",
              maxWidth: 640,
              width: "100%",
              justifyContent: "space-around",
            }}
          >
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => onTabChange(t.key)}
                style={{
                  background: "none",
                  border: "none",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 2,
                  padding: "6px 16px",
                  cursor: "pointer",
                  opacity: activeTab === t.key ? 1 : 0.45,
                  transition: "opacity 0.15s",
                }}
              >
                <span style={{ fontSize: "20px" }}>{t.icon}</span>
                <span
                  style={{
                    fontFamily: "'Outfit', sans-serif",
                    fontSize: "11px",
                    fontWeight: activeTab === t.key ? 700 : 500,
                    color: activeTab === t.key ? "#1e3a6e" : "#667085",
                    letterSpacing: "0.3px",
                  }}
                >
                  {t.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
