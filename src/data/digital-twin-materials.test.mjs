import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const DIGITAL_TWIN_IDS = [
  "catalunya",
  "zandvoort",
  "spa",
  "hungaroring",
  "red-bull-ring",
  "silverstone",
  "monza",
];

for (const id of DIGITAL_TWIN_IDS) {
  test(`${id} solid structures use opaque materials`, async () => {
    const glb = await readFile(
      new URL(`../../public/f1/tracks/3d/${id}.glb`, import.meta.url),
    );
    const jsonLength = glb.readUInt32LE(12);
    const gltf = JSON.parse(glb.subarray(20, 20 + jsonLength).toString("utf8"));
    const solidMaterials = gltf.materials.filter(({ name }) =>
      /Buildings|Grandstands|Motorhomes/.test(name),
    );
    const motorhomeMaterial = solidMaterials.find(({ name }) => /Motorhomes/.test(name));

    assert.ok(motorhomeMaterial, `${id} must contain a motorhome material`);
    assert.ok(solidMaterials.length >= 2, `${id} must expose solid scene materials`);
    for (const material of solidMaterials) {
      assert.notEqual(
        material.alphaMode,
        "BLEND",
        `${material.name} must not participate in transparent sorting`,
      );
    }
  });
}
