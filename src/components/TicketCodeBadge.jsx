const font = "'Courier New', monospace";

export const TICKET_CODE_BADGE_MODE = Object.freeze({
  COMPACT: "compact",
  PRIORITY: "priority",
});

const TICKET_CODE_BADGE_COLOR_THEME = Object.freeze({
  DARK_ON_LIGHT: "DarkOnLight",
  LIGHT_ON_DARK: "LightOnDark",
});

export default function TicketCodeBadge({
  code,
  isVolunteer,
  mode = TICKET_CODE_BADGE_MODE.COMPACT,
}) {
  const isPriorityMode = mode === TICKET_CODE_BADGE_MODE.PRIORITY;
  const colorTheme =
    isPriorityMode
      ? TICKET_CODE_BADGE_COLOR_THEME.DARK_ON_LIGHT
      : TICKET_CODE_BADGE_COLOR_THEME.LIGHT_ON_DARK;
  const showVolunteerFlag = isPriorityMode && isVolunteer;
  const isDarkOnLight =
    colorTheme === TICKET_CODE_BADGE_COLOR_THEME.DARK_ON_LIGHT;
  const backgroundColor = isDarkOnLight ? "#fff" : "#000";
  const color = isDarkOnLight ? "#000" : "#fff";
  const displayCode = isPriorityMode ? `#${code}` : code;
  const topMarginOffset = isPriorityMode ? `0px` : `-20px`;

  return (
    <div
      style={{
        background: backgroundColor,
        color,
        padding: "4px 12px",
        fontSize: "18px",
        fontWeight: 700,
        fontFamily: font,
        letterSpacing: "2px",
        textAlign: isPriorityMode ? "right" : "left",
        minWidth: isPriorityMode ? 56 : undefined,
        printColorAdjust: "exact",
        WebkitPrintColorAdjust: "exact",
        marginTop: topMarginOffset,
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
            backgroundColor: color,
            color: backgroundColor,
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
