import { useState, useEffect, useCallback, useMemo } from "react";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import {
  fetchInventory,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
} from "../lib/store";

const fieldStyle = {
  padding: "9px 12px",
  borderRadius: "10px",
  border: "1.5px solid #d0d5dd",
  fontFamily: "'Outfit', sans-serif",
  fontSize: "14px",
  color: "#1d2939",
  background: "#fff",
  boxSizing: "border-box",
  outline: "none",
  minWidth: 0,
};

const iconButtonStyle = {
  background: "none",
  border: "none",
  cursor: "pointer",
  fontSize: "14px",
  lineHeight: 1,
  padding: "6px 4px",
};

const smallButtonStyle = {
  padding: "8px 16px",
  fontSize: "13px",
  width: "auto",
  flexShrink: 0,
};

const focusHandlers = {
  onFocus: (e) => (e.target.style.borderColor = "#1e3a6e"),
  onBlur: (e) => (e.target.style.borderColor = "#d0d5dd"),
};

// The unique index is on (lower(name), bin), so this is the one failure a
// staffer can hit by accident rather than by breakage — it deserves a sentence
// that names the clash instead of a generic "try again".
function errorMessage(err, name, bin) {
  if (err?.code === "23505") {
    return `"${name.trim()}" is already listed in bin ${bin.trim().toUpperCase()}.`;
  }
  return "Something went wrong. Please try again.";
}

