import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { makeAdminFindingFingerprint } from "./fingerprint.ts";

test("finding fingerprints are stable across object key order", () => {
  const left = makeAdminFindingFingerprint({
    ruleKey: "jobs.stale",
    subject: { jobName: "rss.fetch_all", minutes: 45 },
  });
  const right = makeAdminFindingFingerprint({
    ruleKey: "JOBS.STALE",
    subject: { minutes: 45, jobName: "rss.fetch_all" },
  });

  assert.equal(left, right);
  assert.match(left, /^[0-9a-f]{64}$/);
});

test("finding writes pass evidence through the shared sanitizer and bounded RPC", () => {
  const source = readFileSync(new URL("./findings.ts", import.meta.url), "utf8");

  assert.match(source, /sanitizeAdminAuditPayload\(input\.evidence \?\? \{\}\)/);
  assert.match(source, /admin\.rpc\("record_admin_finding"/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|process\.env/);
});
