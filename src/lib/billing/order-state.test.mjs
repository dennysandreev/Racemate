import assert from "node:assert/strict";
import test from "node:test";

import { isOpenPendingCheckout } from "./order-state.ts";

const now = Date.parse("2026-09-16T12:00:00.000Z");

test("recognizes only a non-expired pending checkout as open", () => {
  assert.equal(
    isOpenPendingCheckout(
      { expiresAt: "2026-09-16T12:30:00.000Z", status: "pending" },
      now,
    ),
    true,
  );
  assert.equal(
    isOpenPendingCheckout(
      { expiresAt: "2026-09-16T12:00:00.000Z", status: "pending" },
      now,
    ),
    false,
  );
  assert.equal(
    isOpenPendingCheckout(
      { expiresAt: "2026-09-16T12:30:00.000Z", status: "paid" },
      now,
    ),
    false,
  );
});

test("rejects an invalid checkout expiry", () => {
  assert.equal(
    isOpenPendingCheckout({ expiresAt: "not-a-date", status: "pending" }, now),
    false,
  );
});
