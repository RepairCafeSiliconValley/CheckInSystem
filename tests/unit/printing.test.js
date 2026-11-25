// Unit tests for src/lib/printing.js (print settings, REPRINT, MAC addresses,
// the CloudPRNT ticket snapshot) and supabase/functions/cloudprnt/starTicket.js
// (the Star printer commands).
//
//   npm run test:unit

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTicketSnapshot,
  formatLastSeen,
  isPrinterOnline,
  isReprint,
  nextPrintCount,
  normalizeMac,
  printSettings,
} from "../../src/lib/printing.js";
import {
  LINE_WIDTH,
  buildStarTicket,
  buildTextTicket,
  spreadLine,
  toPrintableAscii,
} from "../../supabase/functions/cloudprnt/starTicket.js";

const WO = {
  id: "ad7bd0de-f0a6-4567-bb64-49d153ebc0a9",
  code: "M4K-2",
  priority: 2,
  category: "Electronics",
  item_name: "Radio",
  description: "No sound",
  print_count: 0,
};

const TICKET = buildTicketSnapshot(WO, {
  attendeeName: "José G.",
  isVolunteer: true,
  canTextClient: true,
  submittedLabel: "10:42 AM",
  origin: "https://checkin.example.org",
});

// ── printing.js ──

test("events from before the migration keep window.print() with a preview", () => {
  assert.deepEqual(printSettings({}), { legacy: true, preview: true });
  assert.deepEqual(printSettings(null), { legacy: true, preview: true });
  assert.deepEqual(
    printSettings({ use_legacy_print: false, print_preview: false }),
    { legacy: false, preview: false },
  );
});

test("REPRINT only once the count, including this print, is above 1", () => {
  assert.equal(isReprint(1), false);
  assert.equal(isReprint(2), true);
  assert.equal(isReprint(undefined), false);
  assert.equal(nextPrintCount({ print_count: 0 }), 1);
  assert.equal(nextPrintCount({ print_count: 1 }), 2);
  // A row from before the migration has no count: its next print is the first.
  assert.equal(nextPrintCount({}), 1);
});

test("MAC addresses are normalised the way SQL's normalize_mac() does", () => {
  assert.equal(normalizeMac("00-11-62-AA-BB-CC"), "00:11:62:aa:bb:cc");
  assert.equal(normalizeMac("0011.62aa.bbcc"), "00:11:62:aa:bb:cc");
  assert.equal(normalizeMac(" 00:11:62:aa:bb:cc "), "00:11:62:aa:bb:cc");
  assert.equal(normalizeMac("00:11:62:aa:bb"), null);
  assert.equal(normalizeMac(""), null);
  assert.equal(normalizeMac(null), null);
});

test("the ticket snapshot carries what the HTML ticket shows", () => {
  assert.deepEqual(TICKET, {
    work_order_id: WO.id,
    submitted_label: "10:42 AM",
    priority: 2,
    can_text_client: true,
    category: "Electronics",
    item_name: "Radio",
    description: "No sound",
    client_name: "José G.",
    is_volunteer: true,
    ticket_code: "M4K",
    qr_url: "HTTPS://CHECKIN.EXAMPLE.ORG/T/AD7BD0DEF0A64567",
  });
});

test("printer status: online within 30 seconds, and a readable age", () => {
  const now = Date.parse("2030-01-01T12:00:00Z");
  assert.equal(isPrinterOnline("2030-01-01T11:59:40Z", now), true);
  assert.equal(isPrinterOnline("2030-01-01T11:59:00Z", now), false);
  assert.equal(isPrinterOnline(null, now), false);
  assert.equal(formatLastSeen(null, now), "never");
  assert.equal(formatLastSeen("2030-01-01T11:59:58Z", now), "just now");
  assert.equal(formatLastSeen("2030-01-01T11:59:20Z", now), "40 s ago");
  assert.equal(formatLastSeen("2030-01-01T11:55:00Z", now), "5 min ago");
  assert.equal(formatLastSeen("2030-01-01T09:00:00Z", now), "3 h ago");
});

