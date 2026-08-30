import { useEffect, useMemo, useRef, useState } from "react";
import Checkbox from "./Checkbox";

// Multi-select event scope control for the Metrics tab.
//
// An anchored dropdown panel rather than a modal on purpose: every tick applies
// immediately, so the metrics behind the panel update as you go. An overlay you
// had to dismiss to see the effect would defeat the point of multi-select.
//
// Events are grouped by year with a tri-state heading, so "everything we did in
// 2026" stays a single tap without a separate row of year chips.

const yearOf = (ev) => (ev?.date || "").slice(0, 4);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// events.date is a plain date column — parsing it with `new Date` would shift a
// day in negative-offset timezones, so slice it.
function dayLabel(dateStr) {
  if (!dateStr) return "";
  const [, m, d] = dateStr.split("-");
  return `${MONTHS[Number(m) - 1] || m} ${Number(d)}`;
}

export default function EventPicker({ events, selectedIds, onChange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  // Newest first for display; years descending. (The caller keeps its own
  // oldest-first ordering for the charts — these are different concerns.)
  const groups = useMemo(() => {
    const byYear = new Map();
    [...events]
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .forEach((ev) => {
        const y = yearOf(ev) || "Undated";
        if (!byYear.has(y)) byYear.set(y, []);
        byYear.get(y).push(ev);
      });
    return [...byYear.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [events]);

  const label = useMemo(() => {
    if (!events.length) return "No events";
    if (selected.size === 0) return "No events selected";
    if (selected.size === events.length) {
      return events.length === 1 ? "All 1 event" : `All ${events.length} events`;
    }
    if (selected.size === 1) {
      const ev = events.find((e) => selected.has(e.id));
      return ev ? ev.name : "1 event selected";
    }
    // Exactly one complete year and nothing else — name the year.
    const years = new Set([...selected].map((id) => yearOf(events.find((e) => e.id === id))));
    if (years.size === 1) {
      const y = [...years][0];
      if (events.filter((e) => yearOf(e) === y).length === selected.size) {
        return `${y} · ${selected.size} events`;
      }
    }
    return `${selected.size} events selected`;
  }, [events, selected]);

  const setMany = (list, on) => {
    const next = new Set(selected);
    list.forEach((ev) => (on ? next.add(ev.id) : next.delete(ev.id)));
    onChange([...next]);
  };

  const bulkBtn = {
    background: "none",
    border: "none",
    padding: 0,
    fontFamily: "'Outfit', sans-serif",
    fontSize: "12px",
    fontWeight: 600,
    color: "#1e3a6e",
    cursor: "pointer",
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", marginBottom: 12 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: "100%",
          textAlign: "left",
          padding: "10px 32px 10px 12px",
          borderRadius: "10px",
          border: "1.5px solid #d0d5dd",
          fontFamily: "'Outfit', sans-serif",
          fontSize: "14px",
          fontWeight: 600,
          color: "#1e3a6e",
          background: "#fff",
          outline: "none",
          boxSizing: "border-box",
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%23667085' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 12px center",
          cursor: "pointer",
        }}
      >
        {label}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            // Below the StaffPortal tab bar (100), above page content.
            zIndex: 50,
            background: "#fff",
            border: "1px solid #e8ebf0",
            borderRadius: "10px",
            boxShadow: "0 6px 20px rgba(16,24,40,0.12)",
            // Scrolls internally instead of pushing the metrics down the page.
            maxHeight: 320,
            overflowY: "auto",
            padding: "12px 14px",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 12,
              paddingBottom: 10,
              marginBottom: 10,
              borderBottom: "1px solid #e8ebf0",
            }}
          >
            <button style={bulkBtn} onClick={() => onChange(events.map((e) => e.id))}>
              Select all
            </button>
            <button style={{ ...bulkBtn, color: "#667085" }} onClick={() => onChange([])}>
              Clear
            </button>
          </div>

          {groups.map(([year, list]) => {
            const chosen = list.filter((ev) => selected.has(ev.id)).length;
            return (
              <div key={year} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Checkbox
                    label={year}
                    checked={chosen === list.length}
                    indeterminate={chosen > 0 && chosen < list.length}
                    onChange={(on) => setMany(list, on)}
                    style={{ marginBottom: 0, flex: 1 }}
                  />
                  <span
                    style={{
                      fontFamily: "'Space Mono', monospace",
                      fontSize: "11px",
                      color: "#98a2b3",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {chosen} of {list.length}
                  </span>
                </div>

                <div style={{ paddingLeft: 14, marginTop: 6 }}>
                  {list.map((ev) => (
                    <Checkbox
                      key={ev.id}
                      label={`${ev.name} — ${dayLabel(ev.date)}`}
                      checked={selected.has(ev.id)}
                      onChange={(on) => setMany([ev], on)}
                      style={{ marginBottom: 8 }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
