import { useState } from "react";
import Logo from "./Logo";
import Card from "./Card";
import Input from "./Input";
import Button from "./Button";
import { signInVolunteer, signInWithGoogle } from "../lib/store";

const font = "'Outfit', sans-serif";

// What to tell someone whose existing session isn't good enough for the
// portal. A volunteer session isn't listed: it gets in, so it never lands
// here.
function messageFor(access) {
  switch (access.level) {
    case "disabled":
      return `Your admin account (${access.email}) has been disabled. Ask another admin to re-enable it.`;
    case "none":
      return `${access.email} isn't an admin account. Enter the volunteer password, or ask an admin to add your email to the allowlist.`;
    default:
      return "Volunteers use the shared password. Admins sign in with the Google account an admin approved.";
  }
}

// The portal's single sign-in screen: the shared volunteer password on top,
// then Continue with Google for admins. `error` is a rejected sign-in redirect
// (e.g. "someone@example.com has not been approved for admin access.").
export default function SignInGate({ access, error, onUnlock, onSignOut }) {
  const [pw, setPw] = useState("");
  const [wrongPassword, setWrongPassword] = useState(false);
  const [shake, setShake] = useState(false);
  const [checking, setChecking] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(null);
  const signedIn = access.level !== "signed-out";

  const attempt = async () => {
    setChecking(true);
    const valid = await signInVolunteer(pw);
    setChecking(false);
    if (valid) {
      onUnlock();
    } else {
      setWrongPassword(true);
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
  };

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

  // The session message and a rejected redirect are about the Google half, so
  // they sit with it; a wrong password is reported next to the password field.
  const googleError = startError || error;

  return (
    <div style={{ minHeight: "100vh", background: "#f5f6f8", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ maxWidth: 380, width: "100%", textAlign: "center" }}>
        <div style={{ display: "inline-block", marginBottom: 32 }}><Logo variant="horizontal" /></div>
        <Card style={{ textAlign: "left" }}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#f0f4f8", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", fontSize: "22px" }}>🔒</div>
            <h2 style={{ fontFamily: font, fontSize: "20px", fontWeight: 700, color: "#1d2939", margin: "0 0 4px 0" }}>Sign In</h2>
            <p style={{ fontFamily: font, fontSize: "13px", color: "#667085", margin: 0, lineHeight: 1.5 }}>{messageFor(access)}</p>
          </div>

          <div style={{ animation: shake ? "shake 0.4s ease" : "none" }}>
            <Input
              label="Volunteer password"
              value={pw}
              onChange={(v) => {
                setPw(v);
                setWrongPassword(false);
              }}
              placeholder="Enter password"
              type="password"
            />
          </div>
          {wrongPassword && (
            <div style={{ padding: "8px 12px", background: "#fef3f2", borderRadius: "8px", marginBottom: 14 }}>
              <span style={{ fontFamily: font, fontSize: "13px", color: "#b42318" }}>Incorrect password.</span>
            </div>
          )}
          <Button onClick={attempt} disabled={!pw.trim() || checking}>
            {checking ? "Checking..." : "Unlock"}
          </Button>

          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "18px 0" }}>
            <div style={{ flex: 1, height: 1, background: "#e4e7ec" }} />
            <span style={{ fontFamily: font, fontSize: "12px", color: "#98a2b3" }}>or</span>
            <div style={{ flex: 1, height: 1, background: "#e4e7ec" }} />
          </div>

          {googleError && (
            <div style={{ padding: "8px 12px", background: "#fef3f2", borderRadius: "8px", marginBottom: 14 }}>
              <span style={{ fontFamily: font, fontSize: "13px", color: "#b42318" }}>{googleError}</span>
            </div>
          )}
          <Button variant="secondary" onClick={handleGoogle} disabled={starting}>
            {starting ? "Opening Google..." : "Continue with Google"}
          </Button>
          {signedIn && (
            <div style={{ textAlign: "center", marginTop: 8 }}>
              <Button variant="ghost" onClick={onSignOut}>Sign out</Button>
            </div>
          )}
        </Card>
      </div>
      <style>{`@keyframes shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-8px); } 40% { transform: translateX(8px); } 60% { transform: translateX(-5px); } 80% { transform: translateX(5px); } }`}</style>
    </div>
  );
}
