import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MIAMI_TRACK_MODEL as model } from "./miami-model.ts";
import { getThreeDimensionalTrackModelId } from "./track-models.ts";
import { validateTrackAsset } from "../../scripts/track-model-blender/validate-track.mjs";

const root = new URL("../../", import.meta.url);
const metadata = JSON.parse(await readFile(new URL("public/f1/tracks/3d/miami-metadata.json",root),"utf8"));

test("Miami compressed delivery has clear driving corridors, supported paint and all anchors", async () => {
  const metrics=await validateTrackAsset({ modelId:"miami", glbPath:new URL("public/f1/tracks/3d/miami.glb",root),
    metadataPath:new URL("public/f1/tracks/3d/miami-metadata.json",root), previewPath:new URL("public/f1/tracks/3d/miami-preview.webp",root) });
  assert.deepEqual(metrics.decodedSurfaceAudit.structuralConflicts,{});
  assert.equal(metrics.decodedSurfaceAudit.bridgeConflicts,0);
  assert.ok(metrics.decodedSurfaceAudit.minimumBridgeClearanceMeters>=4.5);
  assert.ok(metrics.decodedSurfaceAudit.road.maximumGradePercent<12,"Adjacent flyover embankments must not lift the GP road");
});

test("Miami URLs invalidate both model and fallback caches after a geometry correction", async () => {
  for(const [field,file] of [["assetPath","miami.glb"],["previewPath","miami-preview.webp"]]) {
    const data=await readFile(new URL(`public/f1/tracks/3d/${file}`,root));
    assert.equal(new URL(model.webgl[field],"https://raceside.test").searchParams.get("v"),createHash("sha256").update(data).digest("hex").slice(0,12));
  }
  assert.match(await readFile(new URL("next.config.ts",root),"utf8"),/pathname: "\/f1\/tracks\/3d\/miami-preview\.webp"/);
});

test("Miami ordered turns and timing lines follow the current FIA spatial notes", () => {
  const {points,turns,sectorBreaks,speedTrapProgress}=model.data;
  assert.equal(points[0][0],0);assert.deepEqual(points.at(-1),[1,...points[0].slice(1)]);
  assert.ok(points.every((point)=>point.every(Number.isFinite)));
  assert.deepEqual(turns.map((turn)=>turn.number),Array.from({length:19},(_,i)=>i+1));
  assert.ok(turns.every((turn,i)=>turn.progress>(turns[i-1]?.progress??0)&&turn.progress<1));
  const lap=metadata.lapLength.geometryMeters;
  assert.ok(Math.abs((sectorBreaks[0]-turns[7].progress)*lap-110)<.01);
  assert.ok(Math.abs((sectorBreaks[1]-turns[15].progress)*lap-70)<.01);
  assert.ok(Math.abs((turns[16].progress-speedTrapProgress)*lap-150)<.01);
  assert.deepEqual(metadata.controlPointReference.drs,[]);
  assert.ok(metadata.raceStartDistanceMeters>100);
  assert.equal(model.data.lapLengthKm,5.412);
  assert.equal(model.camera.verticalExaggeration,1);
});

test("Miami provenance distinguishes source resolution, inferred structures and timing disagreement", () => {
  assert.equal(metadata.controlPointReference.referenceYear,2026);
  assert.equal(metadata.sourceManifest.sources.length,8);
  for(const source of metadata.sourceManifest.sources) {
    for(const field of ["url","license","attribution","retrievedAt","resolution"]) assert.ok(source[field]);
    assert.match(source.sha256,/^[0-9a-f]{64}$/);assert.ok(source.bytes>0);
  }
  assert.match(metadata.verticalDatum,/NAVD88/);
  assert.ok(metadata.layoutQuality.terrainSurface.resolutionMeters<.6);
  assert.match(metadata.limitations.join(" "),/sector lengths disagree/);
  assert.match(metadata.limitations.join(" "),/bridge deck elevations.*estimates/);
  assert.equal(metadata.layoutQuality.flyovers.maximumPanelJoinGapMeters,0);
});

test("Miami remains lazy and cannot be overwritten by the legacy schematic generator", async () => {
  for(const name of ["Майами","Miami International Autodrome","Гран-при Майами"]) assert.equal(getThreeDimensionalTrackModelId(name),"miami");
  assert.match(await readFile(new URL("src/components/racemate/track-model-3d-lazy.tsx",root),"utf8"),/import\("@\/data\/miami-model"\)/);
  assert.doesNotMatch(await readFile(new URL("src/data/track-models.ts",root),"utf8"),/import.*miami-model/);
  assert.match(await readFile(new URL("scripts/generate-past-track-models.mjs",root),"utf8"),/if \(track.id === "miami"\) continue/);
});
