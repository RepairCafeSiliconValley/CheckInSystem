import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import PasswordGate from "../components/PasswordGate";
import Card from "../components/Card";
import Button from "../components/Button";
import PortalShell, { PortalLoading } from "../components/PortalShell";
import PrintTickets from "../components/PrintTickets";
import CoordinatorQueue from "./CoordinatorQueue";
import CoordinatorVisitorDetail from "./CoordinatorVisitorDetail";
import Metrics from "./Metrics";
import { ClipboardIcon, ChartIcon } from "../components/TabIcons";
import {
  getAccess,
  signOut,
  fetchEvents,
  fetchVisitorDetail,
} from "../lib/store";
import { submittedStamp } from "../lib/metrics";
import { lockAdmin } from "../lib/adminUnlock";

const TABS = [
  { key: "queue", label: "Queue", Icon: ClipboardIcon },
  { key: "metrics", label: "Metrics", Icon: ChartIcon },
];

const ADMIN_LINK = { to: "/admin", label: "Admin →" };

// Shown on the Queue tab when no event could be chosen: the events fetch
// failed (error is its message) or there are no events yet (error is null).
function EventsUnavailable({ error, onRetry }) {
  return (
    <Card style={{ textAlign: "center" }}>
      <p
        style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: "15px",
          fontWeight: 600,
          color: "#1d2939",
          margin: "0 0 6px 0",
        }}
      >
        {error ? "Couldn't load events" : "No events yet"}
      </p>
      <p
        style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: "13px",
          color: "#667085",
          margin: "0 0 14px 0",
          lineHeight: 1.5,
        }}
      >
        {error
          ? "Check your connection, then please try again."
          : "An admin can create one in the Admin portal."}
      </p>
      {error && (
        <div
          style={{
            padding: "8px 12px",
            background: "#fef3f2",
            borderRadius: "8px",
            marginBottom: 14,
            fontFamily: "'Outfit', sans-serif",
            fontSize: "13px",
            color: "#b42318",
            wordBreak: "break-word",
          }}
        >
          {error}
        </div>
      )}
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </Card>
  );
}

