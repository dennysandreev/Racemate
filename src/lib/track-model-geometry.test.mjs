import assert from "node:assert/strict";
import test from "node:test";

import {
  createClosedLoopSegments,
  getBankingElevationM,
  getLeveledTrackElevations,
  getTrackClearanceHalfWidths,
} from "./track-model-geometry.ts";

test("track ribbon closes the final point back to the first point", () => {
  const points = ["start", "turn-1", "turn-10", "finish"];
  const segments = createClosedLoopSegments(points);

  assert.deepEqual(segments, [
    ["start", "turn-1"],
    ["turn-1", "turn-10"],
    ["turn-10", "finish"],
    ["finish", "start"],
  ]);
});

test("empty track data does not create an invalid segment", () => {
  assert.deepEqual(createClosedLoopSegments([]), []);
});

test("banking height is not multiplied by terrain exaggeration", () => {
  const physicalRiseM = Math.tan((19 * Math.PI) / 180) * 5;
  const modelRiseM = getBankingElevationM(19, 5, 7.5);

  assert.equal(Math.round(modelRiseM * 7.5 * 1_000), Math.round(physicalRiseM * 1_000));
});

test("close non-adjacent branches reserve a visible gap between textures", () => {
  const points = [
    { progress: 0, x: 0, y: 0 },
    { progress: 0.1, x: 1, y: 0 },
    { progress: 0.5, x: 1, y: 0.04 },
    { progress: 0.6, x: 0, y: 0.04 },
  ];
  const widths = getTrackClearanceHalfWidths(points);

  assert.ok(widths[0] * 2 < 0.04);
  assert.ok(widths[3] * 2 < 0.04);
});

test("a configured bridge keeps both crossing branches at full width", () => {
  const points = [
    { progress: 0, x: 0, y: 0 },
    { progress: 0.1, x: 1, y: 0 },
    { progress: 0.5, x: 1, y: 0.04 },
    { progress: 0.6, x: 0, y: 0.04 },
  ];
  const widths = getTrackClearanceHalfWidths(points, [{ from: 0.55, to: 0.65 }]);

  assert.equal(widths[0], Number.POSITIVE_INFINITY);
  assert.equal(widths[3], Number.POSITIVE_INFINITY);
});

test("a level bridge uses one deck elevation and blends outside its range", () => {
  const points = [
    { elevationM: 0, progress: 0, x: 0, y: 0 },
    { elevationM: 10, progress: 0.2, x: 1, y: 0 },
    { elevationM: 20, progress: 0.4, x: 2, y: 0 },
    { elevationM: 30, progress: 0.6, x: 3, y: 0 },
    { elevationM: 40, progress: 0.8, x: 4, y: 0 },
  ];
  const elevations = getLeveledTrackElevations(
    points,
    [{ from: 0.2, level: true, to: 0.6 }],
    0.2,
  );

  assert.deepEqual(elevations.slice(1, 4), [20, 20, 20]);
  assert.equal(elevations[0], 0);
  assert.equal(elevations[4], 40);
});
