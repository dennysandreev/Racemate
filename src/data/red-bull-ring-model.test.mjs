import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

import {
  RED_BULL_RING_MODEL,
  RED_BULL_RING_REPLAY_PATH,
  RED_BULL_RING_TRACK_MODEL,
} from "./red-bull-ring-model.ts";

const EXPECTED_TURN_APEXES_METERS = [
  453, 759, 1_392, 2_200, 2_462, 2_758, 3_021, 3_168, 3_781, 3_989,
];

test("Red Bull Ring digital twin is a real-scale closed lap with ten turns", () => {
  assert.equal(RED_BULL_RING_TRACK_MODEL.camera.verticalExaggeration, 1);
  assert.equal(RED_BULL_RING_TRACK_MODEL.webgl.turnCount, 10);
  assert.equal(RED_BULL_RING_MODEL.lapLengthKm, 4.326);
  assert.equal(RED_BULL_RING_MODEL.points.length, 181);
  assert.deepEqual(
    RED_BULL_RING_MODEL.points.at(-1).slice(1),
    RED_BULL_RING_MODEL.points[0].slice(1),
  );
  assert.deepEqual(
    RED_BULL_RING_MODEL.turns.map(({ number }) => number),
    Array.from({ length: 10 }, (_, index) => index + 1),
  );
  assert.deepEqual(
    RED_BULL_RING_MODEL.turns.map(({ progress }) =>
      Math.round(progress * 4_306.888),
    ),
    EXPECTED_TURN_APEXES_METERS,
  );
});

test("Red Bull Ring FIA 2026 sector and speed-trap markers use official distances", async () => {
  const metadata = await readFile(
    new URL("../../public/f1/tracks/3d/red-bull-ring-metadata.json", import.meta.url),
    "utf8",
  ).then(JSON.parse);
  const geometryLength = metadata.lapLength.geometryMeters;
  const turnFour = RED_BULL_RING_MODEL.turns.find(({ number }) => number === 4);

  assert.ok(Math.abs(RED_BULL_RING_MODEL.sectorBreaks[0] * geometryLength - 1_215) < 1);
  assert.ok(Math.abs(RED_BULL_RING_MODEL.sectorBreaks[1] * geometryLength - 2_912) < 1);
  assert.ok(
    Math.abs((turnFour.progress - RED_BULL_RING_MODEL.speedTrapProgress) * geometryLength - 170) < 1,
  );
});

test("Red Bull Ring production assets and scene stay within the web budget", async () => {
  const [glb, preview, metadata] = await Promise.all([
    stat(new URL("../../public/f1/tracks/3d/red-bull-ring.glb", import.meta.url)),
    stat(new URL("../../public/f1/tracks/3d/red-bull-ring-preview.webp", import.meta.url)),
    readFile(
      new URL("../../public/f1/tracks/3d/red-bull-ring-metadata.json", import.meta.url),
      "utf8",
    ).then(JSON.parse),
  ]);

  assert.ok(glb.size <= 6_500_000);
  assert.ok(preview.size >= 50_000);
  assert.equal(metadata.lapLength.officialFiaMeters, 4_326);
  assert.ok(metadata.lapLength.relativeErrorPercent <= 0.5);
  assert.equal(metadata.objects.turnAnchors, 10);
  assert.equal(metadata.objects.pitGarageBoxes, 32);
  assert.equal(metadata.objects.mappedGrandstands, 9);
  assert.equal(metadata.objects.raceMotorhomes, 11);
  assert.deepEqual(metadata.turnAnchorDistancesMeters, EXPECTED_TURN_APEXES_METERS);
  assert.equal(metadata.layoutQuality.grandstands.openSeatingBowls, 9);
  assert.equal(metadata.layoutQuality.grandstands.opaqueRoofMaterial, true);
  assert.equal(metadata.layoutQuality.pitLane.pitComplex.coveredGrandstand, true);
  assert.equal(metadata.layoutQuality.pitLane.pitComplex.canopyMaterialOpaque, true);
  assert.equal(metadata.layoutQuality.buildings.roofedFootprints, metadata.objects.buildingsTotal);
  assert.equal(metadata.layoutQuality.pitLane.fastLaneSeparator, true);
  assert.equal(metadata.layoutQuality.surfaceClearance.terrainBreakthroughSamples, 0);
  assert.equal(metadata.realWorldScale, "1 unit = 1 metre; no vertical exaggeration");
  assert.equal(
    metadata.coordinateReferenceSystem,
    "EPSG:32633 + official Styria orthometric metres",
  );
  assert.ok(metadata.sourceManifest.sources.some(({ license }) => license === "CC BY 4.0 AT"));
  assert.ok(metadata.sourceManifest.sources.some(({ license }) => license === "ODbL 1.0"));
});

test("Red Bull Ring solid structures are exported as opaque materials", async () => {
  const glb = await readFile(
    new URL("../../public/f1/tracks/3d/red-bull-ring.glb", import.meta.url),
  );
  const jsonLength = glb.readUInt32LE(12);
  const gltf = JSON.parse(glb.subarray(20, 20 + jsonLength).toString("utf8"));
  const solidMaterials = gltf.materials.filter(({ name }) =>
    /Buildings|Grandstands|Motorhomes/.test(name),
  );

  assert.ok(solidMaterials.length >= 3);
  for (const material of solidMaterials) {
    assert.notEqual(material.alphaMode, "BLEND", `${material.name} must be opaque`);
  }
});

test("Red Bull Ring is loaded lazily by the shared WebGL viewer", async () => {
  const [lazyLoader, viewer, webgl] = await Promise.all([
    readFile(new URL("../components/racemate/track-model-3d-lazy.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/racemate/track-model-3d.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/racemate/track-model-webgl.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(lazyLoader, /import\("@\/data\/red-bull-ring-model"\)/);
  assert.match(viewer, /model\.webgl/);
  assert.match(webgl, /useGLTF\(assetPath/);
  assert.equal(RED_BULL_RING_TRACK_MODEL.webgl.assetPath, "/f1/tracks/3d/red-bull-ring.glb");
  assert.equal(
    RED_BULL_RING_TRACK_MODEL.webgl.previewPath,
    "/f1/tracks/3d/red-bull-ring-preview.webp",
  );
});

test("Red Bull Ring 2026 replay uses the digital twin and its measured pit lane", async () => {
  const [player, replayViewer] = await Promise.all([
    readFile(new URL("../features/race-replay/components/race-replay-player.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../features/race-replay/components/race-replay-zandvoort-3d.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.equal(RED_BULL_RING_REPLAY_PATH.startFinishProgress, 0);
  assert.equal(RED_BULL_RING_REPLAY_PATH.trackPoints.length, RED_BULL_RING_MODEL.points.length);
  assert.ok(RED_BULL_RING_REPLAY_PATH.pitLanePoints.length >= 90);
  assert.equal(RED_BULL_RING_REPLAY_PATH.pitLanePoints[0][0], 0);
  assert.equal(RED_BULL_RING_REPLAY_PATH.pitLanePoints.at(-1)[0], 1);
  assert.match(player, /replay\.sourceSeason === 2026[\s\S]*?return "red-bull-ring"/);
  assert.match(replayViewer, /"red-bull-ring":\s*\{/);
  assert.match(replayViewer, /path:\s*RED_BULL_RING_REPLAY_PATH/);
  assert.match(replayViewer, /RED_BULL_RING_TRACK_MODEL\.webgl\.assetPath/);
});
