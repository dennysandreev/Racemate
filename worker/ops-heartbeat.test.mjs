import assert from "node:assert/strict";
import test from "node:test";

import {
  buildServiceHeartbeat,
  normalizeHeartbeatRelease,
  upsertServiceHeartbeat,
} from "./ops-heartbeat.mjs";

test("builds a bounded heartbeat without leaking arbitrary environment data", () => {
  const row = buildServiceHeartbeat({
    checkedAt: "2026-08-06T10:00:00.000Z",
    env: {
      RACESIDE_INSTANCE_ID: "cron-primary",
      RACESIDE_RELEASE_SHA: "ABCDEF123456",
      SUPABASE_SERVICE_ROLE_KEY: "must-not-appear",
    },
    host: "container-1",
    serviceName: "cron",
    summary: { loop: "schedule" },
  });

  assert.deepEqual(row, {
    service_name: "cron",
    instance_id: "cron-primary",
    release_sha: "abcdef123456",
    status: "healthy",
    summary: { loop: "schedule" },
    checked_at: "2026-08-06T10:00:00.000Z",
    updated_at: "2026-08-06T10:00:00.000Z",
  });
  assert.doesNotMatch(JSON.stringify(row), /must-not-appear/);
});

test("rejects unknown services and malformed release identifiers", () => {
  assert.equal(normalizeHeartbeatRelease("release-latest"), null);
  assert.equal(buildServiceHeartbeat({ serviceName: "live" }).service_name, "live");
  assert.throws(
    () => buildServiceHeartbeat({ serviceName: "shell" }),
    /Invalid heartbeat service name/,
  );
});

test("upserts on the stable service and instance identity", async () => {
  let receivedRow;
  let receivedOptions;
  const client = {
    from(table) {
      assert.equal(table, "ops_service_heartbeats");
      return {
        async upsert(row, options) {
          receivedRow = row;
          receivedOptions = options;
          return { error: null };
        },
      };
    },
  };

  await upsertServiceHeartbeat(client, {
    checkedAt: "2026-08-06T10:00:00.000Z",
    env: {},
    host: "worker-1",
    serviceName: "worker",
  });

  assert.equal(receivedRow.instance_id, "worker-1:worker");
  assert.deepEqual(receivedOptions, { onConflict: "service_name,instance_id" });
});
