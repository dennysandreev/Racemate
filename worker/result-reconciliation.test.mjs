import assert from "node:assert/strict";
import test from "node:test";

import {
  applyOfficialRaceClassificationCorrection,
  getClassificationSnapshotPlan,
} from "./index.mjs";

const monacoSourceOrder = [
  "antonelli",
  "hamilton",
  "gasly",
  "hadjar",
  "piastri",
  "lawson",
  "arvid_lindblad",
  "albon",
  "ocon",
  "alonso",
  "bortoleto",
  "russell",
  "hulkenberg",
  "colapinto",
  "perez",
  "sainz",
  "leclerc",
  "stroll",
  "norris",
  "bearman",
  "bottas",
  "max_verstappen",
];

test("applies the final FIA Monaco classification over a stale provider snapshot", () => {
  const race = {
    round: "6",
    Results: monacoSourceOrder.map((driverId, index) => ({
      Driver: { driverId, familyName: driverId },
      Time: { time: `source-${index + 1}` },
      points: String(Math.max(0, 25 - index)),
      position: String(index + 1),
      positionText: String(index + 1),
    })),
  };

  const corrected = applyOfficialRaceClassificationCorrection(2026, race);

  assert.deepEqual(
    corrected.Results.slice(0, 8).map((result) => result.Driver.driverId),
    ["antonelli", "hamilton", "hadjar", "piastri", "lawson", "arvid_lindblad", "gasly", "albon"],
  );
  assert.equal(corrected.Results[2].points, "15");
  assert.equal(corrected.Results[2].Time.time, "+23.394");
  assert.equal(corrected.Results[6].points, "6");
  assert.equal(corrected.Results[6].Time.time, "+30.369");
  assert.match(corrected.Results[6]._raceside_official_correction.source_url, /fia\.com/);
});

test("classification reconciliation removes stale driver rows and detects corrections", () => {
  const existingRows = [
    {
      id: "old-gasly",
      driver_id: "gasly-old-id",
      position: 3,
      points: 15,
      raw_payload: { Driver: { driverId: "gasly" } },
    },
    ...Array.from({ length: 10 }, (_, index) => ({
      id: `existing-${index}`,
      driver_id: `driver-${index}`,
      position: index + 1,
      points: 0,
      raw_payload: { Driver: { driverId: `driver-${index}` } },
    })),
  ];
  const incomingRows = Array.from({ length: 10 }, (_, index) => ({
    driver_id: `driver-${index}`,
    position: index + 1,
    points: 0,
    raw_payload: { Driver: { driverId: `driver-${index}` } },
  }));

  const plan = getClassificationSnapshotPlan(existingRows, incomingRows);

  assert.equal(plan.changed, true);
  assert.equal(plan.correctedExistingSnapshot, true);
  assert.deepEqual(plan.staleRowIds, ["old-gasly"]);
  assert.equal(getClassificationSnapshotPlan(incomingRows, incomingRows).changed, false);
});
