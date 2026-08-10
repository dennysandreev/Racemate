import assert from "node:assert/strict";
import test from "node:test";

import { mergeCityJsonFeatureCollectionPages } from "./download-zandvoort-data.mjs";

test("normalizes every 3DBAG page into one shared millimetre transform", () => {
  const makePage = (translate, id) => ({
    type: "FeatureCollection",
    metadata: {
      transform: {
        scale: [0.001, 0.001, 0.001],
        translate,
      },
    },
    features: [{
      type: "CityJSONFeature",
      id,
      vertices: [[1000, 2000, 3000]],
      CityObjects: {},
    }],
    links: [],
  });

  const result = mergeCityJsonFeatureCollectionPages([
    makePage([96_950, 488_550, 0], "first"),
    makePage([98_000, 489_000, 10], "second"),
  ]);

  assert.deepEqual(result.metadata.transform, {
    scale: [0.001, 0.001, 0.001],
    translate: [96_950, 488_550, 0],
  });
  assert.deepEqual(result.features[0].vertices, [[1000, 2000, 3000]]);
  assert.deepEqual(result.features[1].vertices, [[1_051_000, 452_000, 13_000]]);
});
