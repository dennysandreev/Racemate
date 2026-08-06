import assert from "node:assert/strict";
import test from "node:test";

import { shouldPersistQuietJobResult } from "./job-run-policy.mjs";

test("suppresses empty cached and heartbeat runs", () => {
  assert.equal(shouldPersistQuietJobResult({ itemsProcessed: 0, metadata: { cached: true } }), false);
  assert.equal(shouldPersistQuietJobResult({ itemsProcessed: 0, metadata: { selected: 0 } }), false);
});

test("keeps work and meaningful probes in the job history", () => {
  assert.equal(shouldPersistQuietJobResult({ itemsProcessed: 3 }), true);
  assert.equal(shouldPersistQuietJobResult({ itemsProcessed: 0, metadata: { sessionsChecked: 1 } }), true);
  assert.equal(shouldPersistQuietJobResult({ itemsProcessed: 0, metadata: { failures: [{ reason: "timeout" }] } }), true);
});
