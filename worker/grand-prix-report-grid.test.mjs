import assert from "node:assert/strict";
import test from "node:test";

import { buildOpenF1StartingGridByDriverNumber } from "./grand-prix-report-grid.mjs";

test("uses the earliest widest OpenF1 position snapshot as the starting grid", () => {
  const grid = buildOpenF1StartingGridByDriverNumber([
    { date: "2026-08-23T12:06:50.962Z", driver_number: 1, position: 1 },
    { date: "2026-08-23T12:06:50.962Z", driver_number: 63, position: 2 },
    { date: "2026-08-23T12:06:50.962Z", driver_number: 12, position: 3 },
    { date: "2026-08-23T13:04:00.000Z", driver_number: 12, position: 2 },
    { date: "2026-08-23T13:04:00.500Z", driver_number: 63, position: 3 },
  ]);

  assert.deepEqual([...grid.entries()], [[1, 1], [63, 2], [12, 3]]);
});

test("does not invent a grid from isolated position changes", () => {
  const grid = buildOpenF1StartingGridByDriverNumber([
    { date: "2026-08-23T13:04:00.000Z", driver_number: 12, position: 2 },
    { date: "2026-08-23T13:04:00.500Z", driver_number: 63, position: 3 },
  ]);

  assert.equal(grid.size, 0);
});
