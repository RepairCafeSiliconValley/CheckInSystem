import Logo from "./Logo";
import { useNarrow } from "../lib/useNarrow";

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

// Frame for the signed-in portal: a header with the logo, who is signed in
// and Logout, the page content, and a bottom tab bar (zIndex 100) when there
// is more than one tab.
//
// A `tabs` entry is { key, label, Icon }, `Icon` being a TabIcons component.
export default function PortalShell({
  tabs = [],
  activeTab,
  onTabChange,
  identity,
  onLogout,
  children,
}) {
  // On phones the identity gets its own line under the header row, so the
  // portal link and Logout never wrap and the name isn't cut short.
  const narrow = useNarrow(420);

  const identityText = identity && (
    <span
      title={identity}
      style={{
        fontFamily: "'Outfit', sans-serif",
        fontSize: "12px",
        color: "#667085",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        ...(narrow ? { display: "block", marginTop: 6 } : { maxWidth: 160 }),
      }}
    >
      {identity}
    </span>
  );

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
            {!narrow && identityText}
            <button
              onClick={onLogout}
              title="Signs out of the portal on this device, and is the only way to lock it. On a shared device, also sign out of Google in this browser."
              style={{
                background: "none",
                border: "none",
                fontFamily: "'Outfit', sans-serif",
                fontSize: "12px",
                color: "#98a2b3",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              👋 Logout
            </button>
          </div>
        </div>
        {narrow && identityText && (
          <div style={{ maxWidth: 640, margin: "0 auto" }}>{identityText}</div>
        )}
      </div>

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
            {tabs.map((t) => {
              // The bar stays the header's white so the page reads as one
              // frame; the contrast lives in the selected tab, a navy filled
              // pill. Same colours as the queue's filter chips
              // (CoordinatorQueue), which are the other tabs on that screen.
              // Icons are line drawings taking CSS `color`, so they go white
              // on the pill and grey beside it (TabIcons).
              const active = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => onTabChange(t.key)}
                  aria-current={active ? "page" : undefined}
                  style={{
                    background: active ? "#1e3a6e" : "none",
                    border: "none",
                    borderRadius: 10,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 2,
                    padding: "6px 14px",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      color: active ? "#fff" : "#667085",
                    }}
                  >
                    <t.Icon />
                  </span>
                  <span
                    style={{
                      fontFamily: "'Outfit', sans-serif",
                      fontSize: "11px",
                      fontWeight: active ? 700 : 500,
                      color: active ? "#fff" : "#667085",
                      letterSpacing: "0.3px",
                    }}
                  >
                    {t.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
