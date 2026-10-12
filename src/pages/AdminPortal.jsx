import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import PasswordGate from "../components/PasswordGate";
import PortalShell, { PortalLoading } from "../components/PortalShell";
import Admin from "./Admin";
import { getSession, signOut } from "../lib/store";

const QUEUE_LINK = { to: "/queue", label: "Queue →" };

// /admin: event management. Still behind the shared volunteer password until
// personal admin logins replace it (docs/admin-auth-plan.md, PR 3).
export default function AdminPortal() {
  const navigate = useNavigate();
  const [authed, setAuthed] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  // Check existing session on mount
  useEffect(() => {
    getSession().then((session) => {
      if (session) setAuthed(true);
      setCheckingSession(false);
    });
  }, []);

  const handleLock = async () => {
    await signOut();
    setAuthed(false);
  };

  if (checkingSession) return <PortalLoading />;

  if (!authed) {
    return (
      <PasswordGate
        title="Admin Access"
        crossLink={QUEUE_LINK}
        onUnlock={() => setAuthed(true)}
      />
    );
  }

  return (
    <PortalShell crossLink={QUEUE_LINK} onLogout={handleLock}>
      <Admin
        onViewMetrics={(id) => navigate(`/queue?tab=metrics&event=${id}`)}
      />
    </PortalShell>
  );
}
