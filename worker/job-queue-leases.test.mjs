import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260814070252_job_queue_leases.sql", import.meta.url),
  "utf8",
);

test("scheduled jobs recover an expired worker lease before the next enqueue", () => {
  assert.match(migration, /add column if not exists lease_expires_at timestamptz/i);
  assert.match(migration, /status = 'running'/i);
  assert.match(migration, /status = 'failed'/i);
  assert.match(migration, /Worker lease expired before job completion/i);
  assert.match(migration, /create or replace function public\.enqueue_due_admin_schedules/i);
});

test("claimed jobs receive and renew a lease under the same worker id", () => {
  assert.match(migration, /lease_expires_at = now\(\) \+ interval '5 minutes'/i);
  assert.match(migration, /create or replace function public\.renew_admin_job_lease/i);
  assert.match(migration, /p_worker_id text/i);
  assert.match(migration, /worker_id = left\(trim\(p_worker_id\), 120\)/i);
});
