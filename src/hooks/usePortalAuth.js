import { useState, useEffect } from "react";
import { getSession, signOut } from "../lib/store";

// Shared session lifecycle for the staff portals. Gates on the signed-in
// account's email so an admin session can't silently unlock the queue portal
// and vice-versa (both accounts share one Supabase session in localStorage).
export default function usePortalAuth({ email }) {
  const [authed, setAuthed] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    getSession().then((session) => {
      if (session?.user?.email === email) setAuthed(true);
      setCheckingSession(false);
    });
  }, [email]);

  const logout = async () => {
    await signOut();
    setAuthed(false);
  };

  return { authed, setAuthed, checkingSession, logout };
}
