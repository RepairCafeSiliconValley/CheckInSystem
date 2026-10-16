import { Routes, Route, Navigate } from "react-router-dom";
import CheckIn from "./pages/CheckIn";
import QueuePortal from "./pages/QueuePortal";
import AdminPortal from "./pages/AdminPortal";
import FixerSubmit from "./pages/FixerSubmit";
import Landing from "./pages/Landing";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/checkin" element={<CheckIn />} />
      <Route path="/fix/:id" element={<FixerSubmit />} />
      <Route path="/queue" element={<QueuePortal />} />
      <Route path="/admin" element={<AdminPortal />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
