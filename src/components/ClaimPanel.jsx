import { useState } from "react";
import Card from "./Card";
import Input from "./Input";
import Button from "./Button";
import ItemDetailsCard from "./ItemDetailsCard";
import { claimAndNotify } from "../lib/store";
import { getSavedFixerName, saveFixerName } from "../lib/fixerName";

// Shown by /ticket/:id while an item is still waiting for a fixer. Claiming is
// what moves it to With Fixer, records who took it, and (optionally) texts the
// client — so it comes before the outcome form rather than being skippable.

const heading = {
  fontFamily: "'Outfit', sans-serif",
  fontSize: "22px",
  fontWeight: 700,
  color: "#1d2939",
  margin: "0 0 4px 0",
};
const intro = {
  fontFamily: "'Outfit', sans-serif",
  fontSize: "14px",
  color: "#667085",
  margin: "0 0 24px 0",
  lineHeight: 1.5,
};

export default function ClaimPanel({ workOrder, clientName, onClaimed }) {
  // A name saved on the item wins over this device's last one.
  const [fixerName, setFixerName] = useState(
    workOrder.fixer_name || getSavedFixerName(),
  );
  // Which button is mid-flight, so only that one shows a pending label.
  const [pending, setPending] = useState(null);
  const [error, setError] = useState(null);

  // Computed server-side by get_fixer_work_order (migration v10) from three
  // values this public page isn't allowed to read: the event's collect_phone,
  // and the client's phone and consent.
  const canTextClient = workOrder.can_text_client === true;
  const busy = pending !== null;
  const nameMissing = !fixerName.trim();

  const claim = async (sendText) => {
    setPending(sendText ? "text" : "quiet");
    setError(null);
    try {
      const res = await claimAndNotify(workOrder.id, fixerName, { sendText });
      saveFixerName(fixerName.trim());
      onClaimed(res);
    } catch {
      setError("Something went wrong. Please try again.");
      setPending(null);
    }
  };

  return (
    <>
      <h2 style={heading}>Start Working on This Item</h2>
      <p style={intro}>
        {canTextClient
          ? "Enter your name to claim this item. You can text the client to come to the repair area at the same time."
          : "Enter your name to claim this item. No text will be sent — please look for the client in the waiting area."}
      </p>

      <ItemDetailsCard workOrder={workOrder} clientName={clientName} />

      <Card>
        <Input
          label="Your Name"
          value={fixerName}
          onChange={setFixerName}
          placeholder="Enter your name"
          required
        />

        {/* Texting is the better default when it's available, so it leads.
            Claiming without a text stays one tap away for the case where the
            fixer already has the client standing next to them. */}
        <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
          {canTextClient && (
            <Button
              variant="primary"
              onClick={() => claim(true)}
              disabled={busy || nameMissing}
            >
              {pending === "text" ? "Claiming…" : "Claim & text client"}
            </Button>
          )}
          <Button
            variant={canTextClient ? "secondary" : "primary"}
            onClick={() => claim(false)}
            disabled={busy || nameMissing}
          >
            {pending === "quiet"
              ? "Claiming…"
              : canTextClient
                ? "Claim without texting"
                : "Claim this item"}
          </Button>
          {!busy && nameMissing && (
            <p
              style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: "12px",
                color: "#98a2b3",
                textAlign: "center",
                margin: "0",
              }}
            >
              Enter your name to start.
            </p>
          )}
        </div>

        {error && (
          <div
            style={{
              padding: "8px 12px",
              background: "#fef3f2",
              borderRadius: "8px",
              marginTop: 12,
            }}
          >
            <span
              style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: "13px",
                color: "#b42318",
              }}
            >
              {error}
            </span>
          </div>
        )}
      </Card>
    </>
  );
}
