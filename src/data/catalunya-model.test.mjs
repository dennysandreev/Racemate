import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

import {
  CATALUNYA_MODEL,
  CATALUNYA_REPLAY_PATH,
  CATALUNYA_TRACK_MODEL,
} from "./catalunya-model.ts";

const EXPECTED_TURN_APEXES_METERS = [
  821, 903, 1_156, 1_729, 2_169, 2_365, 2_530,
  2_626, 2_895, 3_492, 3_648, 3_750, 4_058, 4_350,
];
const EXPECTED_GEOMETRY_LENGTH_METERS = 4_650.933;

test("Barcelona-Catalunya digital twin is a real-scale closed lap with fourteen turns", () => {
  assert.equal(CATALUNYA_TRACK_MODEL.camera.verticalExaggeration, 1);
  assert.equal(CATALUNYA_TRACK_MODEL.webgl.turnCount, 14);
  assert.equal(CATALUNYA_MODEL.lapLengthKm, 4.657);
  assert.equal(CATALUNYA_MODEL.points.length, 181);
  assert.deepEqual(CATALUNYA_MODEL.points.at(-1).slice(1), CATALUNYA_MODEL.points[0].slice(1));
  assert.deepEqual(
    CATALUNYA_MODEL.turns.map(({ number }) => number),
    Array.from({ length: 14 }, (_, index) => index + 1),
  );
  assert.deepEqual(
    CATALUNYA_MODEL.turns.map(({ progress }) => Math.round(progress * EXPECTED_GEOMETRY_LENGTH_METERS)),
    EXPECTED_TURN_APEXES_METERS,
  );
});

test("Barcelona-Catalunya FIA 2026 sectors and speed trap use official distances", async () => {
  const metadata = await readFile(
    new URL("../../public/f1/tracks/3d/catalunya-metadata.json", import.meta.url),
    "utf8",
  ).then(JSON.parse);
  const geometryLength = metadata.lapLength.geometryMeters;
  const turnOne = CATALUNYA_MODEL.turns.find(({ number }) => number === 1);

  assert.ok(Math.abs(CATALUNYA_MODEL.sectorBreaks[0] * geometryLength - 1_273) < 1);
  assert.ok(Math.abs(CATALUNYA_MODEL.sectorBreaks[1] * geometryLength - 3_038) < 1);
  assert.ok(
    Math.abs((turnOne.progress - CATALUNYA_MODEL.speedTrapProgress) * geometryLength - 220) < 1,
  );
});

test("Barcelona-Catalunya assets and scene stay within the production budget", async () => {
  const [glb, preview, metadata] = await Promise.all([
    stat(new URL("../../public/f1/tracks/3d/catalunya.glb", import.meta.url)),
    stat(new URL("../../public/f1/tracks/3d/catalunya-preview.webp", import.meta.url)),
    readFile(
      new URL("../../public/f1/tracks/3d/catalunya-metadata.json", import.meta.url),
      "utf8",
    ).then(JSON.parse),
  ]);

  assert.ok(glb.size <= 6_500_000);
  assert.ok(preview.size >= 50_000);
  assert.equal(metadata.lapLength.officialFiaMeters, 4_657);
  assert.ok(metadata.lapLength.relativeErrorPercent <= 0.5);
  assert.equal(metadata.objects.turnAnchors, 14);
  assert.equal(metadata.objects.pitGarageBoxes, 40);
  assert.ok(metadata.objects.buildingsTotal >= 300);
  assert.ok(metadata.objects.grandstandSections >= 50);
  assert.equal(metadata.objects.raceMotorhomes, 11);
  assert.equal(metadata.layoutQuality.pitLane.fastLaneSeparator, true);
  assert.equal(metadata.layoutQuality.pitLane.pitComplex.garageBoxes, 40);
  assert.equal(metadata.layoutQuality.pitLane.pitComplex.coveredGrandstand, true);
  assert.equal(metadata.layoutQuality.buildings.excludedReplacedCircuitStructures, 1);
  assert.deepEqual(metadata.layoutQuality.buildings.replacedOsmBuildingIds, [33_742_578]);
  assert.ok(Math.abs(metadata.layoutQuality.pitLane.pitWall.lengthMeters - 475) <= 1);
  assert.equal(metadata.layoutQuality.pitLane.pitWall.sourceSystemLengthMeters, 475);
  assert.ok(metadata.layoutQuality.pitLane.pitWall.fenceHeightMeters >= 2);
  assert.deepEqual(
    metadata.layoutQuality.circuitConfiguration.currentFinalSectorWayIds,
    [893_732_520, 831_804_325, 990_483_278],
  );
  assert.equal(
    metadata.layoutQuality.circuitConfiguration.deprecatedChicaneExcluded,
    true,
  );
  assert.deepEqual(
    metadata.layoutQuality.grandstands.excludedCurrentEventStandIds,
    [725_695_175],
  );
  assert.equal(metadata.layoutQuality.surfaceClearance.terrainBreakthroughSamples, 0);
  assert.equal(metadata.realWorldScale, "1 unit = 1 metre; no vertical exaggeration");
  assert.equal(
    metadata.coordinateReferenceSystem,
    "EPSG:25831 + ICGC source elevation metres",
  );
  assert.ok(metadata.sourceManifest.sources.some(({ license }) => license === "CC BY 4.0"));
  assert.ok(metadata.sourceManifest.sources.some(({ license }) => license === "ODbL 1.0"));
});

test("Barcelona-Catalunya is loaded lazily by the shared WebGL viewers", async () => {
  const [lazyLoader, viewer, replayPlayer, replayViewer] = await Promise.all([
    readFile(new URL("../components/racemate/track-model-3d-lazy.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/racemate/track-model-3d.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/race-replay/components/race-replay-player.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/race-replay/components/race-replay-zandvoort-3d.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(lazyLoader, /import\("@\/data\/catalunya-model"\)/);
  assert.match(viewer, /model\.webgl/);
  assert.match(replayPlayer, /return "catalunya"/);
  assert.match(replayViewer, /catalunya:\s*\{/);
  assert.equal(CATALUNYA_TRACK_MODEL.webgl.assetPath, "/f1/tracks/3d/catalunya.glb");
  assert.equal(CATALUNYA_TRACK_MODEL.webgl.previewPath, "/f1/tracks/3d/catalunya-preview.webp");
  assert.equal(CATALUNYA_REPLAY_PATH.trackPoints.length, CATALUNYA_MODEL.points.length);
  assert.ok(CATALUNYA_REPLAY_PATH.pitLanePoints.length >= 90);
});
