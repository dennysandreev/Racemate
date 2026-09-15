import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

import {
  MONTREAL_MODEL,
  MONTREAL_REPLAY_PATH,
  MONTREAL_TRACK_MODEL,
} from "./montreal-model.ts";

const EXPECTED_TURN_APEXES_METERS = [
  226, 329, 708, 766, 995, 1_242, 1_301, 1_988, 2_070, 2_678, 2_773, 3_152,
  3_869, 3_903,
];

test("Montreal digital twin is a real-scale closed lap with fourteen turns", async () => {
  const metadata = await readFile(
    new URL("../../public/f1/tracks/3d/montreal-metadata.json", import.meta.url),
    "utf8",
  ).then(JSON.parse);

  assert.equal(MONTREAL_TRACK_MODEL.camera.verticalExaggeration, 1);
  assert.equal(MONTREAL_TRACK_MODEL.webgl.turnCount, 14);
  assert.equal(MONTREAL_MODEL.lapLengthKm, 4.361);
  assert.equal(MONTREAL_MODEL.points.length, 181);
  assert.deepEqual(
    MONTREAL_MODEL.points.at(-1).slice(1),
    MONTREAL_MODEL.points[0].slice(1),
  );
  assert.deepEqual(
    MONTREAL_MODEL.turns.map(({ number }) => number),
    Array.from({ length: 14 }, (_, index) => index + 1),
  );
  assert.deepEqual(
    MONTREAL_MODEL.turns.map(({ progress }) =>
      Math.round(progress * metadata.lapLength.geometryMeters),
    ),
    EXPECTED_TURN_APEXES_METERS,
  );
});

test("Montreal FIA 2026 controls use official distances", async () => {
  const metadata = await readFile(
    new URL("../../public/f1/tracks/3d/montreal-metadata.json", import.meta.url),
    "utf8",
  ).then(JSON.parse);
  const geometryLength = metadata.lapLength.geometryMeters;
  const turnThirteen = MONTREAL_MODEL.turns.find(({ number }) => number === 13);

  assert.ok(Math.abs(MONTREAL_MODEL.sectorBreaks[0] * geometryLength - 1_092) < 1);
  assert.ok(Math.abs(MONTREAL_MODEL.sectorBreaks[1] * geometryLength - 2_488) < 1);
  assert.ok(
    Math.abs((turnThirteen.progress - MONTREAL_MODEL.speedTrapProgress) * geometryLength - 250) < 1,
  );
});

test("Montreal production assets stay within budget and retain measured context", async () => {
  const [glb, preview, metadata] = await Promise.all([
    stat(new URL("../../public/f1/tracks/3d/montreal.glb", import.meta.url)),
    stat(new URL("../../public/f1/tracks/3d/montreal-preview.webp", import.meta.url)),
    readFile(
      new URL("../../public/f1/tracks/3d/montreal-metadata.json", import.meta.url),
      "utf8",
    ).then(JSON.parse),
  ]);

  assert.ok(glb.size <= 6_500_000);
  assert.ok(preview.size >= 50_000);
  assert.equal(metadata.lapLength.officialFiaMeters, 4_361);
  assert.ok(metadata.lapLength.relativeErrorPercent <= 0.1);
  assert.equal(metadata.objects.turnAnchors, 14);
  assert.equal(metadata.objects.pitGarageBoxes, 43);
  assert.equal(metadata.objects.mappedGrandstands, 8);
  assert.ok(metadata.objects.grandstandSections >= 35);
  assert.equal(metadata.layoutQuality.grandstands.configuredGrandstands, 10);
  assert.equal(metadata.layoutQuality.grandstands.remainingBlockOverlaps, 0);
  assert.equal(metadata.layoutQuality.grandstands.remainingTrackConflicts, 0);
  assert.ok(metadata.objects.buildingsTotal >= 100);
  assert.ok(metadata.objects.fenceSegments >= 800);
  assert.ok(metadata.objects.trees >= 200);
  assert.equal(metadata.layoutQuality.pitLane.fastLaneSeparator, true);
  assert.equal(metadata.layoutQuality.surfaceClearance.terrainBreakthroughSamples, 0);
  assert.equal(metadata.layoutQuality.curbs.meshSanitizationApplied, false);
  assert.equal(metadata.layoutQuality.buildings.maximumCentroidDriftMeters, 0);
  assert.equal(metadata.layoutQuality.buildings.excludedObjects.length, 7);
  assert.equal(metadata.coordinateReferenceSystem, "EPSG:32188 + CGVD2013");
  assert.equal(metadata.realWorldScale, "1 unit = 1 metre; no vertical exaggeration");
  assert.ok(metadata.sourceManifest.sources.some(
    ({ license }) => license === "Open Government Licence - Canada",
  ));
  assert.ok(metadata.sourceManifest.sources.some(({ license }) => license === "ODbL 1.0"));
});

