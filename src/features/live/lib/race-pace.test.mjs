import assert from "node:assert/strict";
import test from "node:test";

import { getRacePaceTrend } from "./race-pace.ts";

const driver = (overrides = {}) => ({
  acronym: "NOR",
  interval: 2.2,
  pace: [
    { lap: 10, duration: 91, pit: false },
    { lap: 11, duration: 120, pit: true },
    { lap: 12, duration: 90.8, pit: false },
    { lap: 13, duration: 90.6, pit: false },
  ],
  ...overrides,
});

test("compares the latest three clean laps and ignores pit laps", () => {
  const trend = getRacePaceTrend(
    driver(),
    driver({
      acronym: "VER",
      pace: [
        { lap: 10, duration: 91.2, pit: false },
        { lap: 11, duration: 91.1, pit: false },
        { lap: 12, duration: 91, pit: false },
      ],
    }),
  );
  assert.equal(trend.kind, "gaining");
  assert.equal(trend.label, "Догоняет");
  assert.ok(Math.abs(trend.average - 90.8) < 0.0001);
  assert.ok(Math.abs(trend.gainPerLap - 0.3) < 0.0001);
  assert.equal(trend.lapsToOvertakeZone, 4);
});

test("reports insufficient data until both drivers have three clean laps", () => {
  const trend = getRacePaceTrend(
    driver({ pace: [{ lap: 1, duration: 91, pit: false }] }),
    driver({ acronym: "VER" }),
  );
  assert.equal(trend.kind, "unknown");
  assert.equal(trend.laps, 1);
  assert.equal(trend.aheadLaps, 3);
});

test("marks the first classified driver as the leader", () => {
  assert.equal(getRacePaceTrend(driver(), undefined).kind, "leader");
});
