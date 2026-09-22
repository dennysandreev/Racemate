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
    219, 604, 759, 897, 1_124, 1_255, 1_345, 1_438, 1_750, 2_090,
    2_132, 2_374, 2_537, 2_573, 2_698, 2_726, 2_788, 2_921, 3_015,
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
  assert.equal(metadata.objects.startGantries, 1);
  assert.equal(metadata.objects.mappedGrandstands, 11);
  assert.ok(metadata.objects.buildingsTotal >= 1000);
  assert.ok(metadata.objects.fenceSegments >= 250);
  assert.equal(metadata.objects.raceMotorhomes, 0);
  assert.equal(metadata.layoutQuality.pitLane.fastLaneSeparator, true);
  assert.equal(metadata.layoutQuality.pitLane.pitComplex.garageBoxes, 11);
  assert.equal(metadata.layoutQuality.tunnel.roofed, true);
  assert.ok(Math.abs(metadata.layoutQuality.tunnel.lengthMeters - 361.75) < 0.01);
  assert.equal(metadata.layoutQuality.surfaceClearance.terrainBreakthroughSamples, 0);
  assert.equal(metadata.layoutQuality.surfaceClearance.tunnelExcludedFromTerrainClearance, true);
  assert.ok(metadata.layoutQuality.surfaceClearance.tunnelUndergroundSamples > 0);
  assert.ok(metadata.layoutQuality.surfaceSmoothing.wholeLap.maximumCorrectionMeters <= 4);
  assert.equal(metadata.realWorldScale, "1 unit = 1 metre; no vertical exaggeration");
  assert.equal(metadata.coordinateReferenceSystem, "EPSG:32632");
  assert.match(metadata.layoutQuality.terrainSurface.orthophoto.projection, /inverse UTM32N to Web Mercator/);
  assert.equal(metadata.layoutQuality.terrainSurface.rasters.dtm.verticalDatum, "IGN69 (EPSG:5720)");
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
  assert.match(MONACO_TRACK_MODEL.webgl.assetPath, /^\/f1\/tracks\/3d\/monaco\.glb\?v=[a-f0-9]{12}$/);
  assert.match(MONACO_TRACK_MODEL.webgl.previewPath, /^\/f1\/tracks\/3d\/monaco-preview\.webp\?v=[a-f0-9]{12}$/);
});

test("Monaco retains measured landmark roofs and records unresolved event detail", async () => {
  const metadata = JSON.parse(await readFile(new URL("../../public/f1/tracks/3d/monaco-metadata.json", import.meta.url), "utf8"));
  const buildings = metadata.layoutQuality.buildings;
  assert.equal(metadata.verticalDatum, "IGN69 (EPSG:5720)");
  assert.ok(buildings.measuredRoofCount >= 990);
  for (const id of ["relation/2093796", "relation/8280869", "relation/8269572"]) {
    assert.ok(buildings.rendered.some((building) => building.id === id), `missing landmark ${id}`);
  }
  assert.ok(buildings.excluded.every(({ id, reason }) => id && reason));
  assert.equal(metadata.layoutQuality.pitLane.pitComplex.coveredGrandstand, false);
  assert.equal(metadata.layoutQuality.paddock.individualMotorhomesVerified, false);
  assert.equal(MONACO_REPLAY_PATH.baseElevationMeters, 0);
  assert.equal(MONACO_REPLAY_PATH.surfaceOffsetMeters, 0.18);
});

test("Monaco compressed delivery keeps road, paint and structures clear", async () => {
  const { auditMonacoSurfaces } = await import("../../scripts/track-model-blender/audit-monaco-surfaces.mjs");
  const [buffer, metadata] = await Promise.all([
    readFile(new URL("../../public/f1/tracks/3d/monaco.glb", import.meta.url)),
    readFile(new URL("../../public/f1/tracks/3d/monaco-metadata.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  const audit = await auditMonacoSurfaces(buffer, metadata);
  for (const layer of ["road", "paint"]) {
    assert.ok(audit[layer].triangles > 3000);
    assert.equal(audit[layer].intersections, 0);
    assert.equal(audit[layer].missingSupport, 0);
  }
  assert.ok(audit.road.undergroundSamples > 1000);
  assert.deepEqual(audit.structuralConflicts, {});
});

test("Monaco exit, facade UVs, apex labels and tunnel portals survive GLB compression", async () => {
  const { auditMonacoSurfaces } = await import("../../scripts/track-model-blender/audit-monaco-surfaces.mjs");
  const metadata = JSON.parse(await readFile(new URL("../../public/f1/tracks/3d/monaco-metadata.json", import.meta.url), "utf8"));
  const audit = await auditMonacoSurfaces(await readFile(new URL("../../public/f1/tracks/3d/monaco.glb", import.meta.url)), metadata);
  assert.ok(audit.pitOverlapAreaSquareMeters < .1, `overlapping asphalt: ${audit.pitOverlapAreaSquareMeters} m²`);
  assert.equal(audit.facades.primitives, 4);
  assert.equal(audit.facades.missingTextures, 0);
  assert.equal(audit.facades.texturedTriangles, metadata.layoutQuality.buildings.facades.texturedWallTriangles);
  assert.equal(metadata.layoutQuality.buildings.facades.texturedFootprints, metadata.objects.buildingsTotal);
  assert.equal(audit.turnAnchors.length, 19);
  assert.ok(audit.turnAnchors.every(anchor => anchor.onRoad));
  assert.ok(audit.turnAnchors.filter(anchor => anchor.name !== "Turn_09").every(anchor => anchor.heightAboveRoad > .8 && anchor.heightAboveRoad < 1.4));
  assert.equal(metadata.layoutQuality.tunnel.portals.length, 4);
  assert.ok(metadata.layoutQuality.tunnel.portals.every(portal => portal.position?.length === 3));
  assert.deepEqual(audit.portalObstructions, []);
});

test("Monaco replay exit stays beside the start straight until Sainte Devote", () => {
  let inspected = 0;
  for (const point of MONACO_REPLAY_PATH.pitLanePoints) {
    let nearest = { separation: Infinity, progress: 0 };
    for (let i = 1; i < MONACO_MODEL.points.length; i++) {
      const a = MONACO_MODEL.points[i - 1], b = MONACO_MODEL.points[i];
      const dx = b[1] - a[1], dy = b[2] - a[2], lengthSquared = dx * dx + dy * dy;
      const t = Math.max(0, Math.min(1, ((point[1] - a[1]) * dx + (point[2] - a[2]) * dy) / lengthSquared));
      const separation = Math.hypot(point[1] - a[1] - t * dx, point[2] - a[2] - t * dy);
      if (separation < nearest.separation) nearest = {separation, progress:a[0]+t*(b[0]-a[0])};
    }
    if (nearest.progress > .003 && nearest.progress < .042) {
      inspected++;
      assert.ok(nearest.separation > 6.8 && nearest.separation < 9, `exit separation ${nearest.separation}`);
    }
  }
  assert.ok(inspected >= 15);
});
