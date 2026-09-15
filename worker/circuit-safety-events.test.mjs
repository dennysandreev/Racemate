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
    yellowFlagCount: 0,
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
    yellowFlagCount: 0,
    safetyCarCount: 0,
    vscCount: 1,
    redFlagCount: 0,
  });
  assert.equal(formatSafetyEventSummary(counts), "VSC: 1");
});

test("race-control audit counts yellow periods only between session start and chequered flag", () => {
  const raceMessages = filterRaceControlForSession([
    { session_key: 200, date: "2026-07-05T13:59:00Z", lap_number: 1, category: "Flag", flag: "YELLOW", scope: "Sector", sector: 7, message: "YELLOW IN TRACK SECTOR 7" },
    { session_key: 200, date: "2026-07-05T14:00:00Z", lap_number: 1, category: "SessionStatus", message: "SESSION STARTED" },
    { session_key: 200, date: "2026-07-05T14:01:00Z", lap_number: 1, category: "Flag", flag: "YELLOW", scope: "Sector", sector: 10, message: "YELLOW IN TRACK SECTOR 10" },
    { session_key: 200, date: "2026-07-05T14:01:10Z", lap_number: 1, category: "Flag", flag: "YELLOW", scope: "Sector", sector: 11, message: "YELLOW IN TRACK SECTOR 11" },
    { session_key: 200, date: "2026-07-05T14:01:40Z", lap_number: 1, category: "Flag", flag: "CLEAR", scope: "Sector", sector: 10, message: "CLEAR IN TRACK SECTOR 10" },
    { session_key: 200, date: "2026-07-05T14:01:50Z", lap_number: 1, category: "Flag", flag: "CLEAR", scope: "Sector", sector: 11, message: "CLEAR IN TRACK SECTOR 11" },
    { session_key: 200, date: "2026-07-05T14:01:52Z", lap_number: 1, category: "Flag", flag: "DOUBLE YELLOW", scope: "Sector", sector: 11, message: "DOUBLE YELLOW IN TRACK SECTOR 11" },
    { session_key: 200, date: "2026-07-05T14:02:00Z", lap_number: 1, category: "Flag", flag: "CLEAR", scope: "Track", sector: null, message: "TRACK CLEAR" },
    { session_key: 200, date: "2026-07-05T14:04:00Z", lap_number: 3, category: "Flag", flag: "YELLOW", scope: "Sector", sector: 4, message: "YELLOW IN TRACK SECTOR 4" },
    { session_key: 200, date: "2026-07-05T15:30:00Z", lap_number: 52, category: "Flag", flag: "CHEQUERED", scope: "Track", message: "CHEQUERED FLAG" },
    { session_key: 200, date: "2026-07-05T15:31:00Z", lap_number: 52, category: "Flag", flag: "YELLOW", scope: "Sector", sector: 8, message: "YELLOW IN TRACK SECTOR 8" },
  ], 200);

  assert.equal(raceMessages[0]?.message, "SESSION STARTED");
  assert.equal(raceMessages.at(-1)?.message, "CHEQUERED FLAG");
  assert.equal(countOpenF1SafetyEvents(raceMessages).yellowFlagCount, 2);
});

test("chequered flag is not classified as a red flag event", () => {
  assert.equal(isImportantRaceControlMessage("CHEQUERED FLAG", "Flag"), false);
  assert.equal(isImportantRaceControlMessage("RED FLAG", "Flag"), true);
  assert.equal(getRaceControlEventTitle("RED FLAG", "Flag"), "Красный флаг");
  assert.equal(getRaceControlEventTitle("SAFETY CAR INFRINGEMENT", "Other"), "Сообщение дирекции гонки");
});

test("red-flag suspension is counted and temporary session stop does not truncate the race", () => {
  const raceMessages = filterRaceControlForSession([
    { session_key: 300, date: "2026-08-23T13:00:00Z", lap_number: 1, category: "SessionStatus", message: "SESSION STARTED" },
    { session_key: 300, date: "2026-08-23T13:02:00Z", lap_number: 2, category: "SessionStatus", message: "SESSION STOPPED" },
    { session_key: 300, date: "2026-08-23T13:02:01Z", lap_number: 2, category: "Other", message: "RED FLAG - RACE SUSPENDED" },
    { session_key: 300, date: "2026-08-23T13:20:00Z", lap_number: 3, category: "SessionStatus", message: "SESSION STARTED" },
    { session_key: 300, date: "2026-08-23T15:00:00Z", lap_number: 72, category: "Flag", flag: "CHEQUERED", message: "CHEQUERED FLAG" },
  ], 300);

  assert.equal(raceMessages.at(-1)?.message, "CHEQUERED FLAG");
  assert.equal(countOpenF1SafetyEvents(raceMessages).redFlagCount, 1);
});
