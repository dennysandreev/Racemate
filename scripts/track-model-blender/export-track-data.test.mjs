import assert from "node:assert/strict";
import test from "node:test";

import { RACE_MOTORHOMES } from "./export-track-data.mjs";

const SURVEYED_PADDOCK_CENTERS = [
  [888, 748],
  [884, 758],
  [882, 768],
  [876, 778],
  [870, 798],
  [870, 817],
  [868, 824],
  [864, 831],
  [861, 838],
  [859, 845],
  [857, 852],
];

test("Zandvoort motorhomes use the surveyed centers of the visible paddock units", () => {
  assert.deepEqual(
    RACE_MOTORHOMES.map(({ sourcePixel }) => [sourcePixel.x, sourcePixel.y]),
    SURVEYED_PADDOCK_CENTERS,
  );
});

test("Zandvoort motorhomes keep unique georeferenced footprints", () => {
  const sourceCenters = new Set(
    RACE_MOTORHOMES.map(({ sourcePixel }) => `${sourcePixel.x}:${sourcePixel.y}`),
  );
  const rdCenters = new Set(
    RACE_MOTORHOMES.map(({ centerRd }) => `${centerRd.x}:${centerRd.y}`),
  );

  assert.equal(RACE_MOTORHOMES.length, SURVEYED_PADDOCK_CENTERS.length);
  assert.equal(sourceCenters.size, RACE_MOTORHOMES.length);
  assert.equal(rdCenters.size, RACE_MOTORHOMES.length);
});
