import assert from "node:assert/strict";
import test from "node:test";

import { buildSubscriptionAccess } from "./access-policy.ts";

const now = "2026-09-15T12:00:00.000Z";
const planEntitlements = [
  "live",
  "telemetry_full",
  "telegram_notifications",
  "ads_disabled",
];

function access(overrides = {}) {
  return buildSubscriptionAccess({
    enforced: true,
    now,
    periods: [],
    planEntitlements,
    subscription: null,
    userId: "00000000-0000-4000-8000-000000000001",
    ...overrides,
  });
}

test("guest cannot use the telemetry demo when enforcement is enabled", () => {
  const result = access({ userId: null });
  assert.equal(result.status, "guest");
  assert.equal(result.entitlements.telemetry_demo, false);
  assert.equal(result.entitlements.live, false);
});

test("signed-in free account receives only telemetry demo", () => {
  const result = access();
  assert.equal(result.status, "expired");
  assert.equal(result.entitlements.telemetry_demo, true);
  assert.equal(result.entitlements.telemetry_full, false);
});

test("active period grants the plan entitlements", () => {
  const result = access({
    periods: [{ starts_at: "2026-09-01T00:00:00.000Z", ends_at: "2026-10-01T00:00:00.000Z", status: "active" }],
    subscription: { current_period_start: "2026-09-01T00:00:00.000Z", current_period_end: "2026-10-01T00:00:00.000Z", status: "active" },
  });
  assert.equal(result.status, "active");
  assert.equal(result.entitlements.live, true);
  assert.equal(result.entitlements.ads_disabled, true);
});

test("period start is inclusive and end is exclusive", () => {
  const period = { starts_at: now, ends_at: "2026-10-15T12:00:00.000Z", status: "active" };
  assert.equal(access({ periods: [period], subscription: { current_period_start: period.starts_at, current_period_end: period.ends_at, status: "active" } }).active, true);
  const ended = { starts_at: "2026-08-15T12:00:00.000Z", ends_at: now, status: "active" };
  assert.equal(access({ periods: [ended], subscription: { current_period_start: ended.starts_at, current_period_end: ended.ends_at, status: "active" } }).active, false);
});

test("revoked subscription never grants paid access", () => {
  const result = access({
    periods: [{ starts_at: "2026-09-01T00:00:00.000Z", ends_at: "2026-10-01T00:00:00.000Z", status: "revoked" }],
    subscription: { current_period_start: "2026-09-01T00:00:00.000Z", current_period_end: "2026-10-01T00:00:00.000Z", status: "revoked" },
  });
  assert.equal(result.status, "revoked");
  assert.equal(result.entitlements.live, false);
});
