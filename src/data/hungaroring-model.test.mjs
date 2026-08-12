import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

import {
  HUNGARORING_MODEL,
  HUNGARORING_REPLAY_PATH,
  HUNGARORING_TRACK_MODEL,
} from "./hungaroring-model.ts";

test("Hungaroring digital twin is a real-scale closed lap with fourteen turns", () => {
  assert.equal(HUNGARORING_TRACK_MODEL.camera.verticalExaggeration, 1);
  assert.equal(HUNGARORING_TRACK_MODEL.webgl.turnCount, 14);
  assert.deepEqual(HUNGARORING_MODEL.points.at(-1).slice(1), HUNGARORING_MODEL.points[0].slice(1));
  assert.deepEqual(
    HUNGARORING_MODEL.turns.map(({ number }) => number),
    Array.from({ length: 14 }, (_, index) => index + 1),
  );
  assert.equal(HUNGARORING_MODEL.lapLengthKm, 4.381);
  assert.ok(HUNGARORING_MODEL.elevationChangeM >= 35);
  assert.equal(HUNGARORING_MODEL.points.length, 181);
});

test("Hungaroring FIA sector and speed-trap markers use the 2026 distances", async () => {
  const metadata = await readFile(
    new URL("../../public/f1/tracks/3d/hungaroring-metadata.json", import.meta.url),
    "utf8",
  ).then(JSON.parse);
  const geometryLength = metadata.lapLength.geometryMeters;
  const [sectorOneEnd, sectorTwoEnd] = HUNGARORING_MODEL.sectorBreaks;
  const turnOne = HUNGARORING_MODEL.turns.find(({ number }) => number === 1);

  assert.ok(Math.abs(sectorOneEnd * geometryLength - 1_736) < 1);
  assert.ok(Math.abs(sectorTwoEnd * geometryLength - 3_278) < 1);
  assert.ok(Math.abs((turnOne.progress - HUNGARORING_MODEL.speedTrapProgress) * geometryLength - 310) < 1);
});

test("Hungaroring FIA turn anchors follow the fourteen actual bends", () => {
  for (const turn of HUNGARORING_MODEL.turns) {
    assert.ok(
      headingChangeAroundProgress(HUNGARORING_MODEL.points, turn.progress, 50) >= 25,
      `turn ${turn.number} is placed on a straight instead of its FIA corner`,
    );
  }
});

test("Hungaroring production assets and scene content stay within the web budget", async () => {
  const [glb, preview, metadata] = await Promise.all([
    stat(new URL("../../public/f1/tracks/3d/hungaroring.glb", import.meta.url)),
    stat(new URL("../../public/f1/tracks/3d/hungaroring-preview.webp", import.meta.url)),
    readFile(new URL("../../public/f1/tracks/3d/hungaroring-metadata.json", import.meta.url), "utf8")
      .then(JSON.parse),
  ]);

  assert.ok(glb.size <= 6_500_000);
  assert.ok(preview.size >= 50_000);
  assert.equal(metadata.lapLength.officialFiaMeters, 4_381);
  assert.ok(metadata.lapLength.relativeErrorPercent <= 0.5);
  assert.equal(metadata.objects.turnAnchors, 14);
  assert.equal(metadata.objects.pitGarageBoxes, 36);
  assert.ok(metadata.objects.buildingsTotal >= 20);
  assert.ok(metadata.objects.grandstandSections >= 80);
  assert.ok(metadata.objects.fenceSegments >= 200);
  assert.ok(metadata.objects.mappedTrees >= 40);
  assert.equal(metadata.objects.raceMotorhomes, 11);
  assert.equal(metadata.layoutQuality.motorhomes.remainingTrackConflicts, 0);
  assert.equal(metadata.layoutQuality.motorhomes.compactCluster, true);
  assert.equal(metadata.layoutQuality.motorhomes.rearTowardPitGrandstand, true);
  assert.ok(metadata.layoutQuality.motorhomes.clusterSpanMeters <= 75);
  assert.equal(metadata.layoutQuality.pitLane.fastLaneSeparator, true);
  assert.equal(metadata.layoutQuality.pitLane.pitBoxes, 36);
  assert.equal(metadata.layoutQuality.pitLane.pitComplex.garageBoxes, 36);
  assert.ok(metadata.layoutQuality.pitLane.pitWall.wallHeightMeters <= 0.55);
  assert.ok(metadata.layoutQuality.pitLane.pitWall.fenceHeightMeters <= 0.65);
  assert.ok(metadata.layoutQuality.pitLane.pitWall.lengthMeters >= 700);
  assert.equal(metadata.layoutQuality.surfaceClearance.terrainBreakthroughSamples, 0);
  assert.equal(metadata.layoutQuality.runoff.syntheticGravelAtPitEntry, false);
  assert.deepEqual(metadata.layoutQuality.runoff.excludedTurns, [12, 13, 14]);
  assert.ok(metadata.layoutQuality.curbs.innerOffsetMeters > 7.5);
  assert.ok(metadata.layoutQuality.curbs.widthMeters >= 1.1);
  assert.ok(metadata.layoutQuality.curbs.visibleHeightMeters >= 0.1);
  assert.equal(metadata.layoutQuality.surfaceSmoothing.wholeLap.applied, true);
  assert.ok(
    metadata.layoutQuality.surfaceSmoothing.wholeLap.maximumSmoothedStepMeters
      < metadata.layoutQuality.surfaceSmoothing.wholeLap.maximumRawStepMeters,
  );
  assert.ok(metadata.layoutQuality.surfaceSmoothing.wholeLap.maximumCorrectionMeters <= 4);
  assert.equal(metadata.realWorldScale, "1 unit = 1 metre; no vertical exaggeration");
  assert.equal(metadata.coordinateReferenceSystem, "EPSG:32634 + source DEM metres");
  assert.ok(metadata.sourceManifest.sources.some(({ license }) => license === "ODbL 1.0"));
  assert.ok(metadata.sourceManifest.sources.some(({ license }) => license === "CC BY 4.0"));
  assert.ok(
    metadata.sourceManifest.sources
      .find(({ file }) => file === "terrain-tile-manifest.json")
      .members.length > 50,
  );
  assert.ok(
    metadata.sourceManifest.sources.some(
      ({ file, license }) => file === "openstreetmap-ground.json" && license === "ODbL 1.0",
    ),
  );
  assert.equal(metadata.layoutQuality.terrainSurface.macroColorSource, "2022 orthophoto overview");
  assert.equal(metadata.layoutQuality.terrainSurface.detailSource, "current OpenStreetMap ground geometry");
  assert.ok(metadata.layoutQuality.terrainSurface.currentGroundPolygons >= 30);
  assert.ok(metadata.layoutQuality.terrainSurface.currentGroundLines >= 80);
  assert.ok(metadata.layoutQuality.terrainSurface.textureWidth >= 3_000);
  assert.ok(metadata.layoutQuality.terrainSurface.textureHeight >= 3_000);
});

