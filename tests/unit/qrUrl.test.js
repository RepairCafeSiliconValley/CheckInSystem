// Unit tests for src/lib/qrUrl.js — the QR payload encoding and the parsing
// that undoes it. Plain node:test, no browser or database:
//
//   npm run test:unit

import { test } from "node:test";
import assert from "node:assert/strict";
import { fixerQrValue, normalizeWorkOrderId } from "../../src/lib/qrUrl.js";

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const BARE = "550E8400E29B41D4A716446655440000";

// fixerQrValue reads window.location.origin at call time, so a stub set here is
// enough — there is no browser in this runner.
function withOrigin(origin, fn) {
  const had = "window" in globalThis;
  const previous = globalThis.window;
  globalThis.window = { location: { origin } };
  try {
    return fn();
  } finally {
    if (had) globalThis.window = previous;
    else delete globalThis.window;
  }
}

// ── fixerQrValue ──

test("fixerQrValue uppercases and strips the uuid's hyphens", () => {
  const value = withOrigin("https://checkin.repaircafesv.org", () => fixerQrValue(UUID));
  assert.equal(value, `HTTPS://CHECKIN.REPAIRCAFESV.ORG/FIX/${BARE}`);
});

// The whole point of the encoding: every character has to be in QR's
// alphanumeric charset, or the encoder silently drops to byte mode (8 bits per
// character instead of 5.5) and the printed symbol grows a version. A lowercase
// letter or an underscore slipped into the origin or the path would do it.
test("fixerQrValue stays inside QR's alphanumeric charset", () => {
  const ALPHANUMERIC = /^[0-9A-Z $%*+\-./:]+$/;
  for (const origin of [
    "https://checkin.repaircafesv.org",
    "https://dev-checkin.repaircafesv.org",
    "http://localhost:5173",
  ]) {
    const value = withOrigin(origin, () => fixerQrValue(UUID));
    assert.match(value, ALPHANUMERIC, `${origin} produced a non-alphanumeric payload`);
  }
});

test("fixerQrValue accepts an already hyphen-less id", () => {
  const value = withOrigin("https://checkin.repaircafesv.org", () => fixerQrValue(BARE));
  assert.equal(value, `HTTPS://CHECKIN.REPAIRCAFESV.ORG/FIX/${BARE}`);
});

// ── normalizeWorkOrderId ──

test("normalizeWorkOrderId re-hyphenates the printed form", () => {
  assert.equal(normalizeWorkOrderId(BARE), UUID);
  assert.equal(normalizeWorkOrderId(BARE.toLowerCase()), UUID);
});

test("normalizeWorkOrderId leaves a canonical uuid alone", () => {
  assert.equal(normalizeWorkOrderId(UUID), UUID);
});

// A junk id has to keep reaching the RPC and failing its uuid cast — that is
// what renders "Item Not Found" instead of an error (see e2e/routing.spec.js).
test("normalizeWorkOrderId passes anything else through untouched", () => {
  for (const raw of ["not-a-uuid", "x", "", "550e8400e29b41d4a71644665544", undefined]) {
    assert.equal(normalizeWorkOrderId(raw), raw);
  }
});

test("normalizeWorkOrderId round-trips what fixerQrValue produced", () => {
  const value = withOrigin("https://checkin.repaircafesv.org", () => fixerQrValue(UUID));
  const fromUrl = value.slice(value.lastIndexOf("/") + 1);
  assert.equal(normalizeWorkOrderId(fromUrl), UUID);
});
