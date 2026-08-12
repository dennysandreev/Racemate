import assert from "node:assert/strict";
import test from "node:test";

import {
  getClassifiedLapDeficit,
  orderReplayTimingRows,
} from "./timing-order.ts";

function row(driverNumber, position, lapNumber, gapToLeader = null, status = "RUNNING") {
  return { driverNumber, gapToLeader, hasTimedPosition: true, lapNumber, position, status };
}

test("a line-crossing race does not make the leader appear one lap down", () => {
  const ordered = orderReplayTimingRows([
    row(81, 1, 2, "+0.000"),
    row(1, 2, 1, "+0.925"),
    row(3, 3, 2, "+1.744"),
    row(44, 4, 1, "+2.100"),
  ]);

  assert.deepEqual(ordered.map((item) => item.driverNumber), [81, 1, 3, 44]);
  assert.deepEqual(ordered.map((item) => item.displayPosition), [1, 2, 3, 4]);
  assert.deepEqual(ordered.map((item) => item.lapDeficit), [null, null, null, null]);
});

test("official OpenF1 lap gaps remain visible", () => {
  const ordered = orderReplayTimingRows([
    row(1, 1, 56, "+0.000"),
    row(41, 9, 55, "+1 LAP"),
    row(87, 20, 54, "+2 LAPS"),
  ]);

  assert.deepEqual(ordered.map((item) => item.lapDeficit), [null, 1, 2]);
});

test("numeric gaps are never parsed as lap deficits", () => {
  assert.equal(getClassifiedLapDeficit("+1.381"), null);
  assert.equal(getClassifiedLapDeficit("+1 LAP"), 1);
  assert.equal(getClassifiedLapDeficit("+2 LAPS"), 2);
  assert.equal(getClassifiedLapDeficit("+3 круга"), 3);
});

test("a retired driver stays below active runners", () => {
  const ordered = orderReplayTimingRows([
    row(1, 1, 70, "+0.000"),
    row(81, 20, 55, null, "OUT"),
    row(11, 21, 49, "+2 LAPS"),
  ]);

  assert.deepEqual(ordered.map((item) => item.driverNumber), [1, 11, 81]);
  assert.equal(ordered.at(-1).lapDeficit, null);
});
