import assert from "node:assert/strict";
import test from "node:test";

import { formatSubscriptionTimeLeft } from "./subscription-display.ts";

const now = Date.parse("2026-09-15T12:00:00.000Z");

test("formats the remaining subscription duration with Russian declension", () => {
  assert.equal(
    formatSubscriptionTimeLeft("2026-09-16T12:00:00.000Z", now),
    "Ещё 1 день",
  );
  assert.equal(
    formatSubscriptionTimeLeft("2026-09-18T12:00:00.000Z", now),
    "Ещё 3 дня",
  );
  assert.equal(
    formatSubscriptionTimeLeft("2026-09-27T12:00:00.000Z", now),
    "Ещё 12 дней",
  );
  assert.equal(
    formatSubscriptionTimeLeft("2026-10-06T12:00:00.000Z", now),
    "Ещё 21 день",
  );
});

test("rounds a partially remaining day up and hides expired access", () => {
  assert.equal(
    formatSubscriptionTimeLeft("2026-09-15T12:01:00.000Z", now),
    "Ещё 1 день",
  );
  assert.equal(
    formatSubscriptionTimeLeft("2026-09-15T12:00:00.000Z", now),
    null,
  );
  assert.equal(formatSubscriptionTimeLeft("not-a-date", now), null);
});
