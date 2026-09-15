import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

import {
  MONACO_MODEL,
  MONACO_REPLAY_PATH,
  MONACO_TRACK_MODEL,
} from "./monaco-model.ts";

test("Monaco digital twin is a real-scale closed lap with nineteen turns", () => {
  assert.equal(MONACO_TRACK_MODEL.camera.verticalExaggeration, 1);
  assert.equal(MONACO_TRACK_MODEL.webgl.turnCount, 19);
  assert.equal(MONACO_MODEL.points.length, 181);
  assert.deepEqual(MONACO_MODEL.points.at(-1).slice(1), MONACO_MODEL.points[0].slice(1));
  assert.deepEqual(
    MONACO_MODEL.turns.map(({ number }) => number),
    Array.from({ length: 19 }, (_, index) => index + 1),
  );
  assert.equal(MONACO_MODEL.lapLengthKm, 3.337);
  assert.ok(MONACO_MODEL.elevationChangeM >= 40 && MONACO_MODEL.elevationChangeM <= 45);
});

test("Monaco FIA markers use the current 2026 distances", async () => {
  const metadata = await readFile(
    new URL("../../public/f1/tracks/3d/monaco-metadata.json", import.meta.url),
    "utf8",
  ).then(JSON.parse);
  const geometryLength = metadata.lapLength.geometryMeters;
  const [sectorOneEnd, sectorTwoEnd] = MONACO_MODEL.sectorBreaks;
  const turnTen = MONACO_MODEL.turns.find(({ number }) => number === 10);

  assert.ok(Math.abs(sectorOneEnd * geometryLength - 1_051) < 1);
  assert.ok(Math.abs(sectorTwoEnd * geometryLength - 2_470) < 1);
  assert.ok(Math.abs((turnTen.progress - MONACO_MODEL.speedTrapProgress) * geometryLength - 190) < 1);
  assert.deepEqual(metadata.turnAnchorDistancesMeters, [
    198, 604, 769, 892, 1_123, 1_242, 1_325, 1_414, 1_750, 2_086,
    2_142, 2_375, 2_527, 2_556, 2_694, 2_716, 2_788, 2_911, 3_004,
  ]);
});

test("Monaco production scene and tunnel stay within the web contract", async () => {
  const [glb, preview, metadata] = await Promise.all([
    stat(new URL("../../public/f1/tracks/3d/monaco.glb", import.meta.url)),
    stat(new URL("../../public/f1/tracks/3d/monaco-preview.webp", import.meta.url)),
    readFile(new URL("../../public/f1/tracks/3d/monaco-metadata.json", import.meta.url), "utf8")
      .then(JSON.parse),
  ]);

  assert.ok(glb.size <= 6_500_000);
  assert.ok(preview.size >= 50_000);
  assert.equal(metadata.lapLength.officialFiaMeters, 3_337);
  assert.ok(metadata.lapLength.relativeErrorPercent <= 0.5);
  assert.equal(metadata.objects.turnAnchors, 19);
  assert.equal(metadata.objects.pitGarageBoxes, 11);
  assert.equal(metadata.objects.mappedGrandstands, 9);
  assert.ok(metadata.objects.buildingsTotal >= 800);
  assert.ok(metadata.objects.fenceSegments >= 250);
  assert.equal(metadata.objects.raceMotorhomes, 11);
  assert.equal(metadata.layoutQuality.pitLane.fastLaneSeparator, true);
  assert.equal(metadata.layoutQuality.pitLane.pitComplex.garageBoxes, 11);
  assert.equal(metadata.layoutQuality.tunnel.roofed, true);
  assert.ok(metadata.layoutQuality.tunnel.lengthMeters >= 450);
  assert.equal(metadata.layoutQuality.surfaceClearance.terrainBreakthroughSamples, 0);
  assert.equal(metadata.layoutQuality.surfaceClearance.tunnelExcludedFromTerrainClearance, true);
  assert.ok(metadata.layoutQuality.surfaceClearance.tunnelUndergroundSamples > 0);
  assert.ok(metadata.layoutQuality.surfaceSmoothing.wholeLap.maximumCorrectionMeters <= 4);
  assert.equal(metadata.realWorldScale, "1 unit = 1 metre; no vertical exaggeration");
  assert.equal(metadata.coordinateReferenceSystem, "EPSG:32632 + source DEM metres");
});

test("Monaco keeps a measured pit-lane controller path", () => {
  assert.equal(MONACO_REPLAY_PATH.startFinishProgress, 0);
  assert.equal(MONACO_REPLAY_PATH.trackPoints.length, MONACO_MODEL.points.length);
  assert.ok(MONACO_REPLAY_PATH.pitLanePoints.length >= 90);
  assert.equal(MONACO_REPLAY_PATH.pitLanePoints[0][0], 0);
  assert.equal(MONACO_REPLAY_PATH.pitLanePoints.at(-1)[0], 1);
  assert.notDeepEqual(
    MONACO_REPLAY_PATH.pitLanePoints[0].slice(1, 3),
    MONACO_REPLAY_PATH.pitLanePoints.at(-1).slice(1, 3),
  );
});

test("Monaco is loaded lazily by the shared WebGL viewer", async () => {
  const [lazyLoader, viewer] = await Promise.all([
    readFile(new URL("../components/racemate/track-model-3d-lazy.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/racemate/track-model-3d.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(lazyLoader, /import\("@\/data\/monaco-model"\)/);
  assert.match(viewer, /model\.webgl/);
  assert.equal(MONACO_TRACK_MODEL.webgl.assetPath, "/f1/tracks/3d/monaco.glb");
  assert.equal(MONACO_TRACK_MODEL.webgl.previewPath, "/f1/tracks/3d/monaco-preview.webp");
});
