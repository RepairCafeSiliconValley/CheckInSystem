import { useState } from "react";
import Logo from "./Logo";
import Card from "./Card";
import Input from "./Input";
import Button from "./Button";
import { signIn } from "../lib/store";

export default function PasswordGate({ onUnlock }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);

  const attempt = async () => {
    setLoading(true);
    const valid = await signIn(pw);
    setLoading(false);
    if (valid) {
      onUnlock();
    } else {
      setError(true);
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f5f6f8", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ maxWidth: 380, width: "100%", textAlign: "center" }}>
        <div style={{ display: "inline-block", marginBottom: 32 }}><Logo /></div>
        <Card style={{ textAlign: "left" }}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#f0f4f8", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", fontSize: "22px" }}>🔒</div>
            <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "20px", fontWeight: 700, color: "#1d2939", margin: "0 0 4px 0" }}>Staff Access</h2>
            <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: "13px", color: "#667085", margin: 0 }}>Enter the shared password to continue.</p>
          </div>
          <div style={{ animation: shake ? "shake 0.4s ease" : "none" }}>
            <Input label="Password" value={pw} onChange={(v) => { setPw(v); setError(false); }} placeholder="Enter password" type="password" required />
          </div>
          {error && <div style={{ padding: "8px 12px", background: "#fef3f2", borderRadius: "8px", marginBottom: 14 }}><span style={{ fontFamily: "'Outfit', sans-serif", fontSize: "13px", color: "#b42318" }}>Incorrect password.</span></div>}
          <Button onClick={attempt} disabled={!pw.trim() || loading}>{loading ? "Checking..." : "Unlock"}</Button>
        </Card>
      </div>
      <style>{`@keyframes shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-8px); } 40% { transform: translateX(8px); } 60% { transform: translateX(-5px); } 80% { transform: translateX(5px); } }`}</style>
    </div>
  );
}
