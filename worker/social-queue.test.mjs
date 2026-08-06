import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workerSource = readFileSync(new URL("./index.mjs", import.meta.url), "utf8");

test("social AI queue orders by the existing ingestion timestamp", () => {
  const functionStart = workerSource.indexOf("async function processSocialWithAi()");
  const functionEnd = workerSource.indexOf("async function requestSocialAi(", functionStart);

  assert.ok(functionStart >= 0, "processSocialWithAi must exist");
  assert.ok(functionEnd > functionStart, "processSocialWithAi source boundary must exist");

  const functionSource = workerSource.slice(functionStart, functionEnd);

  assert.match(functionSource, /\.from\("social_posts"\)[\s\S]*?\.order\("created_at", \{ ascending: true \}\)/);
  assert.doesNotMatch(functionSource, /\.order\("ingested_at"/);
});
