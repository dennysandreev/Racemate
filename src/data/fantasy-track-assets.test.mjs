import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const projectRoot = process.cwd();
const sourceList = JSON.parse(
  await readFile(path.join(projectRoot, "scripts/fantasy-track-photo-sources.json"), "utf8"),
);
const assetManifest = JSON.parse(
  await readFile(path.join(projectRoot, "public/f1/tracks/fantasy/2026/manifest.json"), "utf8"),
);

const budgets = {
  hero: 220_000,
  card: 100_000,
  thumb: 45_000,
};

test("fantasy track photo list covers the full 2026 season", () => {
  assert.equal(sourceList.sources.length, 23);
  assert.deepEqual(
    sourceList.sources.map((source) => source.round),
    Array.from({ length: 23 }, (_, index) => index + 1),
  );
  assert.equal(new Set(sourceList.sources.map((source) => source.layoutSlug)).size, 23);
});

test("fantasy visuals use licensed photographs instead of generated or map assets", () => {
  assert.equal(assetManifest.complete, true);
  assert.equal(assetManifest.sources.length, 23);
  assert.equal(
    assetManifest.sources.filter((source) => source.sourceKind === "real-track-photo").length,
    22,
  );
  assert.deepEqual(
    assetManifest.sources
      .filter((source) => source.sourceKind === "real-venue-context")
      .map((source) => source.circuitId),
    ["madring"],
  );

  for (const source of assetManifest.sources) {
    assert.match(source.commonsTitle, /^File:/);
    assert.match(source.sourcePageUrl, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    assert.ok(source.author);
    assert.match(source.license, /^(CC0|CC BY|CC BY-SA)/);
    assert.ok(source.licenseUrl);
    assert.doesNotMatch(source.sourceKind, /satellite|map|3d|generated|render/i);
  }
});

test("all responsive variants exist and stay inside the delivery budgets", async () => {
  let totalBytes = 0;

  for (const source of assetManifest.sources) {
    for (const [variantName, hardMax] of Object.entries(budgets)) {
      const variant = source.variants[variantName];
      assert.ok(variant, `round ${source.round} is missing ${variantName}`);
      assert.match(variant.file, /^\/f1\/tracks\/fantasy\/2026\//);
      const file = await stat(path.join(projectRoot, "public", variant.file));
      assert.equal(file.size, variant.bytes);
      assert.ok(file.size <= hardMax, `${variant.file} exceeds ${hardMax} bytes`);
      totalBytes += file.size;
    }
  }

  assert.ok(totalBytes <= 8_400_000, `fantasy track visuals total ${totalBytes} bytes`);
});
