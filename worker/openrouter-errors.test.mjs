import assert from "node:assert/strict";
import test from "node:test";

import {
  OpenRouterBatchBlockedError,
  getOpenRouterBatchBlock,
  isOpenRouterBatchBlockedError,
} from "./openrouter-errors.mjs";

test("recognizes an exhausted OpenRouter key limit as a batch blocker", () => {
  assert.deepEqual(
    getOpenRouterBatchBlock(403, {
      error: { message: "Key limit exceeded (total limit). Manage it in settings." },
    }),
    {
      code: "openrouter_key_limit_exceeded",
      message: "Исчерпан лимит расходов активного API-ключа OpenRouter. Увеличь или сбрось лимит ключа.",
      status: 403,
    },
  );
});

test("does not classify an article-level provider error as a batch blocker", () => {
  assert.equal(
    getOpenRouterBatchBlock(500, { error: { message: "Provider unavailable" } }),
    null,
  );
});

test("identifies batch blocker errors without matching their message", () => {
  const error = new OpenRouterBatchBlockedError({
    code: "openrouter_rate_limited",
    message: "OpenRouter rate limited the worker.",
    status: 429,
  });

  assert.equal(isOpenRouterBatchBlockedError(error), true);
  assert.equal(isOpenRouterBatchBlockedError(new Error(error.message)), false);
});
