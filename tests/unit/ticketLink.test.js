// Unit tests for src/lib/ticketLink.js, the link each ticket's QR code carries.
//
//   npm run test:unit

import { test } from "node:test";
import assert from "node:assert/strict";
import { TICKET_CODE_LENGTH, ticketCode, ticketUrl } from "../../src/lib/ticketLink.js";

const ID = "ad7bd0de-f0a6-4567-bb64-49d153ebc0a9";

test("the code is the UUID's first three groups, upper case, no dashes", () => {
  assert.equal(ticketCode(ID), "AD7BD0DEF0A64567");
  assert.equal(ticketCode(ID).length, TICKET_CODE_LENGTH);
  assert.equal(ticketCode(ID.toUpperCase()), "AD7BD0DEF0A64567");
});

test("the link is upper case end to end, so the QR can use alphanumeric mode", () => {
  assert.equal(
    ticketUrl("https://checkin.example.org", ID),
    "HTTPS://CHECKIN.EXAMPLE.ORG/T/AD7BD0DEF0A64567",
  );
  assert.equal(ticketUrl("http://localhost:5173", ID), "HTTP://LOCALHOST:5173/T/AD7BD0DEF0A64567");
  // A QR code's alphanumeric mode covers exactly these characters.
  assert.match(ticketUrl("https://checkin.example.org", ID), /^[0-9A-Z $%*+\-./:]+$/);
});

test("a trailing slash on the origin doesn't double up", () => {
  assert.equal(ticketUrl("https://checkin.example.org/", ID), "HTTPS://CHECKIN.EXAMPLE.ORG/T/AD7BD0DEF0A64567");
});

test("anything but a UUID is refused rather than printed as a broken link", () => {
  for (const bad of [undefined, null, "", "not-a-uuid", ID.slice(0, 35), `${ID}0`]) {
    assert.throws(() => ticketCode(bad), /Not a work-order id/);
  }
});
