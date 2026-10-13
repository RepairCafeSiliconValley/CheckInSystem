import { useState, useEffect } from "react";
import Card from "../components/Card";
import Input from "../components/Input";
import Button from "../components/Button";
import Modal from "../components/Modal";
import {
  fetchAllowlist,
  fetchAppUsers,
  addToAllowlist,
  removeFromAllowlist,
} from "../lib/store";

const font = "'Outfit', sans-serif";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";

// /admin → Allowlist: invite a new admin by email. The invite is used up the
// first time that email signs in with Google (the Before User Created hook
// only lets allowlisted emails sign up).
export default function AdminAllowlist() {
  const [invites, setInvites] = useState(null); // null while loading
  const [users, setUsers] = useState([]);
  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [removing, setRemoving] = useState(null); // invite pending confirmation

  const load = () =>
    Promise.all([fetchAllowlist(), fetchAppUsers()]).then(([inv, us]) => {
      setInvites(inv);
      setUsers(us);
      setLoadError(null);
    });

  useEffect(() => {
    load().catch((err) => {
      console.error("Failed to load the allowlist:", err);
      setLoadError("Couldn't load the allowlist. Check your connection and try again.");
      setInvites([]);
    });
  }, []);

  const nameFor = (id) => users.find((u) => u.id === id)?.name;

  const handleAdd = async () => {
    const clean = email.trim().toLowerCase();
    if (!EMAIL_RE.test(clean)) {
      setFormError("Enter a valid email address.");
      return;
    }
    if (users.some((u) => u.email === clean)) {
      setFormError(`${clean} is already an admin.`);
      return;
    }
    if (invites.some((i) => i.email === clean)) {
      setFormError(`${clean} is already on the allowlist.`);
      return;
    }
    setAdding(true);
    setFormError(null);
    try {
      await addToAllowlist(clean);
      setEmail("");
      await load();
    } catch (err) {
      console.error("Failed to add to the allowlist:", err);
      setFormError(
        err.code === "23505"
          ? `${clean} is already on the allowlist.`
          : "Couldn't add that email. Please try again.",
      );
    }
    setAdding(false);
  };

  const handleRemove = async () => {
    const target = removing;
    setRemoving(null);
    try {
      await removeFromAllowlist(target.email);
      await load();
    } catch (err) {
      console.error("Failed to remove from the allowlist:", err);
      setLoadError(`Couldn't remove ${target.email}. Please try again.`);
    }
  };

  return (
    <div>
      <h2 style={{ fontFamily: font, fontSize: "22px", fontWeight: 700, color: "#1d2939", margin: "0 0 20px 0" }}>
        Admin Allowlist
      </h2>

      <Card style={{ marginBottom: 24 }}>
        <h3 style={{ fontFamily: font, fontSize: "15px", fontWeight: 700, color: "#1d2939", margin: "0 0 6px 0" }}>
          Invite an admin
        </h3>
        <p style={{ fontFamily: font, fontSize: "13px", color: "#667085", margin: "0 0 14px 0", lineHeight: 1.5 }}>
          They become an admin the first time they sign in to /admin with Google using this email.
          Let them know; no email is sent.
        </p>
        <Input
          label="Email"
          value={email}
          onChange={(v) => {
            setEmail(v);
            setFormError(null);
          }}
          placeholder="name@example.com"
          type="email"
          inputMode="email"
        />
        {formError && (
          <div style={{ padding: "8px 12px", background: "#fef3f2", borderRadius: "8px", marginBottom: 14 }}>
            <span style={{ fontFamily: font, fontSize: "13px", color: "#b42318" }}>{formError}</span>
          </div>
        )}
        <Button onClick={handleAdd} disabled={!email.trim() || adding || !invites}>
          {adding ? "Adding..." : "Add to allowlist"}
        </Button>
      </Card>

      <h3 style={{ fontFamily: font, fontSize: "15px", fontWeight: 700, color: "#1d2939", margin: "0 0 12px 0" }}>
        Pending invites
      </h3>
      {loadError && (
        <div style={{ padding: "8px 12px", background: "#fef3f2", borderRadius: "8px", marginBottom: 14 }}>
          <span style={{ fontFamily: font, fontSize: "13px", color: "#b42318" }}>{loadError}</span>
        </div>
      )}
      {invites === null ? (
        <p style={{ fontFamily: font, color: "#667085", fontSize: "14px" }}>Loading...</p>
      ) : invites.length === 0 ? (
        <p style={{ fontFamily: font, color: "#98a2b3", fontSize: "14px" }}>No pending invites.</p>
      ) : (
        invites.map((inv) => (
          <Card key={inv.email} style={{ marginBottom: 10, padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: font, fontSize: "15px", fontWeight: 600, color: "#1d2939", overflowWrap: "anywhere" }}>
                  {inv.email}
                </div>
                <div style={{ fontFamily: font, fontSize: "12px", color: "#667085", marginTop: 2 }}>
                  Invited {formatDate(inv.created_at)}
                  {nameFor(inv.invited_by) ? ` by ${nameFor(inv.invited_by)}` : ""}
                </div>
              </div>
              <Button variant="danger" onClick={() => setRemoving(inv)}>Remove</Button>
            </div>
          </Card>
        ))
      )}

      {removing && (
        <Modal title="Remove invite?" onClose={() => setRemoving(null)}>
          <p style={{ fontFamily: font, fontSize: "14px", color: "#344054", margin: "0 0 16px 0", lineHeight: 1.5 }}>
            {removing.email} won't be able to sign in to /admin unless they're invited again.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Button variant="secondary" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleRemove}>Remove</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
