import { useId, useState } from "react";
import Input from "./Input";
import Button from "./Button";

// The desk's version of the ticket page's claim panel (ClaimPanel), for a
// fixer who took a ticket without scanning it. Same two choices, same texting
// rules: the caller works out canTextClient with the gates claim-and-notify
// applies, so "Assign & text client" only shows when a text can actually go.
//
// Unlike ClaimPanel the name starts empty and is never remembered: the portal
// runs on a shared front-desk device (see lib/fixerName.js). Names already used
// for fixers at this event are offered as suggestions instead.

export default function AssignFixer({ suggestions = [], canTextClient, onAssign }) {
  const listId = useId();
  const [fixerName, setFixerName] = useState("");
  // Which button is mid-flight, so only that one shows a pending label.
  const [pending, setPending] = useState(null);

  const busy = pending !== null;
  const nameMissing = !fixerName.trim();

  const assign = async (sendText) => {
    setPending(sendText ? "text" : "quiet");
    try {
      await onAssign(fixerName.trim(), sendText);
    } finally {
      // The parent closes this panel on success; on failure it shows the error
      // and the buttons have to work again.
      setPending(null);
    }
  };

  const buttonStyle = { fontSize: "14px", padding: "11px 14px" };

  return (
    <>
      <Input
        label="Fixer Name"
        value={fixerName}
        onChange={setFixerName}
        placeholder="Who has the item?"
        list={suggestions.length > 0 ? listId : undefined}
        autoComplete="off"
        required
      />
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        {canTextClient && (
          <Button
            variant="primary"
            onClick={() => assign(true)}
            disabled={busy || nameMissing}
            style={buttonStyle}
          >
            {pending === "text" ? "Assigning…" : "Assign & text client"}
          </Button>
        )}
        <Button
          variant={canTextClient ? "secondary" : "primary"}
          onClick={() => assign(false)}
          disabled={busy || nameMissing}
          style={buttonStyle}
        >
          {pending === "quiet"
            ? "Assigning…"
            : canTextClient
              ? "Assign without texting"
              : "Assign to fixer"}
        </Button>
      </div>
    </>
  );
}
