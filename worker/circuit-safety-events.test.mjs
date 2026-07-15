import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHistoricalSafetyEventIndex,
  countContiguousPeriods,
  countOpenF1SafetyEvents,
  getHistoricalSafetyEventCounts,
  parseCsvRows,
} from "./circuit-safety-events.mjs";

test("CSV parser keeps quoted commas inside one field", () => {
  const rows = parseCsvRows('Race,Incident\n2024 Monaco Grand Prix,"Crash involving A, B and C"\n');

  assert.deepEqual(rows[1], ["2024 Monaco Grand Prix", "Crash involving A, B and C"]);
});

test("historical index counts deployments and groups VSC laps into events", () => {
  const index = buildHistoricalSafetyEventIndex({
    safetyCarCsv: "Race,Cause\n2025 British Grand Prix,Crash\n2025 British Grand Prix,Rain\n",
    redFlagCsv: "Race,Lap\n2025 British Grand Prix,12\n",
    virtualSafetyCars: {
      "2025 British Grand Prix": [2, 3, 7, 8, 11],
    },
  });

  assert.deepEqual(getHistoricalSafetyEventCounts(index, 2025, "British Grand Prix"), {
    safetyCarCount: 2,
    vscCount: 3,
    redFlagCount: 1,
  });
  assert.equal(countContiguousPeriods([13, 14, 36]), 2);
});

test("historical index matches renamed races without losing exact names", () => {
  const index = buildHistoricalSafetyEventIndex({
    safetyCarCsv: "Race,Cause\n2024 São Paulo Grand Prix,Crash\n",
    redFlagCsv: "Race,Lap\n",
    virtualSafetyCars: {},
  });

  assert.equal(getHistoricalSafetyEventCounts(index, 2024, "Brazilian Grand Prix").safetyCarCount, 1);
});

test("OpenF1 counter includes deployments and ignores endings and penalties", () => {
  const result = countOpenF1SafetyEvents([
    { lap_number: 2, message: "VIRTUAL SAFETY CAR DEPLOYED", category: "SafetyCar" },
    { lap_number: 4, message: "VIRTUAL SAFETY CAR ENDING", category: "SafetyCar" },
    { lap_number: 14, message: "SAFETY CAR DEPLOYED", category: "SafetyCar" },
    { lap_number: 17, message: "SAFETY CAR IN THIS LAP", category: "SafetyCar" },
    { lap_number: 20, message: "CAR 4 TIME PENALTY - SAFETY CAR INFRINGEMENT", category: "Other" },
    { lap_number: 30, message: "RED FLAG", category: "Flag", flag: "RED" },
    { lap_number: 30, message: "RED FLAG", category: "Flag", flag: "RED" },
  ]);

  assert.deepEqual(result, {
    safetyCarCount: 1,
    vscCount: 1,
    redFlagCount: 1,
  });
});
