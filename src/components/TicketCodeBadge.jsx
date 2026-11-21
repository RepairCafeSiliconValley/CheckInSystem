const font = "'Courier New', monospace";

export const TICKET_CODE_BADGE_MODE = Object.freeze({
  COMPACT: "compact",
  PRIORITY: "priority",
});

// The volunteer marker: a solid black pill with a white V, printed after the
// client's name on the ticket (it used to sit beside the priority number).
// Solid fill for the same reason as the message glyph below: thermal printers
// are 1-bit and thin outlines drop out.
export function VolunteerPill() {
  return (
    <span
      title="Volunteer"
      aria-label="Volunteer"
      style={{
        display: "inline-block",
        marginLeft: "8px",
        padding: "2px 6px",
        fontSize: "10pt",
        lineHeight: "17px",
        fontWeight: 700,
        fontFamily: font,
        borderRadius: "12px",
        backgroundColor: "#000",
        color: "#fff",
        verticalAlign: "middle",
        printColorAdjust: "exact",
        WebkitPrintColorAdjust: "exact",
      }}
    >
      V
    </span>
  );
}

// Solid-filled bubble, never stroked — thermal printers are 1-bit and thin
// outlines drop out. It carries no container of its own, so the filled shape
// is the entire marker and there is nothing left to fail to print.
function MessageGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="17"
      height="17"
      fill="#000"
      aria-hidden="true"
      focusable="false"
      style={{ display: "block" }}
    >
      <path d="M2 2h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6.5L3 14.5V11H2a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
    </svg>
  );
}

export default function TicketCodeBadge({
  code,
  // Will this client get a text when the item is claimed? Only rendered in
  // PRIORITY mode.
  canTextClient = false,
  mode = TICKET_CODE_BADGE_MODE.COMPACT,
}) {
  const isPriorityMode = mode === TICKET_CODE_BADGE_MODE.PRIORITY;
  const showTextFlag = isPriorityMode && canTextClient;
  const displayCode = isPriorityMode ? `#${code}` : code;

  return (
    <div
      style={{
        background: "#fff",
        color: "#000",
        padding: "4px 12px",
        fontSize: "18px",
        fontWeight: 700,
        fontFamily: font,
        letterSpacing: "2px",
        textAlign: isPriorityMode ? "right" : "left",
        minWidth: isPriorityMode ? 56 : undefined,
        printColorAdjust: "exact",
        WebkitPrintColorAdjust: "exact",
      }}
    >
      {displayCode}
      {showTextFlag && (
        // No pill around it: the filled bubble reads clearly on its own. The
        // wrapper is aligned explicitly because an inline-flex box with no
        // text inside has no baseline of its own and would drift from #1.
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            verticalAlign: "middle",
            marginLeft: "20px",
          }}
        >
          <MessageGlyph />
        </span>
      )}
    </div>
  );
}
