import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

import {
  SILVERSTONE_MODEL,
  SILVERSTONE_REPLAY_PATH,
  SILVERSTONE_TRACK_MODEL,
} from "./silverstone-model.ts";

test("Silverstone digital twin is a real-scale closed lap with eighteen turns", () => {
  assert.equal(SILVERSTONE_TRACK_MODEL.camera.verticalExaggeration, 1);
  assert.equal(SILVERSTONE_TRACK_MODEL.webgl.turnCount, 18);
  assert.deepEqual(SILVERSTONE_MODEL.points.at(-1).slice(1), SILVERSTONE_MODEL.points[0].slice(1));
  assert.deepEqual(
    SILVERSTONE_MODEL.turns.map(({ number }) => number),
    Array.from({ length: 18 }, (_, index) => index + 1),
  );
  assert.equal(SILVERSTONE_MODEL.lapLengthKm, 5.891);
  assert.ok(SILVERSTONE_MODEL.elevationChangeM >= 11);
  assert.equal(SILVERSTONE_MODEL.points.length, 221);
});

test("Silverstone FIA sector and speed-trap markers use the 2026 distances", async () => {
  const metadata = await readFile(
    new URL("../../public/f1/tracks/3d/silverstone-metadata.json", import.meta.url),
    "utf8",
  ).then(JSON.parse);
  const geometryLength = metadata.lapLength.geometryMeters;
  const [sectorOneEnd, sectorTwoEnd] = SILVERSTONE_MODEL.sectorBreaks;
  const turnFifteen = SILVERSTONE_MODEL.turns.find(({ number }) => number === 15);

  assert.ok(Math.abs(sectorOneEnd * geometryLength - 1_823) < 1);
  assert.ok(Math.abs(sectorTwoEnd * geometryLength - 4_287) < 1);
  assert.ok(
    Math.abs((turnFifteen.progress - SILVERSTONE_MODEL.speedTrapProgress) * geometryLength - 140) < 1,
  );
});

test("Silverstone production assets and scene stay within the web budget", async () => {
  const [glb, preview, metadata] = await Promise.all([
    stat(new URL("../../public/f1/tracks/3d/silverstone.glb", import.meta.url)),
    stat(new URL("../../public/f1/tracks/3d/silverstone-preview.webp", import.meta.url)),
    readFile(new URL("../../public/f1/tracks/3d/silverstone-metadata.json", import.meta.url), "utf8")
      .then(JSON.parse),
  ]);

  assert.ok(glb.size <= 6_500_000);
  assert.ok(preview.size >= 50_000);
  assert.equal(metadata.lapLength.officialFiaMeters, 5_891);
  assert.ok(metadata.lapLength.relativeErrorPercent <= 0.5);
  assert.equal(metadata.objects.turnAnchors, 18);
  assert.equal(metadata.objects.pitGarageBoxes, 41);
  assert.ok(metadata.objects.buildingsTotal >= 500);
  assert.ok(metadata.objects.grandstandSections >= 60);
  assert.ok(metadata.objects.fenceSegments >= 3_000);
  assert.equal(metadata.objects.raceMotorhomes, 11);
  assert.equal(metadata.layoutQuality.pitLane.fastLaneSeparator, true);
  assert.equal(metadata.layoutQuality.pitLane.pitComplex.garageBoxes, 41);
  assert.equal(metadata.layoutQuality.motorhomes.behindPitComplex, true);
  assert.equal(metadata.layoutQuality.surfaceClearance.terrainBreakthroughSamples, 0);
  assert.equal(metadata.layoutQuality.runoff.syntheticGravelAtPitEntry, false);
  assert.equal(metadata.layoutQuality.buildings.downwardFacingRoofTriangles, 0);
  assert.equal(metadata.layoutQuality.grandstands.mapped.downwardFacingRoofTriangles, 0);
  assert.equal(metadata.realWorldScale, "1 unit = 1 metre; no vertical exaggeration");
  assert.equal(metadata.coordinateReferenceSystem, "EPSG:32630 + ODN");
  assert.ok(
    metadata.sourceManifest.sources.some(
      ({ license }) => license === "Open Government Licence v3.0",
    ),
  );
  assert.ok(metadata.sourceManifest.sources.some(({ license }) => license === "ODbL 1.0"));
});

