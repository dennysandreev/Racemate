import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BAKU_MODEL, BAKU_TRACK_MODEL } from "./baku-model.ts";
import { getThreeDimensionalTrackModelId } from "./track-models.ts";
import { validateTrackAsset } from "../../scripts/track-model-blender/validate-track.mjs";

test("Baku uses its measured closed axis and twenty ordered FIA corners", () => {
  assert.equal(getThreeDimensionalTrackModelId("Baku City Circuit"), "baku");
  assert.equal(getThreeDimensionalTrackModelId("Гран-при Азербайджана"), "baku");
  assert.equal(BAKU_MODEL.lapLengthKm, 6.003);
  const points = BAKU_MODEL.points;
  assert.equal(points[0][0], 0);
  assert.equal(points.at(-1)[0], 1);
  assert.deepEqual(points.at(-1).slice(1), points[0].slice(1));
  let distance = 0;
  for (let i = 1; i < points.length; i++) {
    assert.ok(points[i][0] > points[i - 1][0]);
    assert.ok(points[i].every(Number.isFinite));
    distance += Math.hypot(points[i][1] - points[i - 1][1], points[i][2] - points[i - 1][2]);
  }
  assert.ok(Math.abs(distance - 6003) / 6003 < .005);
  assert.deepEqual(BAKU_MODEL.turns.map((t) => t.number), Array.from({ length: 20 }, (_, i) => i + 1));
  assert.ok(BAKU_MODEL.turns.every((t, i, turns) => t.progress > (turns[i - 1]?.progress ?? 0)));
  assert.equal(BAKU_TRACK_MODEL.camera.verticalExaggeration, 1);
  assert.equal(BAKU_TRACK_MODEL.webgl.elevationApproximate, true);
});

test("Baku GLB contains its licensed texture, coloured city and separate start/control lines", async () => {
  const folder = new URL("../../public/f1/tracks/3d/", import.meta.url).pathname;
  const metrics = await validateTrackAsset({ modelId: "baku", glbPath: folder + "baku.glb", metadataPath: folder + "baku-metadata.json", previewPath: folder + "baku-preview.webp" });
  assert.ok(metrics.triangles > 100000);
  const buffer = await readFile(folder + "baku.glb");
  const gltf = JSON.parse(buffer.toString("utf8", 20, 20 + buffer.readUInt32LE(12)).trim());
  assert.ok(gltf.images.some((image) => Number.isInteger(image.bufferView)));
  const city = gltf.meshes.find((mesh) => mesh.name === "Baku_OSM_Permanent_Buildings_Mesh");
  assert.ok(city.primitives.some((primitive) => primitive.attributes.COLOR_0 !== undefined));
  assert.ok(city.primitives.some((primitive) => primitive.attributes.TEXCOORD_0 !== undefined));
  assert.ok(gltf.meshes.some((mesh) => mesh.name === "Baku_Actual_Landmark_Facades_Mesh"));
  assert.ok(gltf.images.length >= 2);
  const metadata = JSON.parse(await readFile(folder + "baku-metadata.json", "utf8"));
  assert.ok(metadata.buildingTextures.facadeDetails.windows >= 4000);
  assert.ok(metadata.buildingTextures.facadeDetails.buildings >= 30);
  assert.ok(metadata.buildingTextures.facadeDetails.cornices > 0);
  assert.ok(!gltf.meshes.some((mesh) => /DutchGP|Hungaroring|Monaco|Madring/.test(mesh.name)));
});

test("Baku loads lazily and preview matches the site's local image policy", async () => {
  const loader = await readFile(new URL("../components/racemate/track-model-3d-lazy.tsx", import.meta.url), "utf8");
  assert.match(loader, /import\("@\/data\/baku-model"\)/);
  assert.equal(BAKU_TRACK_MODEL.webgl.previewPath, "/f1/tracks/3d/baku-preview.webp");
});
