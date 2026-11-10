import { useState, useEffect, useMemo } from "react";
import Card from "../components/Card";
import Input from "../components/Input";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { useNarrow } from "../lib/useNarrow";
import {
  fetchAllowlist,
  fetchAppUsers,
  addToAllowlist,
  removeFromAllowlist,
  updateAppUserName,
  setUserDisabled,
  deleteAppUser,
} from "../lib/store";

const font = "'Outfit', sans-serif";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A disabled user's text is greyed out; their controls (Disabled, Delete)
// keep full strength because they still work.
const MUTED = "#98a2b3";
const textColor = (user, normal = "#344054") => (user.disabled ? MUTED : normal);

// created_at is still stored and fetched; it just isn't shown.
const COLUMNS = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "disabled", label: "Disabled" },
  { key: "last_login_at", label: "Last login" },
];

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";

// Blank values sort last in either direction; text compares case-insensitively.
function compareBy(key, dir) {
  return (a, b) => {
    const x = a[key];
    const y = b[key];
    const xBlank = x === null || x === undefined || x === "";
    const yBlank = y === null || y === undefined || y === "";
    if (xBlank || yBlank) return xBlank === yBlank ? 0 : xBlank ? 1 : -1;
    const order =
      typeof x === "boolean"
        ? Number(x) - Number(y)
        : String(x).localeCompare(String(y), undefined, { sensitivity: "base" });
    return dir === "asc" ? order : -order;
  };
}

// An email that has to wrap breaks just before the @ ("bob.martinez /
// @example.com"), not mid-word.
function EmailText({ email }) {
  const at = email.indexOf("@");
  if (at <= 0) return email;
  return (
    <>
      {email.slice(0, at)}
      <wbr />
      {email.slice(at)}
    </>
  );
}

// Inline name editor: saves on Enter or when the field loses focus.
function NameField({ user, onSave }) {
  const [value, setValue] = useState(user.name);
  const save = () => {
    const clean = value.trim();
    if (clean === user.name) return;
    if (!clean) {
      setValue(user.name);
      onSave(null, "A name can't be empty.");
      return;
    }
    onSave(clean);
  };
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.target.blur();
        if (e.key === "Escape") setValue(user.name);
      }}
      aria-label={`Name for ${user.email}`}
      style={{ width: "100%", minWidth: 90, padding: "6px 8px", borderRadius: 8, border: "1.5px solid #e4e7ec", fontFamily: font, fontSize: "14px", color: textColor(user, "#1d2939"), boxSizing: "border-box" }}
    />
  );
}

function DisabledToggle({ user, isSelf, onToggle, compact = false }) {
  return (
    <label
      title={isSelf ? "You can't disable yourself" : undefined}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: font, fontSize: "13px", color: isSelf ? "#98a2b3" : "#344054", cursor: isSelf ? "not-allowed" : "pointer" }}
    >
      <input
        type="checkbox"
        checked={user.disabled}
        disabled={isSelf}
        onChange={(e) => onToggle(e.target.checked)}
        aria-label={`Disabled: ${user.email}`}
      />
      {!compact && (user.disabled ? "Disabled" : "Enabled")}
    </label>
  );
}

const banner = (text, tone) => (
  <div style={{ padding: "8px 12px", background: tone === "bad" ? "#fef3f2" : "#ecfdf3", borderRadius: "8px", marginBottom: 14 }}>
    <span style={{ fontFamily: font, fontSize: "13px", color: tone === "bad" ? "#b42318" : "#067647" }}>{text}</span>
  </div>
);

const sectionHeading = (text) => (
  <h3 style={{ fontFamily: font, fontSize: "15px", fontWeight: 700, color: "#1d2939", margin: "0 0 12px 0" }}>
    {text}
  </h3>
);

