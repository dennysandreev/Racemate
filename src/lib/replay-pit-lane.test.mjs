import assert from "node:assert/strict";
import test from "node:test";
import layouts from "../data/replay-pit-layouts.json" with { type: "json" };
import { getVerifiedReplayPitLane, registerCircuit, withVerifiedReplayPitLane } from "./replay-pit-lane.mjs";

function trackFor(layout) {
  return {
    circuitName: layout.aliases[0], circuitKey: layout.id,
    centerline: layout.track.map(([x, y], i) => ({ svgX: 500 + x * 0.1, svgY: 400 - y * 0.1, progress: i / layout.track.length, elevationM: 0 })),
    transform: { scale: 0.1, offsetX: 500, offsetY: 320, invertY: true },
    worldBounds: { minX: 0, minY: 0, minZ: 0 },
    svg: { viewBox: { width: 1000, height: 720 } },
    startFinish: { progress: 0, svgX: 500, svgY: 400 },
  };
}

test("all completed 2026 circuits have distinct sourced pit geometry", () => {
  assert.equal(layouts.length, 14);
  assert.equal(new Set(layouts.map((layout) => layout.id)).size, 14);
  for (const layout of layouts) {
    assert.match(layout.referenceUrl, /^https:\/\/www\.fia\.com\//);
    assert.ok(layout.geometrySource);
    assert.ok(layout.track.length >= 100 && layout.pit.length >= 10, layout.id);
    assert.ok(layout.pit.flat().every(Number.isFinite), layout.id);
  }
});

test("registration handles rotation, reflection, scale and a shifted first telemetry point", () => {
  const reference = layouts.find((item) => item.id === "shanghai").track;
  for (const reflection of [-1, 1]) {
    const transform = ([x, y]) => [100 + 0.2 * x - 0.1 * y * reflection, 200 + 0.1 * x + 0.2 * y * reflection];
    const target = [...reference.slice(60), ...reference.slice(0, 60)].map(transform);
    const fit = registerCircuit(reference, target);
    assert.ok(fit.rms < 0.2, `${reflection}: RMS ${fit.rms}`);
    const point = reference[130], actual = fit.transform(point), expected = transform(point);
    assert.ok(Math.hypot(actual[0] - expected[0], actual[1] - expected[1]) < 0.2);
  }
});

test("pit rendering and motion use the same finite coordinate sequence on every circuit", () => {
  for (const layout of layouts) {
    const track = trackFor(layout);
    const before = JSON.stringify(track);
    const pit = getVerifiedReplayPitLane(track);
    assert.ok(pit, layout.id);
    assert.equal(pit.source, "verified_circuit_geometry");
    assert.equal(pit.points.length, layout.pit.length);
    assert.equal(pit.visualPathD.split(" ").length, pit.points.length * 2);
    assert.ok(pit.points.every((p) => [p.svgX, p.svgY, p.worldX, p.worldY, p.worldZ].every(Number.isFinite)));
    assert.equal(JSON.stringify(track), before, "cached input must not be mutated");
    const updated = withVerifiedReplayPitLane(track);
    assert.equal(updated.centerline, track.centerline, "valid contours must not be replaced");
    assert.deepEqual(updated.pitLane, pit);
  }
});

test("unknown circuits and malformed coordinates retain their existing geometry", () => {
  const unknown = { ...trackFor(layouts[0]), circuitName: "Unknown", circuitKey: "unknown" };
  assert.equal(getVerifiedReplayPitLane(unknown), null);
  assert.equal(withVerifiedReplayPitLane(unknown), unknown);
  const invalid = trackFor(layouts[0]);
  invalid.centerline[0].svgX = NaN;
  assert.equal(getVerifiedReplayPitLane(invalid), null);
  const degenerate = trackFor(layouts[0]);
  degenerate.centerline = Array(10).fill(degenerate.centerline[0]);
  assert.equal(getVerifiedReplayPitLane(degenerate), null);
  const spanish = { ...unknown, circuitName: "Spanish Grand Prix", circuitKey: "spain" };
  assert.equal(getVerifiedReplayPitLane(spanish), null, "Spain must not match the Spa alias");
});

test("a damaged Monaco contour is repaired once with a closed lap and a connected pit", () => {
  const layout = layouts.find((item) => item.id === "monaco");
  const track = trackFor(layout);
  track.centerline = track.centerline.map((p, i) => ({ ...p, svgX: 400 + Math.cos(i / track.centerline.length * Math.PI * 2) * 300, svgY: 350 + Math.sin(i / track.centerline.length * Math.PI * 2) * 200 }));
  const repaired = withVerifiedReplayPitLane(track);
  assert.notEqual(repaired.centerline, track.centerline);
  assert.ok(repaired.svg.technicalPathD.endsWith(" Z"));
  assert.equal(repaired.startFinish.svgX, repaired.centerline[0].svgX);
  assert.equal(repaired.pitLane.source, "verified_circuit_geometry");
  const again = withVerifiedReplayPitLane(repaired);
  assert.equal(again.centerline, repaired.centerline, "do not repeatedly transform a repaired cache");
  assert.deepEqual(again.pitLane, repaired.pitLane);
});
