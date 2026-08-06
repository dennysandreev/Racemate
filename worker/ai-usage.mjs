export function buildOpenRouterUsageLog(payload, {
  model,
  purpose,
  relatedArticleId = null,
  relatedDigestId = null,
  promptKey = null,
  promptVersionId = null,
}) {
  const usage = isPlainObject(payload?.usage) ? payload.usage : {};

  return {
    purpose,
    provider: "openrouter",
    model: normalizeString(payload?.model) ?? model,
    input_tokens: nullableInteger(usage.prompt_tokens),
    output_tokens: nullableInteger(usage.completion_tokens),
    estimated_cost_usd: nullableNumber(usage.cost),
    related_article_id: relatedArticleId,
    related_digest_id: relatedDigestId,
    prompt_key: promptKey,
    prompt_version_id: promptVersionId,
  };
}

function nullableInteger(value) {
  const number = nullableNumber(value);
  return number !== null && Number.isInteger(number) && number >= 0 ? number : null;
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function normalizeString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
