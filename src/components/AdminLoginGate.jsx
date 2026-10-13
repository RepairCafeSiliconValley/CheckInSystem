import { useState } from "react";
import { Link } from "react-router-dom";
import Logo from "./Logo";
import Card from "./Card";
import Button from "./Button";
import { signInWithGoogle } from "../lib/store";

const font = "'Outfit', sans-serif";

// What to tell someone who reached /admin without an enabled admin session.
function messageFor(access) {
  switch (access.level) {
    case "volunteer":
      return "This device is signed in with the volunteer account. Sign in with your own Google account to manage events; that replaces the volunteer login on this device.";
    case "disabled":
      return `Your admin account (${access.email}) has been disabled. Ask another admin to re-enable it.`;
    case "none":
      return `${access.email} isn't an admin account. Ask an admin to add your email to the allowlist, then sign in again.`;
    default:
      return "Sign in with the Google account an admin approved.";
  }
}

// /admin's sign-in screen: Continue with Google, plus the state of whatever
// session is already on this device. `error` is a rejected sign-in redirect
// (e.g. "This email hasn't been approved for admin access.").
export default function AdminLoginGate({ access, error, crossLink, onSignOut }) {
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(null);
  const signedIn = access.level !== "signed-out";

  const handleGoogle = async () => {
    setStarting(true);
    setStartError(null);
    try {
      await signInWithGoogle(); // navigates away on success
    } catch (err) {
      console.error("Google sign-in failed to start:", err);
      setStartError("Google sign-in isn't available right now. Please try again.");
      setStarting(false);
    }
  };

  const shownError = startError || error;

  return (
    <div style={{ minHeight: "100vh", background: "#f5f6f8", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ maxWidth: 380, width: "100%", textAlign: "center" }}>
        <div style={{ display: "inline-block", marginBottom: 32 }}><Logo variant="horizontal" /></div>
        <Card style={{ textAlign: "left" }}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#f0f4f8", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", fontSize: "22px" }}>🔒</div>
            <h2 style={{ fontFamily: font, fontSize: "20px", fontWeight: 700, color: "#1d2939", margin: "0 0 4px 0" }}>Admin Access</h2>
            <p style={{ fontFamily: font, fontSize: "13px", color: "#667085", margin: 0, lineHeight: 1.5 }}>{messageFor(access)}</p>
          </div>
          {shownError && (
            <div style={{ padding: "8px 12px", background: "#fef3f2", borderRadius: "8px", marginBottom: 14 }}>
              <span style={{ fontFamily: font, fontSize: "13px", color: "#b42318" }}>{shownError}</span>
            </div>
          )}
          <Button onClick={handleGoogle} disabled={starting}>
            {starting ? "Opening Google..." : "Continue with Google"}
          </Button>
          {signedIn && (
            <div style={{ textAlign: "center", marginTop: 8 }}>
              <Button variant="ghost" onClick={onSignOut}>Sign out</Button>
            </div>
          )}
        </Card>
        {crossLink && (
          <Link to={crossLink.to} style={{ display: "inline-block", marginTop: 16, fontFamily: font, fontSize: "13px", fontWeight: 600, color: "#1e3a6e", textDecoration: "none" }}>{crossLink.label}</Link>
        )}
      </div>
    </div>
  );
}
