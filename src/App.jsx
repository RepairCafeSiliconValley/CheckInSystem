import { Routes, Route, Navigate } from "react-router-dom";
import CheckIn from "./pages/CheckIn";
import StaffPortal from "./pages/StaffPortal";
import FixerSubmit from "./pages/FixerSubmit";
import ClaimWorkOrder from "./pages/ClaimWorkOrder";
import Landing from "./pages/Landing";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/checkin" element={<CheckIn />} />
      <Route path="/claim/:id" element={<ClaimWorkOrder />} />
      <Route path="/fix/:id" element={<FixerSubmit />} />
      <Route path="/admin" element={<StaffPortal />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
