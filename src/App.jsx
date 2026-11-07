import {
  Routes,
  Route,
  Navigate,
  useLocation,
  useParams,
} from "react-router-dom";
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

// Claiming and submitting an outcome used to be two pages with a QR code each.
// They are now both /ticket/:id.
//
// KEEP THESE FOREVER. Every ticket printed before the merge carries /claim/:id
// and /fix/:id in a QR code, on paper that stays in circulation. Deleting
// either path bricks those slips with no way to reprint them.
function TicketRedirect() {
  const { id } = useParams();
  return <Navigate to={`/ticket/${id}`} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/checkin" element={<CheckIn />} />
      <Route path="/ticket/:id" element={<Ticket />} />
      <Route path="/claim/:id" element={<TicketRedirect />} />
      <Route path="/fix/:id" element={<TicketRedirect />} />
      {/* One portal for volunteers and admins. /admin is the canonical path
          because signInWithGoogle() redirects back to it. */}
      <Route path="/admin" element={<Portal />} />
      <Route path="/queue" element={<QueueRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
