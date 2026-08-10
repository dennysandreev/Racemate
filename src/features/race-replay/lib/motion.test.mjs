import assert from "node:assert/strict";
import test from "node:test";

import { buildDriverMotion, trackProgressAt } from "./motion.ts";

function position(offsetMs, progress, svgX = progress * 100, driverNumber = 81) {
  return {
    driverNumber,
    headingRad: 0,
    normalizedZ: 0,
    offsetMs,
    progress,
    svgX,
    svgY: 0,
    timestamp: new Date(offsetMs).toISOString(),
    z: 0,
  };
}

test("official lap timing keeps a driver moving through a frozen location feed", () => {
  const motion = buildDriverMotion(
    [
      position(0, 0),
      position(10_000, 0.1),
      position(20_000, 0.2),
      position(30_000, 0.3),
      position(70_000, 0.301, 34),
      position(80_000, 0.4),
      position(90_000, 0.5),
    ],
    {
      lapTimings: [
        {
          driverNumber: 81,
          durationMs: 100_000,
          lapNumber: 1,
          startOffsetMs: 0,
        },
      ],
    },
  );

  assert.equal(trackProgressAt(motion, 50_000)?.hold, false);
  assert.ok(Math.abs(trackProgressAt(motion, 50_000).unwrapped - 0.5) < 0.001);

  let previous = trackProgressAt(motion, 1_000).unwrapped;

  for (let elapsedMs = 2_000; elapsedMs <= 99_000; elapsedMs += 1_000) {
    const current = trackProgressAt(motion, elapsedMs).unwrapped;
    assert.ok(current - previous > 0.005, `driver nearly stopped at ${elapsedMs} ms`);
    previous = current;
  }
});

test("official consecutive lap starts preserve the real gap and lap count", () => {
  const lapTimings = [
    { driverNumber: 1, durationMs: 74_000, lapNumber: 1, startOffsetMs: 0 },
    { driverNumber: 1, durationMs: 75_000, lapNumber: 2, startOffsetMs: 74_000 },
  ];
  const motion = buildDriverMotion(
    [position(0, 0, 0, 1), position(149_000, 0.99, 99, 1)],
    { lapTimings },
  );

  assert.ok(Math.abs(trackProgressAt(motion, 37_000).unwrapped - 0.5) < 0.001);
  assert.ok(Math.abs(trackProgressAt(motion, 111_500).unwrapped - 1.5) < 0.001);
  assert.ok(Math.abs(trackProgressAt(motion, 149_000).unwrapped - 2) < 0.001);
});

test("an unfinished final lap follows telemetry to the retirement point", () => {
  const lapTimings = [
    { driverNumber: 44, durationMs: 100_000, lapNumber: 1, startOffsetMs: 0 },
    { driverNumber: 44, durationMs: null, lapNumber: 2, startOffsetMs: 100_000 },
  ];
  const motion = buildDriverMotion(
    [
      { ...position(0, 0, 0, 44), lapNumber: 1 },
      { ...position(100_000, 0, 0, 44), lapNumber: 2 },
      { ...position(120_000, 0.25, 25, 44), lapNumber: 2 },
      { ...position(140_000, 0.45, 45, 44), lapNumber: 2 },
      { ...position(160_000, 0.451, 49, 44), lapNumber: 2 },
    ],
    { lapTimings },
  );

  assert.ok(Math.abs(trackProgressAt(motion, 120_000).unwrapped - 1.25) < 0.001);
  assert.ok(Math.abs(trackProgressAt(motion, 160_000).unwrapped - 1.451) < 0.001);
});
