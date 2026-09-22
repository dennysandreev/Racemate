import assert from "node:assert/strict";
import test from "node:test";
import { newsResponseFormat, newsRequestOptions } from "./news-response-format.mjs";

test("Gemini schemas use string enums and keep every property required", () => {
  function inspect(schema) {
    if (schema.enum) assert.ok(schema.enum.every(value => typeof value === "string"));
    if (schema.properties) {
      assert.deepEqual(schema.required, Object.keys(schema.properties));
      assert.equal(schema.additionalProperties, false);
      Object.values(schema.properties).forEach(inspect);
    }
    if (schema.items) inspect(schema.items);
  }
  for (const key of ["news.extract", "news.article", "news.verify", "news.dedup"]) {
    const format = newsResponseFormat(key);
    assert.equal(format.type, "json_schema");
    inspect(format.json_schema.schema);
  }
});

test("verification separates blocking issues from editorial suggestions", () => {
  const fields = newsResponseFormat("news.verify").json_schema.schema.properties;
  assert.equal(fields.policy_version.minimum, 2);
  assert.equal(fields.policy_version.maximum, 2);
  assert.ok(fields.blocking_issues.items.required.includes("explanation_ru"));
  assert.equal(fields.suggestions.type, "array");
  assert.equal(newsRequestOptions("news.verify", "google/gemini-2.5-flash").reasoning.max_tokens, 2048);
});
