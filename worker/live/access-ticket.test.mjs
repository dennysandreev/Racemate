import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { verifyAndConsumeLiveTicket } from "./access-ticket.mjs";

const secret = "s".repeat(32);
const now = 1_800_000_000;

function ticket(overrides = {}) {
  const payload = Buffer.from(JSON.stringify({
    aud: "raceside-live",
    exp: now + 90,
    iat: now,
    jti: "00000000-0000-4000-8000-000000000001",
    sub: "00000000-0000-4000-8000-000000000002",
    ...overrides,
  })).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

test("valid ticket is accepted only once", () => {
  const used = new Map();
  const value = ticket();
  assert.equal(verifyAndConsumeLiveTicket(value, secret, used, now)?.userId, "00000000-0000-4000-8000-000000000002");
  assert.equal(verifyAndConsumeLiveTicket(value, secret, used, now), null);
});

test("wrong audience, expiry, excessive ttl and forged signature are rejected", () => {
  assert.equal(verifyAndConsumeLiveTicket(ticket({ aud: "other" }), secret, new Map(), now), null);
  assert.equal(verifyAndConsumeLiveTicket(ticket({ exp: now }), secret, new Map(), now), null);
  assert.equal(verifyAndConsumeLiveTicket(ticket({ exp: now + 121 }), secret, new Map(), now), null);
  assert.equal(verifyAndConsumeLiveTicket(`${ticket()}0`, secret, new Map(), now), null);
});
