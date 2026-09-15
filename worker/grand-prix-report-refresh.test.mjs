import assert from "node:assert/strict";
import test from "node:test";

import { getNextReportRefreshAt } from "./grand-prix-report-refresh.mjs";

const NOW = Date.parse("2026-09-07T12:00:00.000Z");

test("stops routine report refreshes after the normal convergence window", () => {
  assert.deepEqual(getNextReportRefreshAt(2, { now: NOW }), {
    stage: 3,
    nextRefreshAt: null,
  });
});

test("keeps incomplete reports on a daily recovery schedule", () => {
  assert.deepEqual(getNextReportRefreshAt(4, { incomplete: true, now: NOW }), {
    stage: 5,
    nextRefreshAt: "2026-09-08T12:00:00.000Z",
  });
});

test("bounds recovery checks after two weeks of daily retries", () => {
  assert.deepEqual(getNextReportRefreshAt(17, { incomplete: true, now: NOW }), {
    stage: 18,
    nextRefreshAt: null,
  });
});
