import test from "node:test";
import assert from "node:assert/strict";
import { buildMarshalSectorPath } from "./track-sectors.ts";

const square = [
  { progress: 0, svgX: 0, svgY: 0 },
  { progress: 0.25, svgX: 100, svgY: 0 },
  { progress: 0.5, svgX: 100, svgY: 100 },
  { progress: 0.75, svgX: 0, svgY: 100 },
  { progress: 1, svgX: 0, svgY: 0 },
];

test("marshal sectors stay invisible until a valid active sector is requested", () => {
  assert.equal(buildMarshalSectorPath(square, 0, 4), "");
  assert.equal(buildMarshalSectorPath(square, 5, 4), "");
});

test("marshal sector path follows the requested part of the centerline", () => {
  assert.equal(buildMarshalSectorPath(square, 2, 4), "M100.0 0.0 L100.0 100.0");
  assert.equal(
    buildMarshalSectorPath(square, 1, 4, 0.25),
    "M100.0 0.0 L100.0 100.0",
  );
});
