// Per-event text message template: the default copy, the tokens coordinators
// can use, and the GSM-7 / segment maths the editor needs.
//
// The template itself lives on events.text_message_template (migration v9) and
// is rendered at send time by supabase/functions/claim-and-notify/index.ts.
// That Edge Function runs on Deno and cannot import from src/, so it carries
// its own copy of renderTemplate — keep the two in step.

// Pre-fills the Create Event form. Must match the column default in
// supabase-migration-v9.sql. That SQL copy is a frozen historical artifact
// once the migration has run; this constant is the one to keep up to date.
//
// Straight apostrophe on purpose — see isGsm7 below.
export const DEFAULT_TEXT_MESSAGE =
  "It's your turn! Come to the check-in desk to meet the Repair Café " +
  "volunteer who will help you fix your [item_name].";

// The only tokens the Edge Function substitutes. Anything else in square
// brackets is left in the message verbatim, so a typo shows up in the
// delivered text instead of silently vanishing.
export const TEMPLATE_VARIABLES = [
  {
    token: "[item_name]",
    description: "The item being repaired, e.g. “Coffee machine”",
  },
  {
    token: "[client_first_name]",
    description: "The client’s first name, e.g. “Maria”",
  },
  {
    token: "[fixer_name]",
    description: "The volunteer who scanned the ticket to claim the item",
  },
];

// DUPLICATED IN supabase/functions/claim-and-notify/index.ts — that file runs
// on Deno and can't import from src/. The Edge Function copy is the one that
// actually ships messages; keep the two allowlists in step.
const TOKEN_PATTERN = /\[(item_name|client_first_name|fixer_name)\]/g;

// Substitute the known tokens. `values` is keyed by bare token name.
export function renderTemplate(template, values) {
  if (!template) return "";
  return template.replace(TOKEN_PATTERN, (match, key) => {
    const v = values?.[key];
    // An empty or missing value falls back to the literal token rather than
    // leaving a hole in the sentence.
    return v == null || v === "" ? match : String(v);
  });
}

// Stand-in values for the editor preview. Deliberately generic: the Create
// Event form has no event yet, so there is no real data to draw on, and the
// same component serves both that form and the settings modal.
export const SAMPLE_VALUES = {
  item_name: "Coffee machine",
  client_first_name: "Maria",
  fixer_name: "Sam",
};

// Same substitution as renderTemplate, but returns the result as a list of
// runs tagged with whether they came from a token — so the preview can tint
// the dynamic parts. Join the `text` fields to get the plain rendered string.
export function renderTemplateParts(template, values) {
  const src = template ?? "";
  if (!src) return [];
  const parts = [];
  // A fresh regex each call: TOKEN_PATTERN is global and module-level, so
  // reusing it with exec() would carry lastIndex between calls.
  const re = new RegExp(TOKEN_PATTERN.source, "g");
  let last = 0;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (m.index > last) {
      parts.push({ text: src.slice(last, m.index), isValue: false });
    }
    const v = values?.[m[1]];
    const filled = v != null && v !== "";
    parts.push({ text: filled ? String(v) : m[0], isValue: filled });
    last = m.index + m[0].length;
  }
  if (last < src.length) parts.push({ text: src.slice(last), isValue: false });
  return parts;
}

// ─── SMS encoding ───
//
// A message is billed per segment, and the segment size depends on encoding.
// Everything in the GSM 03.38 alphabet fits 160 characters per segment; a
// single character outside it forces the whole message into UCS-2, which
// allows only 70. Phone and tablet keyboards silently substitute curly quotes
// and en-dashes, so a coordinator can double the cost of every text without
// seeing any difference in the box.

const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅå" +
  "Δ_ΦΓΛΩΠΨΣΘΞÆæßÉ" +
  " !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§" +
  "¿abcdefghijklmnopqrstuvwxyzäöñüà";

// These cost two septets each.
const GSM7_EXTENDED = "\f^{}\\[~]|€";

function isGsm7(char) {
  return GSM7_BASIC.includes(char) || GSM7_EXTENDED.includes(char);
}

// Characters a keyboard is likely to autocorrect into the message, mapped to
// the ASCII equivalent that keeps it in GSM-7.
const SMART_PUNCTUATION = {
  "‘": "'", // left single quote
  "’": "'", // right single quote / apostrophe
  "‚": "'",
  "“": '"', // left double quote
  "”": '"', // right double quote
  "„": '"',
  "–": "-", // en dash
  "—": "-", // em dash
  "…": "...", // ellipsis
  "\u00A0": " ", // non-breaking space (escaped: invisible in source)
};

export function fixSmartPunctuation(text) {
  if (!text) return text;
  return text.replace(
    /[‘’‚“”„–—…\u00A0]/g,
    (c) => SMART_PUNCTUATION[c],
  );
}

// Returns what the editor needs to show: encoding, how many segments this
// would bill, the per-segment limit, and which characters forced UCS-2.
export function smsSegments(text) {
  const chars = [...(text ?? "")];
  const offenders = [...new Set(chars.filter((c) => !isGsm7(c)))];
  const gsm7 = offenders.length === 0;

  // In GSM-7 an extended character occupies two septets; in UCS-2 everything
  // is one unit (astral characters would be two, but those can't reach GSM-7
  // anyway and are vanishingly rare here).
  const units = gsm7
    ? chars.reduce((n, c) => n + (GSM7_EXTENDED.includes(c) ? 2 : 1), 0)
    : chars.length;

  const singleLimit = gsm7 ? 160 : 70;
  // Concatenated messages spend part of each segment on a header.
  const multiLimit = gsm7 ? 153 : 67;
  const segments =
    units === 0 ? 0 : units <= singleLimit ? 1 : Math.ceil(units / multiLimit);

  return {
    encoding: gsm7 ? "GSM-7" : "UCS-2",
    units,
    limit: segments > 1 ? multiLimit : singleLimit,
    segments,
    offenders,
    canFix: offenders.some((c) => c in SMART_PUNCTUATION),
  };
}
