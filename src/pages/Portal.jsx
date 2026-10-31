import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import SignInGate from "../components/SignInGate";
import Card from "../components/Card";
import Button from "../components/Button";
import PortalShell, { PortalLoading } from "../components/PortalShell";
import PrintTickets from "../components/PrintTickets";
import CoordinatorQueue from "./CoordinatorQueue";
import CoordinatorVisitorDetail from "./CoordinatorVisitorDetail";
import Metrics from "./Metrics";
import Events from "./Events";
import AdminAccounts from "./AdminAccounts";
import {
  ClipboardIcon,
  ChartIcon,
  CalendarIcon,
  PeopleIcon,
} from "../components/TabIcons";
import {
  getAccess,
  getAuthRedirectError,
  clearAuthRedirectParams,
  signOut,
  fetchEvents,
  fetchVisitorDetail,
} from "../lib/store";
import { submittedStamp } from "../lib/metrics";
import { isTextablePhone } from "../lib/textMessage";

// Every tab the portal has. The volunteer account gets the two that aren't
// adminOnly; an admin gets all four, in one bar, with no sign-in between them.
const TABS = [
  { key: "queue", label: "Queue", Icon: ClipboardIcon, adminOnly: false },
  { key: "metrics", label: "Metrics", Icon: ChartIcon, adminOnly: false },
  { key: "events", label: "Events", Icon: CalendarIcon, adminOnly: true },
  { key: "admins", label: "Admins", Icon: PeopleIcon, adminOnly: true },
];

// Shown on the Queue tab when no event could be chosen: the events fetch
// failed (error is its message) or there are no events yet (error is null).
function EventsUnavailable({ error, onRetry, isAdmin }) {
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
          : isAdmin
            ? "Create one on the Events tab."
            : "An admin can create one on the Events tab."}
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

// /admin: the one portal. The shared volunteer account and an enabled admin
// both sign in here (SignInGate offers both); which tabs exist is decided by
// the session, and RLS enforces the same split on the data. `?tab=` and
// `?event=` only seed the initial state, so the old
// /queue?tab=metrics&event=<id> deep link still works through the redirect.
export default function Portal() {
  const [searchParams] = useSearchParams();
  const [access, setAccess] = useState(null); // null while checking
  const isAdmin = access?.level === "admin";
  const authed = isAdmin || access?.level === "volunteer";
  // The tab asked for, which isn't necessarily one this session may have.
  const [requestedTab, setRequestedTab] = useState(
    searchParams.get("tab") || "queue",
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
  const redirectError = getAuthRedirectError();

  // Hiding a tab isn't enough — a volunteer typing ?tab=admins must land on
  // the Queue. Resolving it on every render also re-clamps if the session
  // changes under us, and needs no effect to keep in step.
  const visibleTabs = isAdmin ? TABS : TABS.filter((t) => !t.adminOnly);
  const activeTab = visibleTabs.some((t) => t.key === requestedTab)
    ? requestedTab
    : "queue";

  // Check the existing session on mount. Any other signed-in session (a
  // disabled admin, a non-admin login) gets the sign-in gate.
  useEffect(() => {
    clearAuthRedirectParams();
    getAccess()
      .then(setAccess)
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

  const openTab = (key, eventId) => {
    if (eventId) setSelectedEventId(eventId);
    setSelectedVisitorId(null);
    setRequestedTab(key);
  };

  const handleLogout = async () => {
    await signOut();
    setAccess({ level: "signed-out" });
    setSelectedVisitorId(null);
    setPrintingVisitorId(null);
    setPrintData(null);
  };

  const handlePrint = async (attId) => {
    try {
      const { attendee, orders, event } = await fetchVisitorDetail(attId);
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
        // Whether the ticket's text pill promises a text. Same three gates the
        // Edge Function applies at claim time, in the same order. Drawn from the
        // visitor's own event rather than the selected tab, so a reprint for
        // someone from another event still gets it right.
        //
        // This is a snapshot: the ticket is printed at check-in but the text is
        // sent at claim time, so editing the phone or flipping the event setting
        // in between leaves the printed pill stale.
        canTextClient:
          Boolean(event?.collect_phone) &&
          Boolean(attendee.text_message_opt_in) &&
          isTextablePhone(attendee.phone),
      });
      setPrintingVisitorId(attId);
    } catch (err) {
      console.error("Failed to load print data:", err);
    }
  };

  if (!access) return <PortalLoading />;

  if (!authed) {
    return (
      <SignInGate
        access={access}
        error={redirectError}
        onUnlock={() => setAccess({ level: "volunteer" })}
        onSignOut={handleLogout}
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
            canTextClient={printData.canTextClient}
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
      tabs={visibleTabs}
      activeTab={activeTab}
      onTabChange={(key) => openTab(key)}
      identity={isAdmin ? `${access.name} (admin)` : "Volunteer account"}
      onLogout={handleLogout}
    >
      {activeTab === "queue" && !selectedVisitorId && eventsUnavailable && (
        <EventsUnavailable
          error={eventsError}
          onRetry={retryEvents}
          isAdmin={isAdmin}
        />
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
          onOpenQueueForEvent={(id) => openTab("queue", id)}
        />
      )}
      {activeTab === "events" && (
        // "View metrics" is now a tab switch, not a trip to another URL.
        <Events onViewMetrics={(id) => openTab("metrics", id)} />
      )}
      {activeTab === "admins" && <AdminAccounts currentUserId={access.id} />}
    </PortalShell>
  );
}
