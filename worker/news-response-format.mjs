import { NEWS_ARTICLE_TYPES } from "./news-editorial.mjs";

const string = { type: "string" };
const nullableString = { type: ["string", "null"] };
const array = items => ({ type: "array", items });
const object = properties => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const score = { type: "number", minimum: 0, maximum: 1 };
const schemas = {
  "news.extract": object({
    article_type: { type: "string", enum: NEWS_ARTICLE_TYPES }, relevant: { type: "boolean" },
    risk: { type: "string", enum: ["normal", "high"] }, source_authors: array(string), source_author_aliases: array(string),
    main_fact: string, event_type: string, event_stage: nullableString, event_date: nullableString,
    event_fingerprint: nullableString,
    entities: array(object({ type: string, name: string, normalized_name: string, role: { type: "string", enum: ["primary", "secondary", "mention"] } })),
    facts: { type: "array", maxItems: 20, items: object({
      id: string, kind: { type: "string", enum: ["fact", "quote", "opinion", "allegation", "uncertain"] },
      text: string, evidence: { type: "array", minItems: 1, maxItems: 4, items: { type: "string", minLength: 8, maxLength: 400 } },
      attribution: nullableString, essential: { type: "boolean" }, source_url: nullableString,
    }) }, caveats: array(string),
  }),
  "news.article": object({
    title_ru: string, summary_ru: string, details_ru: string, highlight_phrases_ru: array(string),
    used_fact_ids: array(string), context_claims: array(object({ id: string, value: { type: ["string", "number"] } })),
    race_round: { type: ["number", "null"] }, race_confidence: score, team_slugs: array(string),
  }),
  "news.verify": object({
    decision: { type: "string", enum: ["PASS", "REWRITE", "REJECT", "MANUAL_REVIEW"] },
    checked_claims: { type: "boolean" }, issues: array(string),
    scores: object({ fact_grounding: score, source_fidelity: score, attribution: score, headline_fidelity: score, information_density: score, language_quality: score }),
  }),
};

export function newsResponseFormat(key) {
  return schemas[key] ? { type: "json_schema", json_schema: { name: key.replaceAll(".", "_"), strict: true, schema: schemas[key] } } : { type: "json_object" };
}

export function newsRequestOptions(key, model) {
  // Keep Gemini 2.5 Flash; explicitly allow a bounded check before its JSON answer.
  return { temperature: 0, ...(schemas[key] && model === "google/gemini-2.5-flash"
    ? { reasoning: { max_tokens: key === "news.verify" ? 2048 : 1024, exclude: true } } : {}) };
}
