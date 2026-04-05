import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Logo from "../components/Logo";
import PasswordGate from "../components/PasswordGate";
import PrintTickets from "../components/PrintTickets";
import CoordinatorQueue from "./CoordinatorQueue";
import CoordinatorVisitorDetail from "./CoordinatorVisitorDetail";
import Admin from "./Admin";
import {
  getSession,
  signOut,
  fetchEvents,
  fetchVisitorDetail,
} from "../lib/store";

export default function StaffPortal() {
  const [authed, setAuthed] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [staffTab, setStaffTab] = useState("queue");
  const [selectedVisitorId, setSelectedVisitorId] = useState(null);
  const [printingVisitorId, setPrintingVisitorId] = useState(null);
  const [printData, setPrintData] = useState(null);
  const [selectedEventId, setSelectedEventId] = useState("");

  // Check existing session on mount
  useEffect(() => {
    getSession().then((session) => {
      if (session) setAuthed(true);
      setCheckingSession(false);
    });
  }, []);

  // Load events to set default selection
  useEffect(() => {
    if (!authed) return;
    fetchEvents().then((events) => {
      if (events.length > 0 && !selectedEventId) {
        // Default to today's event or most recent
        const today = new Date().toISOString().split("T")[0];
        const todayEvent = events.find((e) => e.date === today);
        setSelectedEventId(todayEvent?.id || events[0].id);
      }
    });
  }, [authed]);

  const handleLock = async () => {
    await signOut();
    setAuthed(false);
    setSelectedVisitorId(null);
    setPrintingVisitorId(null);
    setPrintData(null);
  };

  const handlePrint = async (attId) => {
    try {
      const { attendee, orders } = await fetchVisitorDetail(attId);
      const printableOrders = orders.filter(
        (w) =>
          w.status === "reviewed" ||
          w.status === "in-progress" ||
          w.status === "pending",
      );
      setPrintData({ orders: printableOrders, attendeeName: attendee.name, isVolunteer: attendee.is_volunteer });
      setPrintingVisitorId(attId);
    } catch (err) {
      console.error("Failed to load print data:", err);
    }
  };

  if (checkingSession) {
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

  // Password gate
  if (!authed) {
    return (
      <div>
        <PasswordGate onUnlock={() => setAuthed(true)} />
        {/* <div style={{ position: "fixed", bottom: 20, left: 0, right: 0, textAlign: "center" }}>
          <Link to="/checkin" style={{ background: "none", border: "none", fontFamily: "'Outfit', sans-serif", fontSize: "12px", color: "#98a2b3", cursor: "pointer", textDecoration: "none" }}>← Back to Check-In</Link>
        </div> */}
      </div>
    );
  }

  // Print view
  if (printingVisitorId && printData) {
    // Find event name
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#f5f6f8",
          fontFamily: "'Outfit', sans-serif",
        }}
      >
        <div style={{ maxWidth: 500, margin: "0 auto", padding: "20px 16px" }}>
          <PrintTickets
            workOrders={printData.orders}
            attendeeName={printData.attendeeName}
            isVolunteer={printData.isVolunteer}
            eventName=""
            onClose={() => {
              setPrintingVisitorId(null);
              setPrintData(null);
            }}
          />
        </div>
      </div>
    );
  }

  // Authenticated staff view
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
            maxWidth: 540,
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Logo size="tiny" />
          <button
            onClick={handleLock}
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

      <div
        style={{ maxWidth: 540, margin: "0 auto", padding: "16px 16px 100px" }}
      >
        {staffTab === "queue" && !selectedVisitorId && (
          <CoordinatorQueue
            selectedEventId={selectedEventId}
            onEventChange={(id) => {
              setSelectedEventId(id);
              setSelectedVisitorId(null);
            }}
            onSelectVisitor={(id) => setSelectedVisitorId(id)}
          />
        )}
        {staffTab === "queue" && selectedVisitorId && (
          <CoordinatorVisitorDetail
            attendeeId={selectedVisitorId}
            onBack={() => setSelectedVisitorId(null)}
            onPrint={handlePrint}
          />
        )}
        {staffTab === "admin" && <Admin />}
      </div>

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
            maxWidth: 540,
            width: "100%",
            justifyContent: "space-around",
          }}
        >
          {[
            { key: "queue", label: "Queue", icon: "📋" },
            { key: "admin", label: "Admin", icon: "⚙️" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setStaffTab(t.key);
                setSelectedVisitorId(null);
              }}
              style={{
                background: "none",
                border: "none",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                padding: "6px 16px",
                cursor: "pointer",
                opacity: staffTab === t.key ? 1 : 0.45,
                transition: "opacity 0.15s",
              }}
            >
              <span style={{ fontSize: "20px" }}>{t.icon}</span>
              <span
                style={{
                  fontFamily: "'Outfit', sans-serif",
                  fontSize: "11px",
                  fontWeight: staffTab === t.key ? 700 : 500,
                  color: staffTab === t.key ? "#1e3a6e" : "#667085",
                  letterSpacing: "0.3px",
                }}
              >
                {t.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
