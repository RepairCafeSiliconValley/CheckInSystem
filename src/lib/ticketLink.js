// The link a ticket's QR code carries: HTTPS://<DOMAIN>/T/<CODE>.
//
// The code is the first 16 hex digits of the work order's UUID (its first three
// groups, dashes dropped). resolve_ticket_code() in
// supabase-ticket-code-migration.sql turns it back into the full id, and a
// unique index plus a retrying id default there guarantee no two work orders
// share a code.
//
// The whole link is upper case on purpose. A QR code can only use its compact
// alphanumeric mode (0-9, A-Z, space and $%*+-./:) when every character fits,
// and that mode packs ~5.5 bits a character instead of 8. Together with the
// shorter code it takes the ticket QR from 37×37 to 29×29 modules, which is
// what lets phones read it off wrinkled thermal paper. Upper case is safe here:
// the scheme and host are case-insensitive, the /T/ route matches either case,
// and the code is hex, which the lookup lower-cases.
//
// Pure — no React or Supabase — so it runs under plain node in tests/unit/.

export const TICKET_CODE_LENGTH = 16;

const HEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// "ad7bd0de-f0a6-4567-bb64-49d153ebc0a9" → "AD7BD0DEF0A64567"
export function ticketCode(workOrderId) {
  if (typeof workOrderId !== "string" || !HEX_UUID.test(workOrderId)) {
    throw new Error(`Not a work-order id: ${workOrderId}`);
  }
  return workOrderId.replace(/-/g, "").slice(0, TICKET_CODE_LENGTH).toUpperCase();
}

// origin is window.location.origin, e.g. "https://checkin.example.org".
export function ticketUrl(origin, workOrderId) {
  return `${origin.replace(/\/+$/, "")}/T/${ticketCode(workOrderId)}`.toUpperCase();
}
