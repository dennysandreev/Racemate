import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHistoricalSafetyEventIndex,
  countContiguousPeriods,
  countOpenF1SafetyEvents,
  filterRaceControlForSession,
  formatSafetyEventSummary,
  getRaceControlEventTitle,
  getHistoricalSafetyEventCounts,
  isImportantRaceControlMessage,
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

test("report safety summary uses only the race session and deployment events", () => {
  const raceMessages = filterRaceControlForSession([
    { session_key: 100, lap_number: 2, message: "RED FLAG", category: "Flag", flag: "RED" },
    { session_key: 200, lap_number: 10, message: "VSC DEPLOYED", category: "SafetyCar" },
    { session_key: 200, lap_number: 11, message: "VSC ENDING", category: "SafetyCar" },
    { session_key: 200, lap_number: 40, message: "CHEQUERED FLAG", category: "Flag", flag: "CHEQUERED" },
    { session_key: 200, lap_number: 42, message: "SAFETY CAR INFRINGEMENT", category: "Other" },
  ], 200);
  const counts = countOpenF1SafetyEvents(raceMessages);

  assert.deepEqual(counts, {
    safetyCarCount: 0,
    vscCount: 1,
    redFlagCount: 0,
  });
  assert.equal(formatSafetyEventSummary(counts), "VSC: 1");
});

test("chequered flag is not classified as a red flag event", () => {
  assert.equal(isImportantRaceControlMessage("CHEQUERED FLAG", "Flag"), false);
  assert.equal(isImportantRaceControlMessage("RED FLAG", "Flag"), true);
  assert.equal(getRaceControlEventTitle("RED FLAG", "Flag"), "Красный флаг");
  assert.equal(getRaceControlEventTitle("SAFETY CAR INFRINGEMENT", "Other"), "Сообщение дирекции гонки");
});
