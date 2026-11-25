// Builds the repair ticket for a Star printer — the CloudPRNT counterpart of
// the HTML ticket in src/components/PrintTickets.jsx. Keep the two in step:
// same fields, same order, REPRINT at the top when the item has been printed
// before.
//
// Plain JavaScript with no imports so it runs on Deno (the cloudprnt Edge
// Function) and under plain node (tests/unit/starTicket.test.js).
//
// Two outputs:
//   buildStarTicket()  — StarPRNT / Star Line Mode command bytes, for
//                        "application/vnd.star.starprnt" and
//                        "application/vnd.star.line". Both command sets share
//                        every command used here.
//   buildTextTicket()  — plain text, for "text/plain", should a printer ask for
//                        it. No QR code: plain text can't carry one.
//
// Paper: 80 mm (72 mm printable, 576 dots), font A, 48 characters a line.
//
// `ticket` is the snapshot the desk sends (buildTicketSnapshot() in
// src/lib/printing.js):
//   { submitted_label, priority, can_text_client, category, item_name,
//     description, client_name, is_volunteer, ticket_code, qr_url }

export const LINE_WIDTH = 48;

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

// Every byte of user text goes through here. Only printable ASCII survives,
// which keeps the text inside the printer's default code page and — more to the
// point — means a description can never smuggle a command byte (ESC, GS…) into
// the job. Accents are dropped rather than replaced ("José" → "Jose").
export function toPrintableAscii(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[^\x20-\x7e]/g, "?")
    .trim();
}

// Left and right text on one line of `width` characters. The right side wins
// when they don't both fit, so the priority number is never cut.
export function spreadLine(left, right, width) {
  const l = toPrintableAscii(left);
  const r = toPrintableAscii(right);
  const gap = width - l.length - r.length;
  if (gap >= 1) return l + " ".repeat(gap) + r;
  const room = Math.max(0, width - r.length - 1);
  return (room > 0 ? l.slice(0, room) + " " : "") + r;
}

export function isReprint(printCount) {
  return Number(printCount) > 1;
}

function topRight(ticket) {
  const priority = ticket.priority != null && ticket.priority !== "" ? `#${ticket.priority}` : "";
  // The preview draws a filled speech bubble; text says the same thing.
  return ticket.can_text_client ? `${priority} [TXT]`.trim() : priority;
}

function clientLine(ticket) {
  return `${toPrintableAscii(ticket.client_name)}${ticket.is_volunteer ? " [V]" : ""}`;
}

class Commands {
  constructor() {
    this.bytes = [];
  }
  raw(...values) {
    this.bytes.push(...values);
    return this;
  }
  text(value) {
    const s = toPrintableAscii(value);
    for (let i = 0; i < s.length; i++) this.bytes.push(s.charCodeAt(i));
    return this;
  }
  // A string already made safe by toPrintableAscii (keeps padding spaces).
  safeText(s) {
    for (let i = 0; i < s.length; i++) this.bytes.push(s.charCodeAt(i));
    return this;
  }
  lf(count = 1) {
    for (let i = 0; i < count; i++) this.bytes.push(LF);
    return this;
  }
  // ESC GS a n — 0 left, 1 centre, 2 right.
  align(where) {
    return this.raw(ESC, GS, 0x61, { left: 0, center: 1, right: 2 }[where]);
  }
  // ESC E / ESC F — emphasised (bold) on / off.
  bold(on) {
    return this.raw(ESC, on ? 0x45 : 0x46);
  }
  // ESC i n1 n2 — character height and width multipliers, 1–6 (sent as 0–5).
  size(height, width) {
    return this.raw(ESC, 0x69, height - 1, width - 1);
  }
  divider() {
    return this.safeText("-".repeat(LINE_WIDTH)).lf();
  }
  // ESC GS y S 0 n (model 2), ESC GS y S 1 n (error correction), ESC GS y S 2 n
  // (cell size in dots), ESC GS y D 1 0 nL nH data (store), ESC GS y P (print).
  // The URL is already upper-case alphanumeric (src/lib/ticketLink.js).
  qr(data, cellSize = 8) {
    const s = toPrintableAscii(data);
    this.raw(ESC, GS, 0x79, 0x53, 0x30, 2);
    this.raw(ESC, GS, 0x79, 0x53, 0x31, 1); // level M, as on the HTML ticket
    this.raw(ESC, GS, 0x79, 0x53, 0x32, cellSize);
    this.raw(ESC, GS, 0x79, 0x44, 0x31, 0x00, s.length & 0xff, (s.length >> 8) & 0xff);
    this.safeText(s);
    return this.raw(ESC, GS, 0x79, 0x50);
  }
  // ESC d 3 — feed to the cutter, then a partial cut.
  cut() {
    return this.raw(ESC, 0x64, 3);
  }
  toUint8Array() {
    return Uint8Array.from(this.bytes);
  }
}

export function buildStarTicket(ticket, { printCount = 1 } = {}) {
  const c = new Commands();
  c.raw(ESC, 0x40); // ESC @ — reset

  if (isReprint(printCount)) {
    c.align("center").bold(true).size(3, 3).safeText("REPRINT").lf();
    c.size(1, 1).bold(false).lf();
  }

  // Top row: submission time and priority number, double size (24 columns).
  c.align("left").bold(true).size(2, 2);
  c.safeText(spreadLine(ticket.submitted_label, topRight(ticket), LINE_WIDTH / 2)).lf();
  c.size(1, 1).bold(false);
  c.divider();

  c.align("center").bold(true).size(2, 1).text(String(ticket.category ?? "").toUpperCase()).lf();
  c.size(1, 1).bold(false);
  c.align("left").divider();

  c.safeText("ITEM: ").bold(true).text(ticket.item_name).bold(false).lf();
  c.safeText("ISSUE: ").bold(true).text(ticket.description).bold(false).lf();
  c.divider();

  c.safeText("CLIENT: ").bold(true).safeText(clientLine(ticket)).bold(false).lf();
  c.divider();

  c.align("center");
  if (ticket.ticket_code) {
    c.bold(true).size(2, 2).text(ticket.ticket_code).lf().size(1, 1).bold(false);
  }
  if (ticket.qr_url) c.qr(ticket.qr_url).lf();
  c.bold(true).safeText("SCAN TO CLAIM OR").lf().safeText("SUBMIT OUTCOME").lf().bold(false);
  c.align("left").lf(2).cut();
  return c.toUint8Array();
}

export function buildTextTicket(ticket, { printCount = 1 } = {}) {
  const center = (s) => {
    const t = toPrintableAscii(s);
    const pad = Math.max(0, Math.floor((LINE_WIDTH - t.length) / 2));
    return " ".repeat(pad) + t;
  };
  const rule = "-".repeat(LINE_WIDTH);
  const lines = [];
  if (isReprint(printCount)) lines.push(center("*** REPRINT ***"), "");
  lines.push(
    spreadLine(ticket.submitted_label, topRight(ticket), LINE_WIDTH),
    rule,
    center(String(ticket.category ?? "").toUpperCase()),
    rule,
    `ITEM: ${toPrintableAscii(ticket.item_name)}`,
    `ISSUE: ${toPrintableAscii(ticket.description)}`,
    rule,
    `CLIENT: ${clientLine(ticket)}`,
    rule,
  );
  if (ticket.ticket_code) lines.push(center(ticket.ticket_code));
  lines.push("", "", "");
  return lines.join("\n");
}