export default function InventoryAdmin() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const [newName, setNewName] = useState("");
  const [newBin, setNewBin] = useState("");
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  const [confirmingId, setConfirmingId] = useState(null);

  const loadInventory = useCallback(
    () =>
      fetchInventory()
        .then(setItems)
        .catch((err) => {
          console.error("Failed to load inventory:", err);
          setError("Couldn't load the supply list.");
        }),
    []
  );

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  // An armed delete disarms itself, so walking away from a half-tapped row
  // can't leave a one-tap delete waiting for the next person.
  useEffect(() => {
    if (!confirmingId) return;
    const t = setTimeout(() => setConfirmingId(null), 4000);
    return () => clearTimeout(t);
  }, [confirmingId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = [...(items || [])].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
    if (!q) return rows;
    return rows.filter(
      (i) => i.name.toLowerCase().includes(q) || i.bin.toLowerCase().includes(q)
    );
  }, [items, search]);

  const handleAdd = async () => {
    if (!newName.trim() || !newBin.trim() || adding) return;
    setAdding(true);
    setError("");
    try {
      await createInventoryItem({ name: newName, bin: newBin });
      setNewName("");
      setNewBin("");
      await loadInventory();
    } catch (err) {
      console.error("Failed to add inventory item:", err);
      setError(errorMessage(err, newName, newBin));
    }
    setAdding(false);
  };

  const startEdit = (item) => {
    setConfirmingId(null);
    setError("");
    setEditingId(item.id);
    // Edits a copy, so a cancelled edit leaves the loaded row untouched.
    setDraft({ name: item.name, bin: item.bin });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const handleSave = async () => {
    if (!draft?.name.trim() || !draft?.bin.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      await updateInventoryItem(editingId, { name: draft.name, bin: draft.bin });
      cancelEdit();
      await loadInventory();
    } catch (err) {
      console.error("Failed to update inventory item:", err);
      setError(errorMessage(err, draft.name, draft.bin));
    }
    setSaving(false);
  };

  const handleDelete = async (item) => {
    setError("");
    try {
      await deleteInventoryItem(item.id);
      setConfirmingId(null);
      await loadInventory();
    } catch (err) {
      console.error("Failed to delete inventory item:", err);
      setError("Couldn't delete that item. Please try again.");
    }
  };

  if (!items) {
    return (
      <p style={{ fontFamily: "'Outfit', sans-serif", color: "#667085" }}>
        Loading...
      </p>
    );
  }

  return (
    <div>
      <h2
        style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: "22px",
          fontWeight: 700,
          color: "#1d2939",
          margin: "0 0 6px 0",
        }}
      >
        Supplies
      </h2>
      <p
        style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: "13px",
          color: "#667085",
          margin: "0 0 20px 0",
        }}
      >
        {items.length} items · shown to everyone at /inventory
      </p>

      {error && (
        <div
          style={{
            padding: "8px 12px",
            background: "#fef3f2",
            borderRadius: "8px",
            marginBottom: 16,
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

      <Card style={{ marginBottom: 20 }}>
        <h3
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: "15px",
            fontWeight: 700,
            color: "#1d2939",
            margin: "0 0 14px 0",
          }}
        >
          Add Item
        </h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="Item name"
            style={{ ...fieldStyle, flex: 1 }}
            {...focusHandlers}
          />
          <input
            value={newBin}
            onChange={(e) => setNewBin(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="Bin"
            style={{
              ...fieldStyle,
              width: 72,
              flexShrink: 0,
              textTransform: "uppercase",
            }}
            {...focusHandlers}
          />
          <Button
            onClick={handleAdd}
            disabled={!newName.trim() || !newBin.trim() || adding}
            style={smallButtonStyle}
          >
            {adding ? "Adding..." : "Add"}
          </Button>
        </div>
      </Card>

      <div style={{ marginBottom: 12 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search for an item or a bin..."
          style={{ ...fieldStyle, width: "100%", padding: "11px 14px" }}
          {...focusHandlers}
        />
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "32px 16px" }}>
          <p
            style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: "14px",
              color: "#98a2b3",
            }}
          >
            {search.trim() ? "No items found." : "No supplies listed yet."}
          </p>
        </div>
      )}

      {/* One card holding every row, rather than the card-per-record shape the
          Events tab uses: at a couple of hundred supplies, a card each is a
          great deal of scrolling for a list you mostly skim. */}
      {filtered.length > 0 && (
        <Card style={{ padding: "2px 14px" }}>
          {filtered.map((item, idx) => {
            const isEditing = editingId === item.id;
            const isConfirming = confirmingId === item.id;
            return (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 0",
                  borderBottom:
                    idx === filtered.length - 1 ? "none" : "1px solid #f0f2f5",
                }}
              >
                {isEditing ? (
                  <>
                    <input
                      value={draft.name}
                      onChange={(e) =>
                        setDraft({ ...draft, name: e.target.value })
                      }
                      onKeyDown={(e) => e.key === "Enter" && handleSave()}
                      style={{ ...fieldStyle, flex: 1 }}
                      {...focusHandlers}
                    />
                    <input
                      value={draft.bin}
                      onChange={(e) =>
                        setDraft({ ...draft, bin: e.target.value })
                      }
                      onKeyDown={(e) => e.key === "Enter" && handleSave()}
                      style={{
                        ...fieldStyle,
                        width: 64,
                        flexShrink: 0,
                        textTransform: "uppercase",
                      }}
                      {...focusHandlers}
                    />
                    <Button
                      onClick={handleSave}
                      disabled={!draft.name.trim() || !draft.bin.trim() || saving}
                      style={smallButtonStyle}
                    >
                      {saving ? "Saving..." : "Save"}
                    </Button>
                    {/* Button applies its variant after the caller's style,
                        so ghost's own padding wins — only width/size carry. */}
                    <Button
                      variant="ghost"
                      onClick={cancelEdit}
                      style={smallButtonStyle}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <span
                      style={{
                        flex: 1,
                        fontFamily: "'Outfit', sans-serif",
                        fontSize: "14px",
                        color: "#1d2939",
                      }}
                    >
                      {item.name}
                    </span>
                    <Badge text={item.bin} />
                    <button
                      onClick={() => startEdit(item)}
                      style={iconButtonStyle}
                      title={`Edit ${item.name}`}
                      aria-label={`Edit ${item.name}`}
                    >
                      ✎
                    </button>
                    {isConfirming ? (
                      <Button
                        variant="danger"
                        onClick={() => handleDelete(item)}
                        style={{ ...smallButtonStyle, padding: "6px 12px" }}
                      >
                        Delete?
                      </Button>
                    ) : (
                      // Two taps, not window.confirm: the app has no confirm
                      // dialog anywhere, and this is its only destructive action.
                      <button
                        onClick={() => setConfirmingId(item.id)}
                        style={iconButtonStyle}
                        title={`Delete ${item.name}`}
                        aria-label={`Delete ${item.name}`}
                      >
                        🗑
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
