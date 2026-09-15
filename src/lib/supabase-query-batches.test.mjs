import assert from "node:assert/strict";
import test from "node:test";

import {
  SUPABASE_ID_BATCH_SIZE,
  batchSupabaseIds,
} from "./supabase-query-batches.ts";

test("splits season session ids into bounded Supabase queries", () => {
  const sessionIds = Array.from({ length: 53 }, (_, index) => `session-${index + 1}`);
  const batches = batchSupabaseIds(sessionIds);

  assert.deepEqual(batches.map((batch) => batch.length), [20, 20, 13]);
  assert.ok(batches.every((batch) => batch.length <= SUPABASE_ID_BATCH_SIZE));
  assert.deepEqual(batches.flat(), sessionIds);
});

test("deduplicates session ids before batching", () => {
  assert.deepEqual(batchSupabaseIds(["race", "qualifying", "race"], 2), [
    ["race", "qualifying"],
  ]);
});

test("rejects an invalid batch size", () => {
  assert.throws(() => batchSupabaseIds(["race"], 0), RangeError);
});
