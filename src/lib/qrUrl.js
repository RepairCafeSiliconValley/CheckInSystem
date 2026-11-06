// The values encoded into QR codes, and the parsing that undoes them.
//
// Pages must not build QR payloads inline from `window.location.origin` — the
// encoding below looks like a mistake unless you know why it's there, so it
// lives in one place.

const UNHYPHENATED_UUID = /^[0-9a-f]{32}$/i;

/**
 * The URL printed on a work-order ticket, as encoded into its QR code.
 *
 * Two things here are deliberate, and both exist to shrink the symbol so it
 * survives a 203 dpi thermal printer:
 *
 *   1. UPPERCASE. A QR code stores 5.5 bits per character in alphanumeric mode
 *      against 8 in byte mode, but that mode's charset is uppercase only. The
 *      scheme and host are case-insensitive by spec, React Router matches paths
 *      case-insensitively, and Postgres accepts uppercase hex as a uuid — so
 *      uppercasing costs nothing and saves a whole QR version. qrcode.react
 *      picks the mode automatically from the characters we hand it.
 *   2. No hyphens in the uuid. Four fewer characters, and Postgres accepts the
 *      32-digit form. This is what keeps a preview deployment's long
 *      *.vercel.app host inside version 5 instead of spilling to 6.
 *
 * `normalizeWorkOrderId` below turns the result back into a canonical uuid when
 * the fixer page reads it out of the URL.
 */
export function fixerQrValue(workOrderId) {
  const bare = String(workOrderId).replace(/-/g, "");
  return `${window.location.origin}/fix/${bare}`.toUpperCase();
}

/**
 * Canonicalise a work-order id arriving from a route param.
 *
 * Tickets printed since `fixerQrValue` landed carry the uppercase, hyphen-less
 * form; older tickets and ordinary links carry a normal uuid. Both have to
 * work, so re-hyphenate the former and leave everything else alone.
 *
 * Anything that isn't 32 hex characters passes through untouched on purpose: a
 * junk id has to keep reaching the RPC and failing its uuid cast, because that
 * is what renders "Item Not Found" rather than an error.
 */
export function normalizeWorkOrderId(raw) {
  if (typeof raw !== "string" || !UNHYPHENATED_UUID.test(raw)) return raw;
  const hex = raw.toLowerCase();
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}