test("Silverstone is loaded lazily by the shared parameterized WebGL viewer", async () => {
  const [lazyLoader, viewer, webgl] = await Promise.all([
    readFile(new URL("../components/racemate/track-model-3d-lazy.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/racemate/track-model-3d.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/racemate/track-model-webgl.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(lazyLoader, /import\("@\/data\/silverstone-model"\)/);
  assert.match(viewer, /model\.webgl/);
  assert.match(webgl, /useGLTF\(assetPath/);
  assert.equal(SILVERSTONE_TRACK_MODEL.webgl.assetPath, "/f1/tracks/3d/silverstone.glb");
  assert.equal(
    SILVERSTONE_TRACK_MODEL.webgl.previewPath,
    "/f1/tracks/3d/silverstone-preview.webp",
  );
});

test("Silverstone 2026 replay uses the digital twin and its measured pit lane", async () => {
  const [player, replayViewer] = await Promise.all([
    readFile(new URL("../features/race-replay/components/race-replay-player.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../features/race-replay/components/race-replay-zandvoort-3d.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.equal(SILVERSTONE_REPLAY_PATH.startFinishProgress, 0);
  assert.equal(SILVERSTONE_REPLAY_PATH.trackPoints.length, SILVERSTONE_MODEL.points.length);
  assert.ok(SILVERSTONE_REPLAY_PATH.pitLanePoints.length >= 90);
  assert.equal(SILVERSTONE_REPLAY_PATH.pitLanePoints[0][0], 0);
  assert.equal(SILVERSTONE_REPLAY_PATH.pitLanePoints.at(-1)[0], 1);
  assert.match(player, /replay\.sourceSeason === 2026[\s\S]*?return "silverstone"/);
  assert.match(replayViewer, /silverstone:\s*\{/);
  assert.match(replayViewer, /path:\s*SILVERSTONE_REPLAY_PATH/);
  assert.match(replayViewer, /SILVERSTONE_TRACK_MODEL\.webgl\.assetPath/);
});

test("Silverstone keeps the requested grandstand and pit-entry layout", async () => {
  const [exporter, metadata] = await Promise.all([
    readFile(
      new URL("../../scripts/track-model-blender/export-silverstone-track-data.mjs", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../public/f1/tracks/3d/silverstone-metadata.json", import.meta.url),
      "utf8",
    ).then(JSON.parse),
  ]);
  const manualStands = metadata.layoutQuality.grandstands.manual.maximumSupportHeightByStandMeters;
  const pitLane = metadata.layoutQuality.pitLane;

  assert.doesNotMatch(exporter, /stand\("The Loop"/);
  assert.doesNotMatch(exporter, /stand\("Vale"/);
  assert.doesNotMatch(exporter, /stand\("Club A"/);
  assert.doesNotMatch(exporter, /stand\("Club B"/);
  assert.doesNotMatch(exporter, /stand\("Hamilton Straight B"/);
  assert.match(exporter, /stand\("Woodcote B"/);
  assert.match(exporter, /stand\("National Pit Straight"/);
  assert.equal("The Loop" in manualStands, false);
  assert.equal("Vale" in manualStands, false);
  assert.equal("Club A" in manualStands, false);
  assert.equal("Club B" in manualStands, false);
  assert.equal("Hamilton Straight B" in manualStands, false);
  assert.equal("Woodcote B" in manualStands, true);
  assert.equal("National Pit Straight" in manualStands, true);
  assert.equal(pitLane.entryApron.surface, "asphalt");
  assert.equal(pitLane.entryApron.coverageMode, "full-road-envelope");
  assert.equal(pitLane.entryApron.grassBreakthroughSamples, 0);
  assert.equal(pitLane.entryApron.coplanarSurfaceSamples, 0);
  assert.ok(pitLane.entryApron.minimumEnvelopeWidthMeters >= 13);
  assert.ok(pitLane.entryApron.surfaceLiftMeters >= 0.05);
  assert.equal(pitLane.entryApron.startMeters, 0);
  assert.ok(pitLane.entryApron.endMeters >= 140);
  assert.equal(pitLane.pitWall.fenceLines, 2);
  assert.equal(pitLane.pitWall.placement, "both sides of the pit-straight separation");
});
