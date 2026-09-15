import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOpenF1StartingGridUrl,
  isOpenF1StartingGridReady,
  normalizeOpenF1StartingGrid,
} from "./openf1-starting-grid.mjs";

test("requests the starting grid by the qualifying session key", () => {
  assert.equal(
    buildOpenF1StartingGridUrl("https://api.openf1.org/v1", 11365),
    "https://api.openf1.org/v1/starting_grid?session_key=11365",
  );
});

test("normalizes and orders an official starting grid", () => {
  const rows = normalizeOpenF1StartingGrid([
    { driver_number: 4, lap_duration: 80.123, position: 2 },
    { driver_number: 1, lap_duration: 79.987, position: 1 },
  ]);

  assert.deepEqual(rows.map((row) => [row.driverNumber, row.position]), [[1, 1], [4, 2]]);
  assert.equal(rows[0].lapDuration, 79.987);
});

test("rejects partial or position-conflicting grids", () => {
  const complete = Array.from({ length: 20 }, (_, index) => ({
    driverNumber: index + 1,
    position: index + 1,
  }));

  assert.equal(isOpenF1StartingGridReady(complete), true);
  assert.equal(isOpenF1StartingGridReady(complete.slice(0, 19)), false);
  assert.equal(isOpenF1StartingGridReady([...complete.slice(0, 19), { driverNumber: 20, position: 1 }]), false);
});
