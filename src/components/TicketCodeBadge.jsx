const font = "'Courier New', monospace";

export const TICKET_CODE_BADGE_MODE = Object.freeze({
  COMPACT: "compact",
  PRIORITY: "priority",
});

export default function TicketCodeBadge({
  code,
  isVolunteer,
  mode = TICKET_CODE_BADGE_MODE.COMPACT,
}) {
  const isPriorityMode = mode === TICKET_CODE_BADGE_MODE.PRIORITY;
  const showVolunteerFlag = isPriorityMode && isVolunteer;
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
      {showVolunteerFlag && (
        <span
          style={{
            display: "inline-block",
            fontSize: "8pt",
            padding: "2px 3px 1px 5px",
            margin: "1px 0px 0px 20px",
            backgroundColor: "#000",
            color: "#fff",
            borderRadius: "11px",
            lineHeight: "13px",
            verticalAlign: "top",
          }}
        >
          V
        </span>
      )}
    </div>
  );
}
