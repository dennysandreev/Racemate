import assert from "node:assert/strict";
import test from "node:test";

import {
  getReplayClosedTrackDistances,
  getReplayDurationMs,
  getReplayPitLaneGeometryOverride,
  smoothReplayTrackPoints,
} from "./index.mjs";

test("replay duration includes final lap timing when the location feed ends early", () => {
  assert.equal(getReplayDurationMs([{offsetMs: 581999}], [[43, 78, 8770850, 76654]]), 8847504);
  assert.equal(getReplayDurationMs([{offsetMs: 9000000}], [[43, 78, 8770850, 76654]]), 9000000);
  assert.equal(getReplayDurationMs([], []), 1);
});

test("closed track smoothing uses neighbours across the start line", () => {
  const points = [
    { x: 0, y: 0, z: 0 },
    { x: 10, y: 0, z: 0 },
    { x: 10, y: 10, z: 0 },
    { x: 0, y: 10, z: 0 },
  ];
  const smoothed = smoothReplayTrackPoints(points);

  assert.ok(smoothed[0].y > 0, "the first point should be influenced by the last point");
  assert.ok(smoothed.at(-1).x > 0, "the last point should be influenced by the first point");
});

test("closed track distance reserves progress for the final segment", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];
  const result = getReplayClosedTrackDistances(points);

  assert.equal(result.closingDistance, 10);
  assert.equal(result.totalDistance, 40);
  assert.equal(result.distances.at(-1) / result.totalDistance, 0.75);
});

test("Spa and Hungaroring use FIA-verified pit lane layouts", () => {
  const spa = getReplayPitLaneGeometryOverride("Circuit de Spa-Francorchamps");
  const hungary = getReplayPitLaneGeometryOverride("Hungaroring");

  for (const layout of [spa, hungary]) {
    assert.ok(layout);
    assert.ok(layout.startProgress > layout.endProgress, "pit lane must cross the start line");
    assert.match(layout.referenceUrl, /^https:\/\/www\.fia\.com\//);
    assert.equal(layout.sideSign, 1);
  }

  assert.equal(spa.entryLabel, "after_turn_19");
  assert.equal(hungary.entryLabel, "after_turn_14");
});
