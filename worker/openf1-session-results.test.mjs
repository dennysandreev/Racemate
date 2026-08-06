import assert from "node:assert/strict";
import test from "node:test";

import {
  getOpenF1ResultStatus,
  getOpenF1ResultTimeText,
  getOpenF1ParticipantIdentity,
  isOpenF1ClassificationReady,
  isOpenF1ResultProbeDue,
  normalizeOpenF1SessionClassification,
} from "./openf1-session-results.mjs";

test("normalizes a complete practice classification", () => {
  const payload = Array.from({ length: 20 }, (_, index) => ({
    driver_number: index + 1,
    duration: 90.123 + index / 10,
    gap_to_leader: index / 10,
    number_of_laps: 24 - (index % 3),
    position: index + 1,
  }));
  const results = normalizeOpenF1SessionClassification(payload, "fp2");

  assert.equal(results.length, 20);
  assert.equal(results[0].timeText, "1:30.123");
  assert.equal(results[0].status, "Лучшее время");
  assert.equal(isOpenF1ClassificationReady(results), true);
});

test("builds a stable identity for a reserve driver from the session roster", () => {
  assert.deepEqual(getOpenF1ParticipantIdentity({
    driver_number: 72,
    first_name: "Frederik",
    last_name: "VESTI",
    full_name: "Frederik VESTI",
    name_acronym: "VES",
    team_name: "Mercedes",
    headshot_url: null,
  }), {
    driverNumber: 72,
    firstName: "Frederik",
    lastName: "Vesti",
    fullName: "Frederik Vesti",
    code: "VES",
    externalId: "openf1-driver:frederik-vesti",
    slug: "frederik-vesti",
    teamName: "Mercedes",
    headshotUrl: null,
  });
});

test("uses the final qualifying segment reached by each driver", () => {
  const row = {
    driver_number: 4,
    duration: [82.111, 81.222, 80.333],
    gap_to_leader: [0.4, 0.2, 0.1],
    number_of_laps: 18,
    position: 2,
  };

  assert.equal(getOpenF1ResultTimeText(row, "qualifying"), "1:20.333");
  assert.equal(getOpenF1ResultStatus(row, "qualifying"), "Q3");
  assert.equal(getOpenF1ResultStatus({ ...row, duration: [82.111, null, null] }, "qualifying"), "Q1");
});

test("formats race winner time and gaps without inventing points", () => {
  assert.equal(
    getOpenF1ResultTimeText({ position: 1, duration: 5_421.456, gap_to_leader: 0 }, "race"),
    "1:30:21.456",
  );
  assert.equal(
    getOpenF1ResultTimeText({ position: 2, duration: 5_425, gap_to_leader: 3.544 }, "race"),
    "+3.544",
  );
  assert.equal(
    getOpenF1ResultTimeText({ position: 15, gap_to_leader: "+1 LAP" }, "race"),
    "+1 LAP",
  );
});

test("rejects a partial payload and duplicate driver numbers", () => {
  const partial = normalizeOpenF1SessionClassification([
    { driver_number: 1, position: 1, duration: 80 },
    { driver_number: 1, position: 2, duration: 81 },
    { driver_number: 4, position: 3, duration: 82 },
  ], "fp1");

  assert.equal(partial.length, 2);
  assert.equal(isOpenF1ClassificationReady(partial), false);
  assert.equal(isOpenF1ClassificationReady([
    ...Array.from({ length: 10 }, (_, index) => ({ driverNumber: index + 1, position: index || 1 })),
  ]), false);
});

test("waits for the free historical window but allows authenticated sync earlier", () => {
  const endAt = "2026-07-18T12:00:00.000Z";
  const plusFiveMinutes = new Date("2026-07-18T12:05:00.000Z").getTime();
  const plusThirtyTwoMinutes = new Date("2026-07-18T12:32:00.000Z").getTime();

  assert.equal(isOpenF1ResultProbeDue({ endAt, nowMs: plusFiveMinutes }), false);
  assert.equal(isOpenF1ResultProbeDue({ endAt, nowMs: plusThirtyTwoMinutes }), true);
  assert.equal(isOpenF1ResultProbeDue({ endAt, hasLiveAccess: true, nowMs: plusFiveMinutes }), true);
});
