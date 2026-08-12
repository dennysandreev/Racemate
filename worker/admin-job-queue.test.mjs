import assert from "node:assert/strict";
import test from "node:test";

import { getUnexpectedWorkerExitMessage } from "./admin-job-queue.mjs";

test("records a deterministic failure when an attached worker exits early", () => {
  assert.equal(
    getUnexpectedWorkerExitMessage(1),
    "Worker завершился с кодом 1 до сохранения результата.",
  );
  assert.equal(
    getUnexpectedWorkerExitMessage(0),
    "Worker завершился с кодом 1 до сохранения результата.",
  );
});
