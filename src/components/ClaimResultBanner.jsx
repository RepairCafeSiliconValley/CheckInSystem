// What happened to the text, shown above the outcome form once an item has
// just been claimed. The Edge Function returns a reason for every path it can
// take; each one gets copy telling the fixer whether to expect the client or
// go and find them.

function copyFor(result, clientName) {
  const who = <strong>{clientName}</strong>;
  if (result.texted) {
    return { emoji: "📲", body: <>We've texted {who} to come to the repair area.</> };
  }
  switch (result.reason) {
    case "not_requested":
      return {
        emoji: "🔕",
        body: <>No text sent — please look for {who} in the waiting area.</>,
      };
    case "already_sent":
      return {
        emoji: "✅",
        body: <>{who} was already texted. They're on their way.</>,
      };
    case "no_phone":
      return {
        emoji: "🔔",
        body: (
          <>
            {who} didn't leave a number — please look for them in the waiting
            area.
          </>
        ),
      };
    case "no_consent":
      return {
        emoji: "🔔",
        body: (
          <>
            {who} didn't give consent for texts — please look for them in the
            waiting area.
          </>
        ),
      };
    case "messaging_off":
      return {
        emoji: "🔔",
        body: (
          <>
            This event isn't collecting phone numbers, so no text was sent.
            Please look for {who} in the waiting area.
          </>
        ),
      };
    case "no_template":
      return {
        emoji: "🔔",
        body: (
          <>
            No message template is set for this event, so no text was sent.
            Please look for {who} in the waiting area and let a coordinator
            know.
          </>
        ),
      };
    case "sms_not_configured":
      return {
        emoji: "🔔",
        body: (
          <>Texting isn't set up yet — please look for {who} in the waiting area.</>
        ),
      };
    default:
      return {
        emoji: "🔔",
        body: (
          <>
            We couldn't send the text — please look for {who} in the waiting
            area.
          </>
        ),
      };
  }
}

export default function ClaimResultBanner({ result, clientName, itemName }) {
  const copy = copyFor(result, clientName);
  const sent = Boolean(result.texted);

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        padding: "12px 14px",
        borderRadius: 10,
        background: sent ? "#e8f5e9" : "#f4f3ff",
        border: `1px solid ${sent ? "#c8e6c9" : "#e4e0f7"}`,
        marginBottom: 16,
      }}
    >
      <span style={{ fontSize: "18px", lineHeight: 1.3 }}>{copy.emoji}</span>
      <div>
        <p
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: "14px",
            color: "#1d2939",
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          <strong>Claimed.</strong> {copy.body}
        </p>
        <p
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: "13px",
            color: "#667085",
            lineHeight: 1.5,
            margin: "4px 0 0 0",
          }}
        >
          Thank you for working on the <strong>{itemName}</strong>. Good luck
          with the fix!
        </p>
      </div>
    </div>
  );
}
