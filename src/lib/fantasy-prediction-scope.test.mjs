import assert from "node:assert/strict";
import test from "node:test";

import { resolveFantasyPredictionScope } from "./fantasy-prediction-scope.ts";

test("opens qualification before it starts", () => {
  assert.equal(
    resolveFantasyPredictionScope({ qualificationLocked: false }),
    "qualification",
  );
});

test("opens race after qualification starts", () => {
  assert.equal(
    resolveFantasyPredictionScope({ qualificationLocked: true }),
    "race",
  );
});

test("keeps an explicitly requested prediction screen", () => {
  assert.equal(
    resolveFantasyPredictionScope({
      qualificationLocked: false,
      requestedScope: "race",
    }),
    "race",
  );
  assert.equal(
    resolveFantasyPredictionScope({
      qualificationLocked: true,
      requestedScope: "qualification",
    }),
    "qualification",
  );
});
