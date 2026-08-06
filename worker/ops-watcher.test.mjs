import assert from "node:assert/strict";
import test from "node:test";

import { getSafeRecoveryProposal } from "./ops-action-policy.mjs";
import { evaluateOpsSnapshot } from "./ops-watcher-rules.mjs";

const now = new Date("2026-08-06T15:00:00.000Z");

test("healthy snapshot does not create findings", () => {
  const findings = evaluateOpsSnapshot({
    heartbeats: ["web", "admin-job-runner", "cron"].map((service_name) => ({
      service_name,
      status: "healthy",
      checked_at: "2026-08-06T14:58:00.000Z",
    })),
    publicHealth: { ok: true, attempts: 1, status: 200 },
    jobs: [],
    newsSources: [],
    socialSources: [],
    notificationFailedCount: 0,
    aiBudget: { monthly_limit_usd: 10 },
    aiMonthlySpend: 2,
  }, now);

  assert.deepEqual(findings, []);
});

test("stale queue and public outage are deterministic findings", () => {
  const findings = evaluateOpsSnapshot({
    heartbeats: ["web", "admin-job-runner", "cron"].map((service_name) => ({
      service_name,
      status: "healthy",
      checked_at: "2026-08-06T14:58:00.000Z",
    })),
    publicHealth: { ok: false, attempts: 2, status: 503 },
    jobs: [{ status: "queued", available_at: "2026-08-06T14:10:00.000Z", started_at: "2026-08-06T14:10:00.000Z" }],
    newsSources: [],
    socialSources: [],
    notificationFailedCount: 0,
  }, now);

  assert.equal(findings[0].severity, "P0");
  assert.deepEqual(findings.map((finding) => finding.ruleKey), ["public-health-unavailable", "job-queue-stalled"]);
});

test("R2 proposal stays disabled during shadow and first seven days", () => {
  const finding = { ruleKey: "job-queue-stalled" };
  assert.equal(getSafeRecoveryProposal(finding, {
    is_enabled: true,
    mode: "shadow",
    r2_actions_enabled: true,
    shadow_started_at: "2026-07-01T00:00:00.000Z",
  }, now), null);
  assert.equal(getSafeRecoveryProposal(finding, {
    is_enabled: true,
    mode: "limited",
    r2_actions_enabled: true,
    shadow_started_at: "2026-08-01T00:00:00.000Z",
  }, now), null);
});
