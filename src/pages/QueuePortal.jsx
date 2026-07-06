import { useState, useEffect } from "react";
import Logo from "../components/Logo";
import PasswordGate from "../components/PasswordGate";
import PrintTickets from "../components/PrintTickets";
import CoordinatorQueue from "./CoordinatorQueue";
import CoordinatorVisitorDetail from "./CoordinatorVisitorDetail";
import usePortalAuth from "../hooks/usePortalAuth";
import {
  signIn,
  QUEUE_EMAIL,
  fetchEvents,
  fetchQueueVisitorDetail,
} from "../lib/store";

// Front-desk portal. Same queue components as the admin portal, but with
// hidePII: attendee names are first name + last initial only, and no email /
// phone / zip is ever fetched or shown (enforced at the DB by RLS). No admin tab.
export default function QueuePortal() {
  const { authed, setAuthed, checkingSession, logout } = usePortalAuth({
    email: QUEUE_EMAIL,
  });
  const [selectedVisitorId, setSelectedVisitorId] = useState(null);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [printingVisitorId, setPrintingVisitorId] = useState(null);
  const [printData, setPrintData] = useState(null);

  // Load events to set default selection (today's event or most recent)
  useEffect(() => {
    if (!authed) return;
    fetchEvents().then((events) => {
      if (events.length > 0 && !selectedEventId) {
        const today = new Date().toISOString().split("T")[0];
        const todayEvent = events.find((e) => e.date === today);
        setSelectedEventId(todayEvent?.id || events[0].id);
      }
    });
  }, [authed]);

  const handleLogout = async () => {
    await logout();
    setSelectedVisitorId(null);
    setPrintingVisitorId(null);
    setPrintData(null);
  };

  const handlePrint = async (attId) => {
    try {
      const { attendee, orders } = await fetchQueueVisitorDetail(attId);
      const printableOrders = orders.filter(
        (w) =>
          w.status === "pending_assignment" || w.status === "pending",
      );
      const name = `${attendee.first_name} ${attendee.last_initial}`.trim();
      setPrintData({
        orders: printableOrders,
        attendeeName: name,
        isVolunteer: attendee.is_volunteer,
      });
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

  if (!authed) {
    return (
      <PasswordGate
        onUnlock={() => setAuthed(true)}
        signIn={(pw) => signIn(pw, QUEUE_EMAIL)}
        title="Front Desk Access"
        subtitle="Enter the front desk password to continue."
      />
    );
  }

  if (printingVisitorId && printData) {
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
            onClose={() => {
              setPrintingVisitorId(null);
              setPrintData(null);
            }}
          />
        </div>
      </div>
    );
  }

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
            onClick={handleLogout}
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

      <div style={{ maxWidth: 540, margin: "0 auto", padding: "16px 16px 40px" }}>
        {!selectedVisitorId ? (
          <CoordinatorQueue
            hidePII
            selectedEventId={selectedEventId}
            onEventChange={(id) => {
              setSelectedEventId(id);
              setSelectedVisitorId(null);
            }}
            onSelectVisitor={(id) => setSelectedVisitorId(id)}
          />
        ) : (
          <CoordinatorVisitorDetail
            hidePII
            attendeeId={selectedVisitorId}
            onBack={() => setSelectedVisitorId(null)}
            onPrint={handlePrint}
          />
        )}
      </div>
    </div>
  );
}
