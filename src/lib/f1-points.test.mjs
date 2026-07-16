import assert from "node:assert/strict";
import test from "node:test";

import { getRoundResultPoints } from "./f1-points.ts";

test("race points preserve the historical fastest-lap bonus", () => {
  assert.equal(getRoundResultPoints(26, "race", 1), 26);
  assert.equal(getRoundResultPoints("18", "race", 2), 18);
});

test("invalid result points fall back to the classification scale", () => {
  assert.equal(getRoundResultPoints(99, "race", 1), 25);
  assert.equal(getRoundResultPoints(99, "sprint", 2), 7);
});
