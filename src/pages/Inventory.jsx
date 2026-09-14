import { useState, useEffect, useMemo } from "react";
import Logo from "../components/Logo";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import { fetchInventory } from "../lib/store";

const pageStyle = {
  minHeight: "100vh",
  background: "#f5f6f8",
  fontFamily: "'Outfit', sans-serif",
};

const headingStyle = {
  fontFamily: "'Outfit', sans-serif",
  fontSize: "22px",
  fontWeight: 700,
  color: "#1d2939",
  margin: "0 0 4px 0",
};

const subtitleStyle = {
  fontFamily: "'Outfit', sans-serif",
  fontSize: "14px",
  color: "#667085",
  lineHeight: 1.5,
  margin: 0,
};

const letterStyle = {
  fontFamily: "'Space Mono', monospace",
  fontSize: "12px",
  fontWeight: 700,
  color: "#98a2b3",
  letterSpacing: "1px",
  margin: "0 0 6px 4px",
};

// Anything that doesn't start with a letter ("3 in 1 oil") buckets under #,
// which sorts ahead of A the same way it reads on the paper sheet.
function letterOf(name) {
  const first = name.trim().charAt(0).toUpperCase();
  return first >= "A" && first <= "Z" ? first : "#";
}

export default function Inventory() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchInventory()
      .then(setItems)
      .catch((err) => {
        console.error("Failed to load inventory:", err);
        setError(true);
      });
  }, []);

  // Postgres text ordering is collation-dependent, so the A–Z grouping is
  // settled here rather than trusted from the query.
  const sorted = useMemo(
    () =>
      [...(items || [])].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      ),
    [items]
  );

  // Matching the bin as well as the name is what makes the reverse lookup work:
  // typing "C4" lists everything in the bin you happen to be standing at.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (i) =>
        i.name.toLowerCase().includes(q) || i.bin.toLowerCase().includes(q)
    );
  }, [sorted, search]);

  const groups = useMemo(() => {
    const byLetter = new Map();
    for (const item of filtered) {
      const letter = letterOf(item.name);
      if (!byLetter.has(letter)) byLetter.set(letter, []);
      byLetter.get(letter).push(item);
    }
    return [...byLetter.entries()];
  }, [filtered]);

  // Clearing the search first means the printed sheet is always the whole
  // index, never whatever happened to be filtered on screen. Same
  // state-then-print timing as PrintTickets.
  const handlePrint = () => {
    setSearch("");
    setTimeout(() => window.print(), 50);
  };

  if (error) {
    return (
      <div
        style={{
          ...pageStyle,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 400 }}>
          <div style={{ display: "inline-block", marginBottom: 24 }}>
            <Logo variant="horizontal" />
          </div>
          <Card>
            <div style={{ fontSize: "32px", marginBottom: 12 }}>😕</div>
            <h2
              style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: "18px",
                fontWeight: 700,
                color: "#1d2939",
                margin: "0 0 8px 0",
              }}
            >
              Something went wrong
            </h2>
            <p style={subtitleStyle}>
              The supply index couldn&apos;t be loaded. Please try again.
            </p>
          </Card>
        </div>
      </div>
    );
  }

  if (!items) {
    return (
      <div
        style={{
          ...pageStyle,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p style={{ fontFamily: "'Outfit', sans-serif", color: "#667085" }}>
          Loading...
        </p>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 440, margin: "0 auto", padding: "20px 16px 80px" }}>
        <div
          className="no-print"
          style={{ textAlign: "center", marginBottom: 20 }}
        >
          <div style={{ display: "inline-block", marginBottom: 16 }}>
            <Logo variant="horizontal" />
          </div>
          <h2 style={headingStyle}>Supply Index</h2>
          <p style={subtitleStyle}>Find which bin an item is in.</p>
        </div>

        <div
          className="no-print"
          style={{
            position: "sticky",
            top: 0,
            background: "#f5f6f8",
            padding: "8px 0",
            zIndex: 10,
          }}
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search for an item or a bin..."
            style={{
              width: "100%",
              padding: "11px 14px",
              borderRadius: "10px",
              border: "1.5px solid #d0d5dd",
              fontFamily: "'Outfit', sans-serif",
              fontSize: "14px",
              color: "#1d2939",
              background: "#fff",
              boxSizing: "border-box",
              outline: "none",
            }}
            onFocus={(e) => (e.target.style.borderColor = "#1e3a6e")}
            onBlur={(e) => (e.target.style.borderColor = "#d0d5dd")}
          />
        </div>

        <p
          className="no-print"
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: "13px",
            color: "#667085",
            margin: "8px 4px 14px",
          }}
        >
          {search.trim()
            ? `${filtered.length} ${filtered.length === 1 ? "match" : "matches"}`
            : `${items.length} items`}
        </p>

        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "32px 16px" }}>
            <p
              style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: "14px",
                color: "#98a2b3",
              }}
            >
              {search.trim()
                ? "No items found."
                : "The supply index is empty."}
            </p>
          </div>
        )}

        {groups.map(([letter, rows]) => (
          <div key={letter} className="inv-group" style={{ marginBottom: 14 }}>
            <p className="inv-letter" style={letterStyle}>
              {letter}
            </p>
            {/* Card takes no className, so the print overrides hang on a
                wrapper rather than on the card itself. */}
            <div className="inv-card">
              <Card style={{ padding: "2px 16px" }}>
                {rows.map((item, idx) => (
                  <div
                    key={item.id}
                    className="inv-row"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                      padding: "11px 0",
                      borderBottom:
                        idx === rows.length - 1 ? "none" : "1px solid #f0f2f5",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "'Outfit', sans-serif",
                        fontSize: "14px",
                        color: "#1d2939",
                      }}
                    >
                      {item.name}
                    </span>
                    <span className="inv-bin" style={{ flexShrink: 0 }}>
                      <Badge text={item.bin} />
                    </span>
                  </div>
                ))}
              </Card>
            </div>
          </div>
        ))}

        <div className="no-print" style={{ marginTop: 24 }}>
          <Button variant="outline" onClick={handlePrint}>
            🖨️ Print list
          </Button>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: auto; margin: 12mm; }
          body { margin: 0; background: #fff !important; }
          .inv-group {
            break-inside: avoid;
            margin-bottom: 8px !important;
          }
          .inv-letter { color: #000 !important; margin-bottom: 2px !important; }
          /* Card's inline styles need !important to be undone in print. */
          .inv-card > div {
            border: none !important;
            border-radius: 0 !important;
            padding: 0 !important;
            background: none !important;
          }
          .inv-row {
            padding: 1px 0 !important;
            border-bottom: none !important;
            color: #000 !important;
            font-size: 11pt;
          }
          /* Bin codes print as plain text — a tinted pill wastes toner and is
             the first thing a black-and-white printer flattens into mush. */
          .inv-bin span {
            background: none !important;
            color: #000 !important;
            padding: 0 !important;
            font-weight: 700;
          }
        }
      `}</style>
    </div>
  );
}
