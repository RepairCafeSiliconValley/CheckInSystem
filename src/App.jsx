import { Routes, Route, Navigate } from "react-router-dom";
import CheckIn from "./pages/CheckIn";
import StaffPortal from "./pages/StaffPortal";

export default function App() {
  return (
    <Routes>
      <Route path="/checkin" element={<CheckIn />} />
      <Route path="/staff" element={<StaffPortal />} />
      <Route path="*" element={<Navigate to="/staff" replace />} />
    </Routes>
  );
}