// The Admins tab: invite an admin by email, the invites still pending, and
// every admin account. One load feeds both halves, so deleting an admin frees
// their email for a new invite straight away. An invite is used up the first
// time that email signs in with Google (the Before User Created hook only
// lets allowlisted emails sign up).
export default function AdminAccounts({ currentUserId }) {
  // Cards on phones; the admins table needs more width than they have.
  const narrow = useNarrow(560);
  const [invites, setInvites] = useState(null); // null while loading
  const [users, setUsers] = useState(null); // null while loading
  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [sort, setSort] = useState({ key: "name", dir: "asc" });
  const [removing, setRemoving] = useState(null); // invite pending confirmation
  const [deleting, setDeleting] = useState(null); // user pending confirmation

  const load = () =>
    Promise.all([fetchAllowlist(), fetchAppUsers()]).then(([inv, us]) => {
      setInvites(inv);
      setUsers(us);
    });

  useEffect(() => {
    load().catch((err) => {
      console.error("Failed to load the admins:", err);
      setError("Couldn't load the admins. Check your connection and try again.");
      setInvites([]);
      setUsers([]);
    });
  }, []);

  const sorted = useMemo(
    () => (users ? [...users].sort(compareBy(sort.key, sort.dir)) : []),
    [users, sort],
  );

  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const nameFor = (id) => users?.find((u) => u.id === id)?.name;

  // Run a change, then reload so both halves always show what the DB holds.
  const run = async (action, failure, success) => {
    setError(null);
    setNotice(null);
    try {
      await action();
      if (success) setNotice(success);
    } catch (err) {
      console.error(failure, err);
      setError(`${failure} ${err.message || ""}`.trim());
    }
    try {
      await load();
    } catch (err) {
      console.error("Failed to reload the admins:", err);
    }
  };

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

  const handleRemove = () => {
    const target = removing;
    setRemoving(null);
    run(() => removeFromAllowlist(target.email), `Couldn't remove ${target.email}.`);
  };

  const handleName = (user) => (name, problem) => {
    if (problem) {
      setError(problem);
      return;
    }
    run(() => updateAppUserName(user.id, name), "Couldn't rename that user.", `Saved ${name}.`);
  };

  const handleToggle = (user) => (value) =>
    run(
      () => setUserDisabled(user.id, value),
      "Couldn't change that user.",
      value ? `${user.name} is disabled.` : `${user.name} is enabled again.`,
    );

  const handleDelete = () => {
    const target = deleting;
    setDeleting(null);
    run(() => deleteAppUser(target.id), "Couldn't delete that user.", `${target.name} was deleted.`);
  };

  // Compact, so the table fits the portal's 640px column.
  const deleteButton = (user, isSelf) => (
    <button
      onClick={() => setDeleting(user)}
      disabled={isSelf}
      title={isSelf ? "You can't delete yourself" : undefined}
      style={{ background: "#fef3f2", color: "#b42318", border: "1.5px solid #fecdca", borderRadius: 8, padding: "6px 10px", fontFamily: font, fontSize: "12px", fontWeight: 600, cursor: isSelf ? "not-allowed" : "pointer", opacity: isSelf ? 0.45 : 1 }}
    >
      Delete
    </button>
  );

  return (
    <div>
      <h2 style={{ fontFamily: font, fontSize: "22px", fontWeight: 700, color: "#1d2939", margin: "0 0 6px 0" }}>
        Admins
      </h2>
      <p style={{ fontFamily: font, fontSize: "13px", color: "#667085", margin: "0 0 16px 0", lineHeight: 1.5 }}>
        Disable someone to pause their access; enable them again any time. Delete removes their login:
        they'd need a new invite to come back.
      </p>

      {error && banner(error, "bad")}
      {notice && banner(notice, "good")}

      <Card style={{ marginBottom: 24 }}>
        <h3 style={{ fontFamily: font, fontSize: "15px", fontWeight: 700, color: "#1d2939", margin: "0 0 6px 0" }}>
          Invite an admin
        </h3>
        <p style={{ fontFamily: font, fontSize: "13px", color: "#667085", margin: "0 0 14px 0", lineHeight: 1.5 }}>
          They become an admin the first time they sign in with Google using this email.
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
        {formError && banner(formError, "bad")}
        <Button onClick={handleAdd} disabled={!email.trim() || adding || !invites || !users}>
          {adding ? "Adding..." : "Add to allowlist"}
        </Button>
      </Card>

      {/* Pending invites. Scoped in a section of its own so its Remove
          buttons never collide with the admins table below. */}
      <section style={{ marginBottom: 24 }} aria-label="Pending invites">
        {sectionHeading("Pending invites")}
        {invites === null ? (
          <p style={{ fontFamily: font, color: "#667085", fontSize: "14px" }}>Loading...</p>
        ) : invites.length === 0 ? (
          <p style={{ fontFamily: font, color: "#98a2b3", fontSize: "14px" }}>No pending invites.</p>
        ) : (
          invites.map((inv) => (
            <Card key={inv.email} style={{ marginBottom: 10, padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: font, fontSize: "15px", fontWeight: 600, color: "#1d2939", overflowWrap: "anywhere" }}>
                    {inv.email}
                  </div>
                  <div style={{ fontFamily: font, fontSize: "12px", color: "#667085", marginTop: 2 }}>
                    Invited {formatDate(inv.created_at)}
                    {nameFor(inv.invited_by) ? ` by ${nameFor(inv.invited_by)}` : ""}
                  </div>
                </div>
                {/* Compact, not the full-width Button, so the email gets the room. */}
                <button
                  onClick={() => setRemoving(inv)}
                  style={{ flexShrink: 0, background: "#fef3f2", color: "#b42318", border: "1.5px solid #fecdca", borderRadius: 8, padding: "6px 12px", fontFamily: font, fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
                >
                  Remove
                </button>
              </div>
            </Card>
          ))
        )}
      </section>

      <section aria-label="Current admins">
        {sectionHeading("Current admins")}
        {users === null ? (
          <p style={{ fontFamily: font, color: "#667085", fontSize: "14px" }}>Loading...</p>
        ) : narrow ? (
          <>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: font, fontSize: "13px", color: "#344054", marginBottom: 12 }}>
              Sort by
              <select
                value={`${sort.key}:${sort.dir}`}
                onChange={(e) => {
                  const [key, dir] = e.target.value.split(":");
                  setSort({ key, dir });
                }}
                style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1.5px solid #d0d5dd", fontFamily: font, fontSize: "14px" }}
              >
                {COLUMNS.flatMap((c) => [
                  <option key={`${c.key}:asc`} value={`${c.key}:asc`}>{c.label} ↑</option>,
                  <option key={`${c.key}:desc`} value={`${c.key}:desc`}>{c.label} ↓</option>,
                ])}
              </select>
            </label>
            {sorted.map((u) => {
              const isSelf = u.id === currentUserId;
              return (
                <Card key={u.id} style={{ marginBottom: 10, padding: "14px 16px" }}>
                  <NameField key={u.name} user={u} onSave={handleName(u)} />
                  <div style={{ fontFamily: font, fontSize: "13px", color: textColor(u), marginTop: 8, overflowWrap: "break-word" }}>
                    <EmailText email={u.email} />{isSelf && <b> (you)</b>}
                  </div>
                  <div style={{ fontFamily: font, fontSize: "12px", color: textColor(u, "#667085"), marginTop: 4 }}>
                    {u.phone || "No phone"} · Last login {formatDate(u.last_login_at)}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
                    <DisabledToggle user={u} isSelf={isSelf} onToggle={handleToggle(u)} />
                    {deleteButton(u, isSelf)}
                  </div>
                </Card>
              );
            })}
          </>
        ) : (
          <div style={{ overflowX: "auto", background: "#fff", border: "1px solid #e8ebf0", borderRadius: 14 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: font, fontSize: "13px" }}>
              <thead>
                <tr>
                  {COLUMNS.map((c) => (
                    <th key={c.key} style={{ textAlign: "left", padding: "10px 6px", borderBottom: "1px solid #e8ebf0", whiteSpace: "nowrap" }}>
                      <button
                        onClick={() => toggleSort(c.key)}
                        style={{ background: "none", border: "none", padding: 0, fontFamily: font, fontSize: "12px", fontWeight: 700, color: sort.key === c.key ? "#1e3a6e" : "#667085", cursor: "pointer" }}
                      >
                        {c.label}{sort.key === c.key ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
                      </button>
                    </th>
                  ))}
                  <th style={{ borderBottom: "1px solid #e8ebf0" }} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((u) => {
                  const isSelf = u.id === currentUserId;
                  return (
                    <tr key={u.id}>
                      <td style={{ padding: "8px 6px", borderBottom: "1px solid #f2f4f7", width: 130 }}>
                        <NameField key={u.name} user={u} onSave={handleName(u)} />
                      </td>
                      <td style={{ padding: "8px 6px", borderBottom: "1px solid #f2f4f7", color: textColor(u), overflowWrap: "break-word" }}>
                        <EmailText email={u.email} />{isSelf && <b> (you)</b>}
                      </td>
                      <td style={{ padding: "8px 6px", borderBottom: "1px solid #f2f4f7", color: textColor(u), whiteSpace: "nowrap" }}>{u.phone || "—"}</td>
                      <td style={{ padding: "8px 6px", borderBottom: "1px solid #f2f4f7" }}>
                        <DisabledToggle user={u} isSelf={isSelf} onToggle={handleToggle(u)} compact />
                      </td>
                      <td style={{ padding: "8px 6px", borderBottom: "1px solid #f2f4f7", color: textColor(u), whiteSpace: "nowrap" }}>{formatDate(u.last_login_at)}</td>
                      <td style={{ padding: "8px 6px", borderBottom: "1px solid #f2f4f7" }}>{deleteButton(u, isSelf)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {removing && (
        <Modal title="Remove invite?" onClose={() => setRemoving(null)}>
          <p style={{ fontFamily: font, fontSize: "14px", color: "#344054", margin: "0 0 16px 0", lineHeight: 1.5 }}>
            {removing.email} won't be able to sign in unless they're invited again.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Button variant="secondary" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleRemove}>Remove</Button>
          </div>
        </Modal>
      )}

      {deleting && (
        <Modal title={`Delete ${deleting.name}?`} onClose={() => setDeleting(null)}>
          <p style={{ fontFamily: font, fontSize: "14px", color: "#344054", margin: "0 0 16px 0", lineHeight: 1.5 }}>
            This removes {deleting.email}'s login. They'll need to be added to the allowlist again to come back.
            To pause their access instead, use Disabled.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Button variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete}>Delete</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
