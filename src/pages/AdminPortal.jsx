import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AdminLoginGate from "../components/AdminLoginGate";
import PortalShell, { PortalLoading } from "../components/PortalShell";
import Admin from "./Admin";
import AdminAllowlist from "./AdminAllowlist";
import AdminUsers from "./AdminUsers";
import { CalendarIcon, EnvelopeIcon, PeopleIcon } from "../components/TabIcons";
import {
  getAccess,
  getAuthRedirectError,
  clearAuthRedirectParams,
  signOut,
} from "../lib/store";

const QUEUE_LINK = { to: "/queue", label: "Queue →" };

const TABS = [
  { key: "events", label: "Events", Icon: CalendarIcon },
  { key: "allowlist", label: "Allowlist", Icon: EnvelopeIcon },
  { key: "users", label: "Users", Icon: PeopleIcon },
];

// /admin: event management and admin accounts, for admins only (a personal
// Google login whose email was allowlisted; see docs/admin-auth-plan.md).
// Anyone else gets AdminLoginGate. RLS enforces the same rule on the data.
export default function AdminPortal() {
  const navigate = useNavigate();
  const [access, setAccess] = useState(null); // null while checking
  const [activeTab, setActiveTab] = useState("events");
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
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      identity={`${access.name} (admin)`}
      crossLink={QUEUE_LINK}
      onLogout={handleLock}
    >
      {activeTab === "events" && (
        <Admin
          onViewMetrics={(id) => navigate(`/queue?tab=metrics&event=${id}`)}
        />
      )}
      {activeTab === "allowlist" && <AdminAllowlist />}
      {activeTab === "users" && <AdminUsers currentUserId={access.id} />}
    </PortalShell>
  );
}
