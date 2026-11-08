import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import CheckIn from "./pages/CheckIn";
import Portal from "./pages/Portal";
import Ticket from "./pages/Ticket";
import Landing from "./pages/Landing";

// /queue was its own portal until the tabs merged into one. It stays as a
// redirect for bookmarks, carrying the query string over so the old
// /queue?tab=metrics&event=<id> deep link still lands on the right tab.
function QueueRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/admin${search}`} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/checkin" element={<CheckIn />} />
      {/* /T/:code is what tickets print now: a short upper-case code so the
          QR can be smaller (see src/lib/ticketLink.js). Routes match either
          case.

          /fix/:id and /claim/:id take the full work-order UUID. KEEP THESE
          FOREVER: tickets printed by PROD before the short code carry
          /fix/<uuid> (and older ones /claim/<uuid>) in a QR code, on paper
          that stays in circulation, and deleting either path bricks those
          slips. They are also how you open a ticket from a full id you
          already have in hand (the queue, a CSV export, a log), which
          /T/:code cannot do: resolve_ticket_code() wants exactly 16 hex
          digits. Postgres takes the id dashed or not, in either case, so it
          can be pasted in whatever shape it arrives. They render the ticket
          page directly rather than redirecting, so the URL a fixer scanned
          stays in the address bar. */}
      <Route path="/T/:code" element={<Ticket />} />
      <Route path="/fix/:id" element={<Ticket />} />
      <Route path="/claim/:id" element={<Ticket />} />
      {/* One portal for volunteers and admins. /admin is the canonical path
          because signInWithGoogle() redirects back to it. */}
      <Route path="/admin" element={<Portal />} />
      <Route path="/queue" element={<QueueRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
