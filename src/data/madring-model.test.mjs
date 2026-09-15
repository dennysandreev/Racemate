import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MADRING_MODEL, MADRING_TRACK_MODEL } from "./madring-model.ts";
import { getThreeDimensionalTrackModelId } from "./track-models.ts";
import { validateTrackAsset } from "../../scripts/track-model-blender/validate-track.mjs";
import { auditMadringSurfaces } from "../../scripts/track-model-blender/audit-madring-surfaces.mjs";

const asset = (suffix) => new URL(`../../public/f1/tracks/3d/madring${suffix}`, import.meta.url).pathname;
const metadata = JSON.parse(await readFile(asset("-metadata.json"), "utf8"));

test("Madrid resolves to its own circuit while historical Barcelona stays distinct", () => {
  for (const value of ["Madring", "Madring · Madrid, Spain", "Мадринг", "Мадрид", "Spanish Grand Prix", "Гран-при Испании"]) assert.equal(getThreeDimensionalTrackModelId(value), "madring");
  for (const value of ["Circuit de Barcelona-Catalunya", "Spanish Grand Prix — Barcelona", "Гран-при Испании · Барселона"]) assert.equal(getThreeDimensionalTrackModelId(value), "catalunya");
});

test("Madring keeps measured geometry, clockwise numbering and real banking units", () => {
  const first = MADRING_MODEL.points[0], last = MADRING_MODEL.points.at(-1);
  assert.deepEqual(first.slice(1), last.slice(1));
  assert.equal(last[0], 1);
  assert.equal(MADRING_MODEL.lapLengthKm, 5.416);
  assert.equal(MADRING_TRACK_MODEL.camera.verticalExaggeration, 1);
  assert.deepEqual(MADRING_MODEL.turns.map((t) => t.number), Array.from({ length: 22 }, (_, i) => i+1));
  assert.ok(MADRING_MODEL.points[1][1] < first[1], "main straight runs west from the survey origin");
  assert.ok(metadata.geometry.lengthErrorPercent < 0.01);
  assert.ok(Math.abs(metadata.geometry.bankingAngleDegrees - 13.4957) < 0.001);
  assert.equal(metadata.geometry.bankingPercent, 24);
  assert.ok(MADRING_MODEL.points.every((p) => p.every(Number.isFinite)));
  assert.ok(metadata.elevationsMeters.low > 670 && metadata.elevationsMeters.high < 699);
  assert.ok(MADRING_MODEL.maxUphillPercent < 10 && MADRING_MODEL.maxDownhillPercent < 10, "M-11 decks must not become false road elevation spikes");
});

test("Madring source dates and event uncertainties survive publication", () => {
  const ortho = metadata.sourceManifest.sources.find((s) => s.file === "madrid-orthophoto-2026.png");
  assert.equal(ortho.date, "2026-06-13", "service name 2026_07 is not the acquisition date");
  assert.match(metadata.verticalDatum, /no vertical CRS/);
  assert.match(metadata.officialControlPoints.authority, /map-derived/);
  assert.ok(metadata.limitations.some((text) => text.includes("motorhomes")));
  assert.equal(metadata.pitBuilding.teamGarages, 11);
  assert.equal(metadata.pitBuilding.fiaGarages, 3);
  assert.equal(metadata.buildings.sourceToRenderCentroidDriftMeters, 0);
  assert.ok(metadata.buildings.excluded.every((b) => b.id && b.reason));
});

test("Madring static GLB passes publication, anchors and geometry audits", async () => {
  const metrics = await validateTrackAsset({ modelId: "madring", glbPath: asset(".glb"), previewPath: asset("-preview.webp"), metadataPath: asset("-metadata.json") });
  assert.ok(metrics.anchorNames.includes("Turn_05A"));
  assert.ok(metrics.anchorNames.includes("Turn_20A"));
  assert.ok(metrics.meshNames.some((n) => n.includes("Municipal_LoD2")));
  assert.ok(metrics.meshNames.some((n) => n.includes("Physical_Pit_Wall")));
  assert.ok(metrics.meshNames.every((n) => !/Dutch|Zandvoort|AHN4/.test(n)));
});

test("Madring stays behind the existing lazy loader", async () => {
  const loader = await readFile(new URL("../components/racemate/track-model-3d-lazy.tsx", import.meta.url), "utf8");
  const registry = await readFile(new URL("./track-models.ts", import.meta.url), "utf8");
  assert.match(loader, /import\("@\/data\/madring-model"\)/);
  assert.doesNotMatch(registry, /from ["'].*madring-model/);
});

test("delivered Madring paint retains its width and clears both roads after Meshopt decoding", async () => {
  const audit = await auditMadringSurfaces(await readFile(asset(".glb")));
  for (const name of ["edgeLines", "pitMarkings"]) {
    assert.ok(audit[name].triangles > 2000);
    assert.equal(audit[name].degenerateTriangles, 0, `${name}: narrow paint collapsed during compression`);
    assert.equal(audit[name].missingSupport, 0, `${name}: paint left the asphalt footprint`);
    assert.equal(audit[name].intersections, 0, `${name}: paint intersects the racing or pit surface`);
    assert.ok(audit[name].minimumClearanceMeters > .005);
  }
  assert.ok(audit.runoff.samples > 10000);
  assert.equal(audit.runoff.intersections, 0, "runoff must follow actual terrain faces, including at tunnel portals");
  assert.ok(audit.runoff.minimumClearanceMeters > .005);
});

test("Madring URL invalidates cached geometry while preview follows the local image policy", async () => {
  const expected = createHash("sha256").update(await readFile(asset(".glb"))).digest("hex").slice(0, 12);
  assert.equal(new URL(MADRING_TRACK_MODEL.webgl.assetPath, "https://raceside.test").searchParams.get("v"), expected);
  assert.equal(MADRING_TRACK_MODEL.webgl.previewPath, "/f1/tracks/3d/madring-preview.webp");
});