test("Montreal review corrections keep pits and grandstands on dry verified footprints", async () => {
  const metadata = await readFile(
    new URL("../../public/f1/tracks/3d/montreal-metadata.json", import.meta.url),
    "utf8",
  ).then(JSON.parse);

  assert.equal(metadata.objects.raceMotorhomes, 0);
  assert.equal(metadata.layoutQuality.motorhomes.pitPlatformObjectsRemoved, true);
  assert.ok(metadata.layoutQuality.pitLane.exitMinimumWidthMeters >= 0.5);
  assert.equal(
    metadata.layoutQuality.pitLane.exitJunction,
    "smooth flush asphalt merge with FIA 2026 continuous white line",
  );
  assert.equal(metadata.layoutQuality.pitLane.entryWedgeBuildingRemoved, true);
  assert.equal(
    metadata.layoutQuality.pitLane.entryJunction,
    "smooth flush asphalt taper without a grey wedge",
  );
  assert.equal(metadata.layoutQuality.pitLane.exitGuideLine.present, true);
  assert.equal(metadata.layoutQuality.pitLane.exitGuideLine.style, "continuous white");
  assert.ok(metadata.layoutQuality.pitLane.exitGuideLine.lengthMeters >= 55);
  assert.ok(metadata.layoutQuality.pitLane.pitWall.wallHeightMeters >= 1);
  assert.ok(metadata.layoutQuality.pitLane.pitWall.fenceHeightMeters >= 1.8);
  assert.equal(metadata.layoutQuality.pitLane.pitWall.gatedOpenings, true);
  assert.ok(metadata.layoutQuality.pitLane.pitWall.gatePanels >= 2);
  assert.deepEqual(metadata.layoutQuality.runoff.excludedTurns, [1, 2, 13, 14]);
  assert.equal(metadata.layoutQuality.runoff.syntheticRunoffAtPitExit, false);
  assert.ok(metadata.layoutQuality.pitLane.pitComplex.buildingDepthMeters >= 30);
  assert.equal(metadata.layoutQuality.pitLane.pitComplex.garageSide, "left");
  assert.equal(metadata.layoutQuality.pitLane.pitComplex.garageFrontFacesPitLane, true);
  assert.equal(
    metadata.layoutQuality.pitLane.pitComplex.rearEdge,
    "extends across the narrow pit platform toward the rowing basin",
  );
  assert.deepEqual(
    metadata.layoutQuality.grandstands.removedAfterVisualReview,
    ["Grandstand 1", "Grandstand 10", "Grandstand 12"],
  );
  assert.deepEqual(
    metadata.layoutQuality.grandstands.relocatedAfterVisualReview,
    ["Grandstand 31", "Grandstand 15"],
  );
});

test("Montreal replaces the former Canvas visualization through the shared WebGL viewer", async () => {
  const [lazyLoader, viewer, webgl, replayPlayer, replayViewer] = await Promise.all([
    readFile(new URL("../components/racemate/track-model-3d-lazy.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/racemate/track-model-3d.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/racemate/track-model-webgl.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/race-replay/components/race-replay-player.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/race-replay/components/race-replay-zandvoort-3d.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(lazyLoader, /import\("@\/data\/montreal-model"\)/);
  assert.match(viewer, /model\.webgl/);
  assert.match(webgl, /useGLTF\(assetPath/);
  assert.equal(MONTREAL_TRACK_MODEL.webgl.assetPath, "/f1/tracks/3d/montreal.glb");
  assert.equal(
    MONTREAL_TRACK_MODEL.webgl.previewPath,
    "/f1/tracks/3d/montreal-preview.webp",
  );
  assert.equal(MONTREAL_REPLAY_PATH.startFinishProgress, 0);
  assert.equal(MONTREAL_REPLAY_PATH.trackPoints.length, MONTREAL_MODEL.points.length);
  assert.ok(MONTREAL_REPLAY_PATH.pitLanePoints.length >= 90);
  assert.match(replayPlayer, /return "montreal"/);
  assert.match(replayViewer, /montreal:\s*\{/);
});
