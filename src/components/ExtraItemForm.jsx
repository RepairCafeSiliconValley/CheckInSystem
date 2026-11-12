import { useState } from "react";
import Card from "./Card";
import Input from "./Input";
import Select from "./Select";
import TextArea from "./TextArea";
import Button from "./Button";
import { CATEGORIES } from "../lib/constants";

// The desk's form for adding an item to a visitor's check-in (one per submit). Nothing is written until
// every required field is filled and "Add item" is pressed, so an abandoned
// form never leaves a blank item in the queue. `onAdd` resolves when the item
// exists; a rejection shows an error and keeps what was typed.
export default function ExtraItemForm({ collectWeight, onAdd, onCancel }) {
  const [itemName, setItemName] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [weight, setWeight] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const ready = itemName.trim() && category && description.trim();

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const n = weight === "" ? null : Number(weight);
    try {
      await onAdd({
        itemName,
        category,
        description,
        weightKg: Number.isFinite(n) ? n : null,
      });
    } catch (err) {
      console.error("Failed to add extra item:", err);
      setError(err?.message || "Could not add the item.");
      setBusy(false);
    }
  };

  return (
    <Card style={{ marginBottom: 16, borderLeft: "4px solid #e07850" }}>
      <h3
        style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: "16px",
          fontWeight: 700,
          color: "#1e3a6e",
          margin: "0 0 4px 0",
        }}
      >
        Extra item
      </h3>
      <p
        style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: "13px",
          color: "#667085",
          margin: "0 0 16px 0",
        }}
      >
        Added at the desk. It gets the next ticket number for this client.
      </p>
      <Input
        label="Item Name"
        value={itemName}
        onChange={setItemName}
        placeholder="Item name"
        required
      />
      <Select
        label="Category"
        value={category}
        onChange={setCategory}
        options={CATEGORIES}
        placeholder="Category"
        required
      />
      {collectWeight && (
        <Input
          label="Weight (kg)"
          value={weight}
          onChange={setWeight}
          placeholder="e.g. 2.5 (optional)"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
        />
      )}
      <TextArea
        label="Issue"
        value={description}
        onChange={setDescription}
        placeholder="Describe the issue"
        required
        rows={2}
      />
      {error && (
        <p
          role="alert"
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: "13px",
            color: "#b42318",
            margin: "0 0 12px 0",
          }}
        >
          {error}
        </p>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="primary" onClick={submit} disabled={!ready || busy}>
          {busy ? "Adding..." : "Add item"}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={busy}>
          Never mind
        </Button>
      </div>
    </Card>
  );
}