// ── starTicket.js ──

const ascii = (bytes) => String.fromCharCode(...bytes);
const ESC = "\x1b";

test("user text is reduced to printable ASCII, so it can't carry printer commands", () => {
  assert.equal(toPrintableAscii("José Müller"), "Jose Muller");
  assert.equal(toPrintableAscii("it’s “broken” — badly"), "it's \"broken\" - badly");
  assert.equal(toPrintableAscii(`evil${ESC}@\x1d\x07 text`), "evil?@?? text");
  assert.equal(toPrintableAscii("two\nlines\tand  tabs"), "two lines and tabs");
  assert.equal(toPrintableAscii("日本"), "??");
  assert.equal(toPrintableAscii(null), "");
});

test("spreadLine pads to the width and never cuts the right side", () => {
  assert.equal(spreadLine("10:42 AM", "#2", 24), "10:42 AM              #2");
  assert.equal(spreadLine("10:42 AM", "#2", 24).length, 24);
  assert.equal(spreadLine("a very long left side here", "#12", 12), "a very l #12");
});

test("the Star ticket starts with a reset, ends with a cut, and has the fields", () => {
  const bytes = buildStarTicket(TICKET, { printCount: 1 });
  assert.ok(bytes instanceof Uint8Array);
  const s = ascii(bytes);
  assert.ok(s.startsWith(`${ESC}@`), "ESC @ first");
  assert.ok(s.endsWith(`${ESC}d\x03`), "partial cut last");
  for (const text of ["ELECTRONICS", "ITEM: ", "Radio", "ISSUE: ", "No sound", "CLIENT: ", "Jose G. [V]", "M4K", "#2 [TXT]", "SCAN TO CLAIM OR"]) {
    assert.ok(s.includes(text), `has ${text}`);
  }
  assert.ok(!s.includes("REPRINT"), "a first print says nothing about reprinting");
});

test("a command byte typed into a field never reaches the printer", () => {
  const evil = { ...TICKET, description: `x${ESC}d\x00y` }; // ESC d 0 = cut now
  const s = ascii(buildStarTicket(evil));
  assert.ok(s.includes("ISSUE: "));
  assert.ok(s.includes("x?d?y"));
  assert.equal(s.split(`${ESC}d`).length - 1, 1, "only the final cut");
});

test("the Star ticket says REPRINT at the top when printed before", () => {
  const s = ascii(buildStarTicket(TICKET, { printCount: 2 }));
  const reprint = s.indexOf("REPRINT");
  assert.ok(reprint > 0);
  assert.ok(reprint < s.indexOf("10:42 AM"), "REPRINT comes before the top row");
  // Large and bold: ESC E (bold) and ESC i 2 2 (triple size) just before it.
  assert.ok(s.slice(0, reprint).endsWith(`${ESC}E${ESC}i\x02\x02`));
});

test("the QR code carries the ticket link with its exact length", () => {
  const s = ascii(buildStarTicket(TICKET));
  const url = TICKET.qr_url;
  const store = `${ESC}\x1dyD1\x00${String.fromCharCode(url.length)}\x00${url}`;
  assert.ok(s.includes(store), "ESC GS y D 1 0 nL nH <url>");
  assert.ok(s.includes(`${ESC}\x1dyP`), "ESC GS y P prints it");
});

test("the plain-text ticket fits the paper and marks reprints", () => {
  const first = buildTextTicket(TICKET, { printCount: 1 });
  assert.ok(first.split("\n").every((line) => line.length <= LINE_WIDTH));
  assert.ok(first.includes("CLIENT: Jose G. [V]"));
  assert.ok(!first.includes("REPRINT"));
  assert.ok(buildTextTicket(TICKET, { printCount: 3 }).startsWith(" ".repeat(16) + "*** REPRINT ***"));
});
