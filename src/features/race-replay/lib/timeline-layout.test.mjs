import assert from "node:assert/strict";
import test from "node:test";

import { layoutTimelineMarkers } from "./timeline-layout.ts";

test("nearby replay events use separate timeline lanes", () => {
  const durationMs = 6_300_000;
  const markers = [
    { label: "Двойной желтый", offsetMs: 1_907_000 },
    { label: "Желтый флаг", offsetMs: 1_908_000 },
    { label: "Пейс-кар", offsetMs: 1_922_000 },
    { label: "VSC", offsetMs: 2_675_000 },
  ];

  const result = layoutTimelineMarkers(markers, durationMs);

  assert.deepEqual(result.slice(0, 3).map(({ lane }) => lane), [0, 1, 2]);
  assert.equal(result[3].lane, 0);
});
