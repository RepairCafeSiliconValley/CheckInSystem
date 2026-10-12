const font = "'Courier New', monospace";

export const TICKET_CODE_BADGE_MODE = Object.freeze({
  COMPACT: "compact",
  PRIORITY: "priority",
});

// The volunteer pill. Sized to sit level with the bare glyph beside it.
const pillBase = {
  display: "inline-block",
  fontSize: "10pt",
  lineHeight: "17px",
  borderRadius: "12px",
  printColorAdjust: "exact",
  WebkitPrintColorAdjust: "exact",
};

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
  isVolunteer,
  // Will this client get a text when the item is claimed? Only rendered in
  // PRIORITY mode, alongside the volunteer flag.
  canTextClient = false,
  mode = TICKET_CODE_BADGE_MODE.COMPACT,
}) {
  const isPriorityMode = mode === TICKET_CODE_BADGE_MODE.PRIORITY;
  const showVolunteerFlag = isPriorityMode && isVolunteer;
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
      {(showVolunteerFlag || showTextFlag) && (
        // Gap lives here rather than on the pills, so one pill or two spaces
        // identically from the code. Replaces the old hardcoded 20px margin,
        // which only worked when the volunteer flag was the sole marker.
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            // An inline-flex box inherits its baseline from its FIRST flex
            // item. With the V pill present that's a text baseline and the row
            // lines up with #1; with only the glyph there is no text baseline
            // and it drifts. Aligning the wrapper explicitly makes the result
            // identical whichever markers are showing.
            verticalAlign: "middle",
            gap: "10px",
            marginLeft: "20px",
          }}
        >
          {showVolunteerFlag && (
            // Padding is lopsided because the parent sets letterSpacing: 2px,
            // which adds a phantom gap after the V but not before it.
            <span
              style={{
                ...pillBase,
                padding: "2px 4px 2px 7px",
                backgroundColor: "#000",
                color: "#fff",
              }}
            >
              V
            </span>
          )}
          {showTextFlag && (
            // No pill around it: the filled bubble reads clearly on its own,
            // and against the solid volunteer pill the two stay easy to tell
            // apart without a border doing the work.
            <span style={{ display: "inline-flex" }}>
              <MessageGlyph />
            </span>
          )}
        </span>
      )}
    </div>
  );
}