function headingChangeAroundProgress(points, progress, radiusMeters) {
  const pointCount = points.length - 1;
  const lapLengthMeters = HUNGARORING_MODEL.lapLengthKm * 1_000;
  const progressRadius = radiusMeters / lapLengthMeters;
  const pointAt = (requestedProgress) => {
    const normalized = ((requestedProgress % 1) + 1) % 1;
    const scaled = normalized * pointCount;
    const lower = Math.floor(scaled) % pointCount;
    const upper = (lower + 1) % pointCount;
    const blend = scaled - Math.floor(scaled);
    return [
      points[lower][1] * (1 - blend) + points[upper][1] * blend,
      points[lower][2] * (1 - blend) + points[upper][2] * blend,
    ];
  };
  const beforeOuter = pointAt(progress - progressRadius);
  const beforeInner = pointAt(progress - progressRadius / 3);
  const afterInner = pointAt(progress + progressRadius / 3);
  const afterOuter = pointAt(progress + progressRadius);
  const incoming = Math.atan2(
    beforeInner[1] - beforeOuter[1],
    beforeInner[0] - beforeOuter[0],
  );
  const outgoing = Math.atan2(
    afterOuter[1] - afterInner[1],
    afterOuter[0] - afterInner[0],
  );
  return Math.abs(Math.atan2(Math.sin(outgoing - incoming), Math.cos(outgoing - incoming)))
    * 180 / Math.PI;
}

test("Hungaroring keeps a separate measured pit-lane controller path", () => {
  assert.equal(HUNGARORING_REPLAY_PATH.startFinishProgress, 0);
  assert.equal(HUNGARORING_REPLAY_PATH.trackPoints.length, HUNGARORING_MODEL.points.length);
  assert.ok(HUNGARORING_REPLAY_PATH.pitLanePoints.length >= 90);
  assert.equal(HUNGARORING_REPLAY_PATH.pitLanePoints[0][0], 0);
  assert.equal(HUNGARORING_REPLAY_PATH.pitLanePoints.at(-1)[0], 1);
  assert.notDeepEqual(
    HUNGARORING_REPLAY_PATH.pitLanePoints[0].slice(1, 3),
    HUNGARORING_REPLAY_PATH.pitLanePoints.at(-1).slice(1, 3),
  );
});

test("Hungaroring is loaded lazily by the shared parameterized WebGL viewer", async () => {
  const [lazyLoader, viewer, webgl] = await Promise.all([
    readFile(new URL("../components/racemate/track-model-3d-lazy.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/racemate/track-model-3d.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/racemate/track-model-webgl.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(lazyLoader, /import\("@\/data\/hungaroring-model"\)/);
  assert.match(viewer, /model\.webgl/);
  assert.match(webgl, /useGLTF\(assetPath/);
  assert.equal(HUNGARORING_TRACK_MODEL.webgl.assetPath, "/f1/tracks/3d/hungaroring.glb");
  assert.equal(HUNGARORING_TRACK_MODEL.webgl.previewPath, "/f1/tracks/3d/hungaroring-preview.webp");
});

test("Hungaroring 2026 replay uses the shared 3D scene and its measured controller paths", async () => {
  const [player, replayViewer] = await Promise.all([
    readFile(new URL("../features/race-replay/components/race-replay-player.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/race-replay/components/race-replay-zandvoort-3d.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(player, /replay\.sourceSeason === 2026[\s\S]*?"hungaroring"/);
  assert.match(replayViewer, /hungaroring:\s*\{/);
  assert.match(replayViewer, /path:\s*HUNGARORING_REPLAY_PATH/);
  assert.match(replayViewer, /HUNGARORING_TRACK_MODEL\.webgl\.assetPath/);
});
