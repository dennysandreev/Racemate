import assert from "node:assert/strict";
import test from "node:test";

import { formatGrandPrixNameRu } from "./race-display.ts";

test("formats comparison Grand Prix names in Russian", () => {
  assert.equal(formatGrandPrixNameRu("Japanese Grand Prix"), "Гран-при Японии");
  assert.equal(formatGrandPrixNameRu("British Grand Prix"), "Гран-при Великобритании");
  assert.equal(formatGrandPrixNameRu("Monaco Grand Prix"), "Гран-при Монако");
});

test("keeps an unknown race name unchanged", () => {
  assert.equal(formatGrandPrixNameRu("Custom Grand Prix"), "Custom Grand Prix");
});
