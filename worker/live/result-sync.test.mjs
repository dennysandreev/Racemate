import assert from "node:assert/strict";
import test from "node:test";
import { queueSessionResultSync } from "./result-sync.mjs";

test("queues OpenF1 retries and delayed Jolpica fallbacks after a live finish", async () => {
  const inserted = [];
  const db = {
    from(table) {
      assert.equal(table, "job_runs");
      return {
        select() {
          return this;
        },
        in: async () => ({ data: [], error: null }),
        insert: async (rows) => {
          inserted.push(...rows);
          return { error: null };
        },
      };
    },
  };
  const now = Date.parse("2026-09-12T11:46:43Z");
  assert.equal(
    await queueSessionResultSync(db, { session_key: 11364 }, now),
    10,
  );
  assert.deepEqual(
    inserted.map((row) => row.available_at),
    [
      "2026-09-12T11:46:43.000Z",
      "2026-09-12T11:47:13.000Z",
      "2026-09-12T11:48:43.000Z",
      "2026-09-12T11:51:43.000Z",
      "2026-09-12T12:01:43.000Z",
      "2026-09-12T12:16:43.000Z",
      "2026-09-12T12:46:43.000Z",
      "2026-09-12T12:16:43.000Z",
      "2026-09-12T12:26:43.000Z",
      "2026-09-12T12:46:43.000Z",
    ],
  );
  assert.deepEqual(
    inserted.slice(-3).map((row) => row.job_name),
    ["jolpica.sync_results", "jolpica.sync_results", "jolpica.sync_results"],
  );
  assert.ok(inserted.every((row) => row.metadata.sessionKey === 11364));
});

test("does not enqueue duplicate checks already recorded for the session", async () => {
  let inserted = false;
  const db = {
    from() {
      return {
        select() {
          return this;
        },
        in: async (_field, keys) => ({
          data: keys.map((request_key) => ({ request_key })),
          error: null,
        }),
        insert: async () => {
          inserted = true;
          return { error: null };
        },
      };
    },
  };
  assert.equal(await queueSessionResultSync(db, { session_key: 11364 }), 0);
  assert.equal(inserted, false);
});

test("main race finish queues durable replay recovery without duplicating jobs", async () => {
  const rows = [];
  const db = {from: () => ({
    select() { return this; },
    in: async () => ({data: rows, error: null}),
    insert: async (jobs) => { rows.push(...jobs); return {error: null}; },
  })};
  const now = Date.parse("2026-09-13T15:00:00Z");
  const session = {session_key: 11369, session_name: "Race"};
  assert.equal(await queueSessionResultSync(db, session, now), 13);
  const replays = rows.filter((job) => job.job_name === "race_replay.prepare_completed");
  assert.deepEqual(replays.map((job) => Date.parse(job.available_at) - now), [120_000, 900_000, 3_600_000]);
  assert.ok(replays.every((job) => job.max_attempts === 3));
  assert.equal(await queueSessionResultSync(db, session, now), 0);
});
