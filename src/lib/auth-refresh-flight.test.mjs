import assert from "node:assert/strict";
import test from "node:test";

import {
  createExpiringSingleFlight,
  shouldPreserveSessionCookies,
} from "./auth-refresh-flight.ts";

test("parallel session refreshes share one request and reuse its result briefly", async () => {
  let now = 1_000;
  let refreshCount = 0;
  const refreshes = createExpiringSingleFlight(5_000, () => now);
  const refresh = () =>
    refreshes.run("same-session", async () => {
      refreshCount += 1;
      await Promise.resolve();
      return { accessToken: `token-${refreshCount}` };
    });

  const parallelResults = await Promise.all(
    Array.from({ length: 50 }, () => refresh()),
  );

  assert.equal(refreshCount, 1);
  assert.equal(new Set(parallelResults.map(({ accessToken }) => accessToken)).size, 1);

  now += 4_999;
  assert.equal((await refresh()).accessToken, "token-1");
  assert.equal(refreshCount, 1);

  now += 2;
  assert.equal((await refresh()).accessToken, "token-2");
  assert.equal(refreshCount, 2);
});

test("transient auth failures do not clear a valid browser session", () => {
  assert.equal(shouldPreserveSessionCookies({ status: 429 }), true);
  assert.equal(shouldPreserveSessionCookies({ status: 503 }), true);
  assert.equal(shouldPreserveSessionCookies({ status: 400 }), false);
  assert.equal(shouldPreserveSessionCookies(new Error("network failure")), false);
});
