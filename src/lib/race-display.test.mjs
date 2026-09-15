import assert from "node:assert/strict";
import test from "node:test";

import {
  formatGrandPrixNameRu,
  formatGrandPrixTagNameRu,
  getCanonicalGrandPrixName,
} from "./race-display.ts";

test("formats comparison Grand Prix names in Russian", () => {
  assert.equal(formatGrandPrixNameRu("Japanese Grand Prix"), "Гран-при Японии");
  assert.equal(formatGrandPrixNameRu("British Grand Prix"), "Гран-при Великобритании");
  assert.equal(formatGrandPrixNameRu("Monaco Grand Prix"), "Гран-при Монако");
  assert.equal(formatGrandPrixNameRu("Bahrain Grand Prix in Malaysia"), "Гран-при Малайзии");
  assert.equal(formatGrandPrixNameRu("Malaysian Grand Prix"), "Гран-при Малайзии");
  assert.equal(formatGrandPrixNameRu("Sao Paulo Grand Prix"), "Гран-при Сан-Паулу");
  assert.equal(formatGrandPrixNameRu("Madrid Grand Prix"), "Гран-при Мадрида");
});

test("keeps Russian names and tolerates source formatting differences", () => {
  assert.equal(formatGrandPrixNameRu("Гран-при Нидерландов"), "Гран-при Нидерландов");
  assert.equal(formatGrandPrixNameRu("  british   grand prix  "), "Гран-при Великобритании");
});

test("keeps an unknown race name unchanged", () => {
  assert.equal(formatGrandPrixNameRu("Custom Grand Prix"), "Custom Grand Prix");
});

test("formats Grand Prix tags without changing their suffix", () => {
  assert.equal(formatGrandPrixTagNameRu("Dutch Grand Prix"), "Гран-при Нидерландов");
  assert.equal(formatGrandPrixTagNameRu("Dutch Grand Prix, 2026"), "Гран-при Нидерландов, 2026");
  assert.equal(formatGrandPrixTagNameRu("F1"), "F1");
});

test("normalizes the temporary Sepang event name", () => {
  assert.equal(
    getCanonicalGrandPrixName("Bahrain Grand Prix in Malaysia"),
    "Malaysian Grand Prix",
  );
});
