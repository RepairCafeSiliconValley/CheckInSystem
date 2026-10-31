import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import CheckIn from "./pages/CheckIn";
import Portal from "./pages/Portal";
import FixerSubmit from "./pages/FixerSubmit";
import ClaimWorkOrder from "./pages/ClaimWorkOrder";
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
      <Route path="/claim/:id" element={<ClaimWorkOrder />} />
      <Route path="/fix/:id" element={<FixerSubmit />} />
      {/* One portal for volunteers and admins. /admin is the canonical path
          because signInWithGoogle() redirects back to it. */}
      <Route path="/admin" element={<Portal />} />
      <Route path="/queue" element={<QueueRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
