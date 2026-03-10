import Input from "./Input";
import Select from "./Select";
import TextArea from "./TextArea";
import Card from "./Card";
import { CATEGORIES } from "../lib/constants";

export default function ItemForm({ index, item, onChange, onRemove, canRemove }) {
  const update = (field, value) => onChange({ ...item, [field]: value });
  return (
    <Card style={{ marginBottom: 16, border: "1.5px solid #e8ebf0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: index === 0 ? "#1e3a6e" : "#e07850", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Space Mono', monospace", fontSize: "13px", fontWeight: 700 }}>{index + 1}</div>
          <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: "14px", fontWeight: 600, color: "#344054" }}>{index === 0 ? "Primary Item" : "Second Item"}</span>
        </div>
        {canRemove && <button onClick={onRemove} style={{ background: "none", border: "none", color: "#98a2b3", cursor: "pointer", fontSize: "18px", padding: "4px 8px" }}>✕</button>}
      </div>
      <Input label="Item Name" value={item.name} onChange={(v) => update("name", v)} placeholder="e.g. Coffee machine, winter jacket" required />
      <Select label="Category" value={item.category} onChange={(v) => update("category", v)} options={CATEGORIES} placeholder="Select a category" required />
      <TextArea label="What's wrong with it?" value={item.description} onChange={(v) => update("description", v)} placeholder="Describe the problem..." required />
    </Card>
  );
}
