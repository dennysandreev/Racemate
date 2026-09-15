import assert from "node:assert/strict";
import test from "node:test";

import {
  clampTrackModelPan,
  getTrackModelInitialZoom,
  orbitTrackModelCamera,
  pinchTrackModelCamera,
  preserveTrackModelOrbitFocus,
  zoomTrackModelAtPoint,
} from "./track-model-camera.ts";

test("full WebGL track models open tightly framed", () => {
  assert.equal(getTrackModelInitialZoom(true, true), 1.75);
  assert.equal(getTrackModelInitialZoom(true, false), 1.25);
  assert.equal(getTrackModelInitialZoom(false, true), 1);
});

test("zoom keeps the point under the cursor stable", () => {
  const result = zoomTrackModelAtPoint(
    { pan: { x: 0.04, y: -0.02 }, zoom: 2 },
    4,
    { x: 0.25, y: -0.1 },
  );

  assert.deepEqual(result, {
    pan: { x: -0.16999999999999998, y: 0.06 },
    zoom: 4,
  });
});

test("pinch zooms, pans and rotates in one gesture", () => {
  const result = pinchTrackModelCamera({
    currentAngle: Math.PI / 2,
    currentCenter: { x: 0.1, y: -0.05 },
    currentDistance: 200,
    maximumZoom: 8,
    minimumZoom: 0.82,
    startAngle: 0,
    startCenter: { x: 0, y: 0 },
    startDistance: 100,
    startState: { pan: { x: 0, y: 0 }, rotationDeg: 15, zoom: 1 },
  });

  assert.deepEqual(result, {
    pan: { x: 0.1, y: -0.05 },
    rotationDeg: 105,
    zoom: 2,
  });
});

test("pan stays inside the visible model bounds", () => {
  assert.deepEqual(clampTrackModelPan({ x: 10, y: -10 }, 3), { x: 1, y: -1 });
  assert.deepEqual(clampTrackModelPan({ x: 0.06, y: -0.08 }, 1), { x: 0.06, y: -0.08 });
});

test("orientation sphere rotates and clamps the 3D tilt", () => {
  assert.deepEqual(
    orbitTrackModelCamera({
      deltaX: 80,
      deltaY: 200,
      maximumTiltDeg: 82,
      minimumTiltDeg: 8,
      rotationSensitivity: 1,
      startRotationDeg: 150,
      startTiltDeg: 10,
      tiltSensitivity: 0.5,
    }),
    { rotationDeg: -130, tiltDeg: 82 },
  );
});

test("orientation sphere keeps the current world focus centred while orbiting", () => {
  const result = preserveTrackModelOrbitFocus({
    nextRotationDeg: 90,
    nextTiltDeg: 10,
    pan: { x: 0.2, y: -0.1 },
    startRotationDeg: 0,
    startTiltDeg: 10,
    viewportAspectRatio: 1200 / 710,
    zoom: 2,
  });

  assert.ok(Math.abs(result.x - 0.08842) < 0.0001);
  assert.ok(Math.abs(result.y - 0.22618) < 0.0001);
});
