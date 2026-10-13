import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AdminLoginGate from "../components/AdminLoginGate";
import PortalShell, { PortalLoading } from "../components/PortalShell";
import Admin from "./Admin";
import {
  getAccess,
  getAuthRedirectError,
  clearAuthRedirectParams,
  signOut,
} from "../lib/store";

const QUEUE_LINK = { to: "/queue", label: "Queue →" };

// /admin: event management, for admins only (a personal Google login whose
// email was allowlisted; see docs/admin-auth-plan.md). Anyone else gets
// AdminLoginGate. RLS enforces the same rule on the data.
export default function AdminPortal() {
  const navigate = useNavigate();
  const [access, setAccess] = useState(null); // null while checking
  const redirectError = getAuthRedirectError();

  useEffect(() => {
    clearAuthRedirectParams();
    getAccess()
      .then(setAccess)
      .catch((err) => {
        console.error("Failed to check access:", err);
        setAccess({ level: "signed-out" });
      });
  }, []);

  const handleLock = async () => {
    await signOut();
    setAccess({ level: "signed-out" });
  };

  if (!access) return <PortalLoading />;

  if (access.level !== "admin") {
    return (
      <AdminLoginGate
        access={access}
        error={redirectError}
        crossLink={QUEUE_LINK}
        onSignOut={handleLock}
      />
    );
  }

  return (
    <PortalShell
      identity={`${access.name} (admin)`}
      crossLink={QUEUE_LINK}
      onLogout={handleLock}
    >
      <Admin
        onViewMetrics={(id) => navigate(`/queue?tab=metrics&event=${id}`)}
      />
    </PortalShell>
  );
}