// /queue: the volunteer portal (Queue and Metrics), for the shared volunteer
// account or an enabled admin. An admin session opening /queue re-locks
// /admin (lib/adminUnlock), so a device left on the queue doesn't leave the
// admin pages open. Admin's "View metrics" deep-links here as
// /queue?tab=metrics&event=<id>; both params only seed the initial state.
export default function QueuePortal() {
  const [searchParams] = useSearchParams();
  const [access, setAccess] = useState(null); // null while checking
  const authed = access?.level === "volunteer" || access?.level === "admin";
  const [activeTab, setActiveTab] = useState(
    searchParams.get("tab") === "metrics" ? "metrics" : "queue",
  );
  const [selectedVisitorId, setSelectedVisitorId] = useState(null);
  const [printingVisitorId, setPrintingVisitorId] = useState(null);
  const [printData, setPrintData] = useState(null);
  const [selectedEventId, setSelectedEventId] = useState(
    searchParams.get("event") || "",
  );
  const [eventsError, setEventsError] = useState(null);
  const [noEvents, setNoEvents] = useState(false);
  const [eventsAttempt, setEventsAttempt] = useState(0);

  // Check the existing session on mount. Any other signed-in session (a
  // disabled admin, a non-admin login) gets the password gate.
  useEffect(() => {
    getAccess()
      .then((a) => {
        if (a.level === "admin") lockAdmin();
        setAccess(a);
      })
      .catch((err) => {
        console.error("Failed to check access:", err);
        setAccess({ level: "signed-out" });
      });
  }, []);

  // Default to today's event, else the most recent, unless one was already
  // chosen (e.g. by the ?event= link). Until an event is chosen the queue
  // can't load, so a failed fetch or an empty events table must show a
  // message here; otherwise the queue sits on "Loading queue..." forever.
  // eventsAttempt re-runs the fetch when the volunteer taps Try again.
  useEffect(() => {
    if (!authed) return;
    fetchEvents()
      .then((events) => {
        if (events.length === 0) {
          setNoEvents(true);
          return;
        }
        const today = new Date().toISOString().split("T")[0];
        const todayEvent = events.find((e) => e.date === today);
        setSelectedEventId((current) => current || todayEvent?.id || events[0].id);
      })
      .catch((err) => {
        console.error("Failed to load events:", err);
        // PostgrestError carries a message, usually a code, and the HTTP
        // status (added by fetchAllPages); a network failure has status 0.
        const extra = [
          err?.status ? `HTTP ${err.status}` : null,
          err?.code || null,
        ].filter(Boolean);
        const detail = err?.message || String(err);
        setEventsError(extra.length ? `${detail} (${extra.join(", ")})` : detail);
      });
  }, [authed, eventsAttempt]);

  const retryEvents = () => {
    setEventsError(null);
    setNoEvents(false);
    setEventsAttempt((n) => n + 1);
  };

  const handleLock = async () => {
    await signOut();
    setAccess({ level: "signed-out" });
    setSelectedVisitorId(null);
    setPrintingVisitorId(null);
    setPrintData(null);
  };

  const handlePrint = async (attId) => {
    try {
      const { attendee, orders } = await fetchVisitorDetail(attId);
      const printableOrders = orders.filter(
        (w) =>
          w.status === "pending_assignment" ||
          w.status === "pending",
      );
      const abbreviated = attendee.last_name
        ? `${attendee.first_name} ${attendee.last_name.charAt(0).toUpperCase()}.`
        : attendee.first_name;
      setPrintData({
        orders: printableOrders,
        attendeeName: abbreviated,
        isVolunteer: attendee.is_volunteer,
        // Resolved from the whole visit, not per item, so every ticket carries
        // the same time the queue card shows.
        submittedAt: submittedStamp(attendee, orders),
      });
      setPrintingVisitorId(attId);
    } catch (err) {
      console.error("Failed to load print data:", err);
    }
  };

  if (!access) return <PortalLoading />;

  if (!authed) {
    return (
      <PasswordGate
        title="Volunteer Access"
        crossLink={ADMIN_LINK}
        onUnlock={() => setAccess({ level: "volunteer" })}
      />
    );
  }

  // Print view
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
            submittedAt={printData.submittedAt}
            onClose={() => {
              setPrintingVisitorId(null);
              setPrintData(null);
            }}
          />
        </div>
      </div>
    );
  }

  // An event from ?event= still loads the queue even if the events list failed.
  const eventsUnavailable = !selectedEventId && (eventsError || noEvents);

  return (
    <PortalShell
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={(key) => {
        setActiveTab(key);
        setSelectedVisitorId(null);
      }}
      identity={access.level === "admin" ? `${access.name} (admin)` : "Volunteer account"}
      crossLink={ADMIN_LINK}
      onLogout={handleLock}
    >
      {activeTab === "queue" && !selectedVisitorId && eventsUnavailable && (
        <EventsUnavailable error={eventsError} onRetry={retryEvents} />
      )}
      {activeTab === "queue" && !selectedVisitorId && !eventsUnavailable && (
        <CoordinatorQueue
          // Remount on retry so its own events list (the selector) reloads too.
          key={eventsAttempt}
          selectedEventId={selectedEventId}
          onEventChange={(id) => {
            setSelectedEventId(id);
            setSelectedVisitorId(null);
          }}
          onSelectVisitor={(id) => setSelectedVisitorId(id)}
        />
      )}
      {activeTab === "queue" && selectedVisitorId && (
        <CoordinatorVisitorDetail
          attendeeId={selectedVisitorId}
          onBack={() => setSelectedVisitorId(null)}
          onPrint={handlePrint}
        />
      )}
      {activeTab === "metrics" && (
        // Metrics owns its own scope (it can span a whole year, which the
        // queue can't represent) and only seeds from selectedEventId.
        <Metrics
          initialEventId={selectedEventId}
          onOpenQueueForEvent={(id) => {
            setSelectedEventId(id);
            setSelectedVisitorId(null);
            setActiveTab("queue");
          }}
        />
      )}
    </PortalShell>
  );
}
