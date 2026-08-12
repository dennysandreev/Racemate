import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

import { SPA_MODEL, SPA_REPLAY_PATH, SPA_TRACK_MODEL } from "./spa-model.ts";

test("Spa digital twin is a real-scale closed lap with nineteen turns", () => {
  assert.equal(SPA_TRACK_MODEL.camera.verticalExaggeration, 1);
  assert.equal(SPA_TRACK_MODEL.webgl.turnCount, 19);
  assert.deepEqual(SPA_MODEL.points.at(-1).slice(1), SPA_MODEL.points[0].slice(1));
  assert.deepEqual(
    SPA_MODEL.turns.map(({ number }) => number),
    Array.from({ length: 19 }, (_, index) => index + 1),
  );
  assert.equal(SPA_MODEL.lapLengthKm, 7.004);
  assert.ok(SPA_MODEL.elevationChangeM >= 100);
});

test("Spa FIA sector and speed-trap markers use the 2026 distances", () => {
  const [sectorOneEnd, sectorTwoEnd] = SPA_MODEL.sectorBreaks;
  const turnFour = SPA_MODEL.turns.find(({ number }) => number === 4);

  assert.ok(Math.abs(sectorOneEnd * 7_003.499 - 2_254) < 1);
  assert.ok(Math.abs(sectorTwoEnd * 7_003.499 - 5_074) < 1);
  assert.ok(Math.abs((SPA_MODEL.speedTrapProgress - turnFour.progress) * 7_003.499 - 30) < 1);
});

test("Spa production assets stay within the web delivery budget", async () => {
  const [glb, preview, metadata] = await Promise.all([
    stat(new URL("../../public/f1/tracks/3d/spa.glb", import.meta.url)),
    stat(new URL("../../public/f1/tracks/3d/spa-preview.webp", import.meta.url)),
    readFile(new URL("../../public/f1/tracks/3d/spa-metadata.json", import.meta.url), "utf8")
      .then(JSON.parse),
  ]);

  assert.ok(glb.size <= 6_500_000);
  assert.ok(preview.size >= 50_000);
  assert.equal(metadata.lapLength.officialFiaMeters, 7_004);
  assert.ok(metadata.lapLength.relativeErrorPercent <= 0.5);
  assert.equal(metadata.objects.turnAnchors, 19);
  assert.equal(metadata.layoutQuality.pitLane.pitBoxes, 42);
  assert.ok(metadata.layoutQuality.pitLane.entryMinimumWidthMeters >= 4);
  assert.equal(metadata.layoutQuality.pitLane.entrySurface, "asphalt");
  assert.equal(metadata.layoutQuality.pitLane.taperProfile, "smoothstep");
  assert.equal(metadata.layoutQuality.pitLane.pitComplex.garageBoxes, 42);
  assert.ok(metadata.layoutQuality.pitLane.pitComplex.grandstandRows >= 8);
  assert.equal(metadata.layoutQuality.buildings.excludedReplacedCircuitStructures, 2);
  assert.equal(metadata.layoutQuality.buildings.downwardFacingRoofTriangles, 0);
  assert.ok(metadata.layoutQuality.buildings.roofTriangles > 0);
  assert.equal(
    metadata.layoutQuality.mappedGrandstands.roofedStructures,
    metadata.objects.mappedGrandstands,
  );
  assert.equal(metadata.layoutQuality.mappedGrandstands.downwardFacingRoofTriangles, 0);
  assert.equal(metadata.layoutQuality.mappedGrandstands.redRoofSurfaces, 0);
  assert.equal(metadata.layoutQuality.motorhomes.behindPitComplex, true);
  assert.equal(metadata.layoutQuality.runoff.pitEntrySurface, "asphalt");
  assert.equal(metadata.layoutQuality.runoff.syntheticGravelAtPitEntry, false);
  assert.equal(metadata.layoutQuality.runoff.syntheticRunoffAtPitEntry, false);
  assert.equal(metadata.layoutQuality.runoff.pitEntryGroundContext, "orthophoto");
  assert.ok(metadata.layoutQuality.grandstands.maximumSupportHeightMeters <= 12.5);
  assert.ok(
    metadata.layoutQuality.grandstands.maximumSupportHeightByStandMeters["Silver 3 Double Gauche"] <= 12.2,
  );
  assert.equal(metadata.layoutQuality.surfaceSmoothing.afterTurn17.applied, true);
  assert.ok(metadata.layoutQuality.surfaceSmoothing.afterTurn17.maximumCorrectionMeters <= 4);
  assert.equal(metadata.realWorldScale, "1 unit = 1 metre; no vertical exaggeration");
});

test("Spa keeps the pit exit clear of the former edge grandstands", async () => {
  const exporter = await readFile(
    new URL("../../scripts/track-model-blender/export-spa-track-data.mjs", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(exporter, /stand\("Gold 2 GP2"/);
  assert.doesNotMatch(exporter, /stand\("Gold 7 La Source"/);
});

test("Spa uses the shared parameterized WebGL viewer", async () => {
  const [viewer, webgl] = await Promise.all([
    readFile(new URL("../components/racemate/track-model-3d.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/racemate/track-model-webgl.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(viewer, /model\.webgl/);
  assert.doesNotMatch(viewer, /model\.id === "zandvoort"/);
  assert.match(webgl, /useGLTF\(assetPath/);
  assert.match(webgl, /Array\.from\(\{ length: turnCount \}/);
});

test("Spa replay uses the 2026 digital twin with a real pit-lane path", async () => {
  const [player, replay3d] = await Promise.all([
    readFile(new URL("../features/race-replay/components/race-replay-player.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/race-replay/components/race-replay-zandvoort-3d.tsx", import.meta.url), "utf8"),
  ]);

  assert.equal(SPA_REPLAY_PATH.startFinishProgress, 0);
  assert.equal(SPA_REPLAY_PATH.trackPoints.length, SPA_MODEL.points.length);
  assert.ok(SPA_REPLAY_PATH.pitLanePoints.length >= 90);
  assert.equal(SPA_REPLAY_PATH.pitLanePoints[0][0], 0);
  assert.equal(SPA_REPLAY_PATH.pitLanePoints.at(-1)[0], 1);
  assert.notDeepEqual(
    SPA_REPLAY_PATH.pitLanePoints[0].slice(1, 3),
    SPA_REPLAY_PATH.pitLanePoints.at(-1).slice(1, 3),
  );
  assert.match(player, /replay\.sourceSeason === 2026/);
  assert.match(player, /return "spa"/);
  assert.match(player, /trackId=\{replay3dTrackId\}/);
  assert.match(replay3d, /SPA_REPLAY_PATH\.pitLanePoints/);
  assert.match(replay3d, /SPA_TRACK_MODEL\.webgl\.assetPath/);
});
