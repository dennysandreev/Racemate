import assert from "node:assert/strict";
import test from "node:test";

import {
  SEASON_GLOBE_MARKER_RADIUS,
  buildSeasonGlobeRouteSegments,
  getSeasonGlobeCameraDistances,
  getSeasonGlobeMarkerOpacity,
  getSeasonGlobeMarkerHoverScale,
  getSeasonGlobeMarkerScaleFactor,
  getSeasonGlobeMarkerViewportScale,
  getSeasonGlobeZoomSensitivity,
  createGreatCircleArc,
  latLngToVector3,
  normalizeLongitude,
} from "./season-globe-geometry.ts";

test("latLngToVector3 keeps points on the requested radius", () => {
  const point = latLngToVector3(35.6762, 139.6503, 2.4);

  assert.ok(Math.abs(point.length() - 2.4) < 1e-9);
});

test("latLngToVector3 uses a stable, non-mirrored longitude axis", () => {
  const greenwich = latLngToVector3(0, 0);
  const tokyo = latLngToVector3(0, 140);
  const austin = latLngToVector3(0, -98);

  assert.ok(greenwich.x > 0.99);
  assert.ok(tokyo.z < 0);
  assert.ok(austin.z > 0);
});

test("normalizeLongitude wraps longitudes into the signed range", () => {
  assert.equal(normalizeLongitude(181), -179);
  assert.equal(normalizeLongitude(-181), 179);
  assert.equal(normalizeLongitude(540), -180);
});

test("great-circle arc crosses the antimeridian along the short path", () => {
  const points = createGreatCircleArc(
    { latitude: 35, longitude: 170 },
    { latitude: 35, longitude: -170 },
    { altitude: 0, radius: 1, segments: 20 },
  );
  const midpoint = points[Math.floor(points.length / 2)].clone().normalize();
  const antimeridian = latLngToVector3(35.4, -180).normalize();

  assert.ok(midpoint.angleTo(antimeridian) < 0.08);
});

test("great-circle arc handles identical coordinates", () => {
  const points = createGreatCircleArc(
    { latitude: 43.7, longitude: 7.4 },
    { latitude: 43.7, longitude: 7.4 },
  );

  assert.equal(points.length, 2);
  assert.ok(points[0].distanceTo(points[1]) < 1e-9);
});

test("route skips only segments that touch an event without coordinates", () => {
  const route = buildSeasonGlobeRouteSegments([
    { round: 1, latitude: 26, longitude: 50, phase: "completed" },
    { round: 2, latitude: null, longitude: null, phase: "next" },
    { round: 3, latitude: 35, longitude: 139, phase: "upcoming" },
    { round: 4, latitude: -37, longitude: 144, phase: "upcoming" },
  ]);

  assert.deepEqual(route.map((segment) => [segment.fromRound, segment.toRound]), [[3, 4]]);
  assert.equal(route[0].phase, "upcoming");
});

test("focused camera opens closer than the full-globe fit and keeps a deeper zoom range", () => {
  const distances = getSeasonGlobeCameraDistances(4.2);

  assert.ok(distances.initial < 4.2);
  assert.ok(distances.initial >= 2.45);
  assert.ok(distances.initial <= 2.85);
  assert.equal(distances.minimum, 1.45);
  assert.ok(distances.maximum > 4.2);
});

test("mobile globe opens slightly closer to the selected race", () => {
  const desktop = getSeasonGlobeCameraDistances(4.2);
  const mobile = getSeasonGlobeCameraDistances(4.2, true);

  assert.ok(mobile.initial < desktop.initial);
  assert.ok(mobile.initial >= 2.25);
  assert.equal(mobile.minimum, desktop.minimum);
});

test("marker screen size stays constant throughout the zoom range", () => {
  const nearDistance = 1.45;
  const referenceDistance = 2.25;
  const farDistance = 6.4;
  const nearDepth = nearDistance - SEASON_GLOBE_MARKER_RADIUS;
  const referenceDepth = referenceDistance - SEASON_GLOBE_MARKER_RADIUS;
  const farDepth = farDistance - SEASON_GLOBE_MARKER_RADIUS;
  const nearScale = getSeasonGlobeMarkerScaleFactor(nearDepth);
  const referenceScale = getSeasonGlobeMarkerScaleFactor(referenceDepth);
  const farScale = getSeasonGlobeMarkerScaleFactor(farDepth);
  const apparentSize = (scale, depth) => scale / depth;

  assert.ok(nearScale < referenceScale);
  assert.ok(farScale > referenceScale);
  assert.ok(Math.abs(apparentSize(nearScale, nearDepth) - apparentSize(referenceScale, referenceDepth)) < 1e-9);
  assert.ok(Math.abs(apparentSize(farScale, farDepth) - apparentSize(referenceScale, referenceDepth)) < 1e-9);
});

test("marker viewport scale compensates for the shorter mobile canvas", () => {
  assert.equal(getSeasonGlobeMarkerViewportScale(336), 1);
  assert.ok(getSeasonGlobeMarkerViewportScale(224) >= 1.45);
  assert.ok(getSeasonGlobeMarkerViewportScale(120) <= 1.6);
});

test("hover gives a marker a restrained zoom without changing its anchor", () => {
  assert.equal(getSeasonGlobeMarkerHoverScale(false), 1);
  assert.equal(getSeasonGlobeMarkerHoverScale(true), 1.14);
});

test("zoom sensitivity decreases linearly near the globe surface", () => {
  assert.equal(getSeasonGlobeZoomSensitivity(1.45, 1.45, 2.25), 0.22);
  assert.ok(
    Math.abs(getSeasonGlobeZoomSensitivity(1.85, 1.45, 2.25) - 0.61) < 1e-12,
  );
  assert.equal(getSeasonGlobeZoomSensitivity(2.25, 1.45, 2.25), 1);
  assert.equal(getSeasonGlobeZoomSensitivity(4, 1.45, 2.25), 1);
});

test("marker visibility fades at the globe horizon and hides the far side", () => {
  const cameraDistance = 6.4;
  const horizon = 1 / cameraDistance;

  assert.equal(getSeasonGlobeMarkerOpacity(cameraDistance, horizon + 0.03), 1);
  assert.ok(getSeasonGlobeMarkerOpacity(cameraDistance, horizon) > 0);
  assert.equal(getSeasonGlobeMarkerOpacity(cameraDistance, horizon - 0.03), 0);
});
