import assert from "node:assert/strict";
import test from "node:test";

import { formatRaceStatus } from "./race-status.ts";

test("formats completed races before other states", () => {
  assert.equal(formatRaceStatus("completed", true), "Завершен");
  assert.equal(formatRaceStatus("scheduled", true, true), "Завершен");
});

test("marks only the active or next race as current", () => {
  assert.equal(formatRaceStatus("scheduled", true), "Текущий этап");
  assert.equal(formatRaceStatus("scheduled", false), "Ожидается");
});
