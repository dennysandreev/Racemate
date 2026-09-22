import { createHash } from "node:crypto";

export const NEWS_EDITORIAL_VERSION = 1;
export const NEWS_ARTICLE_TYPES = ["breaking_news", "news", "report", "interview", "opinion", "column", "analysis", "rumour", "legal", "historical", "technical_analysis"];
const FACT_KINDS = new Set(["fact", "quote", "opinion", "allegation", "uncertain"]);
const SCORE_KEYS = ["fact_grounding", "source_fidelity", "attribution", "headline_fidelity", "information_density", "language_quality"];
const text = value => typeof value === "string" ? value.trim() : "";
const comparable = value => text(value).normalize("NFKC").replace(/\s+/g, " ").toLowerCase();
const strings = value => Array.isArray(value) && value.every(item => typeof item === "string");
const evidenceFragments = value => strings(value) ? value : typeof value === "string" ? value.split(/\n\s*\n/) : [];
const evidenceMatches = (value, original) => {
  const fragments = evidenceFragments(value);
  return fragments.length > 0 && fragments.every(fragment => {
    // A model may wrap an excerpt in quotes even when the original quote
    // continues into another paragraph. Only outer punctuation is optional.
    const excerpt = comparable(fragment).replace(/^["“”'‘’]+|["“”'‘’]+$/g, "");
    return excerpt.length >= 8 && original.includes(excerpt);
  });
};

export function sourceSnapshotHash(source) {
  return createHash("sha256").update(JSON.stringify(source)).digest("hex");
}

export function parseSourceFacts(payload, source) {
  if (!payload || !NEWS_ARTICLE_TYPES.includes(payload.article_type) || typeof payload.relevant !== "boolean" ||
      !["normal", "high"].includes(payload.risk) || !strings(payload.source_authors) || !strings(payload.caveats) ||
      (payload.source_author_aliases != null && !strings(payload.source_author_aliases)) ||
      !Array.isArray(payload.facts) || payload.facts.length > 40 || !Array.isArray(payload.entities) ||
      !text(payload.main_fact) || !text(payload.event_type) || (payload.event_stage != null && typeof payload.event_stage !== "string")) return null;
  const original = comparable([source.title, source.description, source.text].filter(Boolean).join("\n"));
  const ids = new Set();
  for (const fact of payload.facts) {
    if (!fact || !/^f\d+$/.test(fact.id) || ids.has(fact.id) || !FACT_KINDS.has(fact.kind) ||
        !text(fact.text) || !evidenceMatches(fact.evidence, original) ||
        typeof fact.essential !== "boolean" ||
        (fact.kind !== "fact" && !text(fact.attribution))) return null;
    ids.add(fact.id);
    if (source.sources?.length) {
      const origin = source.sources.find(item => item.url === fact.source_url);
      if (!origin || !evidenceMatches(fact.evidence, comparable(`${origin.title}\n${origin.description ?? ""}\n${origin.text}`))) return null;
    }
  }
  if (payload.relevant && !payload.facts.length) return null;
  if (payload.entities.some(entity => !entity || !text(entity.name) || !text(entity.normalized_name) || !["primary", "secondary", "mention"].includes(entity.role))) return null;
  return { ...payload, event_stage: text(payload.event_stage) || "unknown" };
}

export function checkNewsDraft(draft, extraction, source, context) {
  const issues = [];
  if (![draft?.title_ru, draft?.summary_ru, draft?.details_ru].every(value => text(value))) return ["incomplete_draft"];
  const body = [draft.title_ru, draft.summary_ru, draft.details_ru].join("\n");
  if (!/[а-яё]/i.test(body)) issues.push("non_russian_draft");
  const authorAliases = [...extraction.source_authors, ...(extraction.source_author_aliases ?? [])]
    .flatMap(name => [name, name.trim().split(/\s+/).at(-1)]).filter(name => name.length >= 4);
  if (authorAliases.some(name => new RegExp(`(?<![\\p{L}])${escapeRegExp(name)}${/[а-яё]/i.test(name) ? "(?:а|у|ом|е|ой|ей|ы|и|ю)?" : ""}(?![\\p{L}])`, "iu").test(body))) issues.push("source_meta_narration");
  if (/RaceSide/i.test(body) && !/RaceSide/i.test(`${source.title} ${source.text}`)) issues.push("raceside_opinion");
  const allowedNumbers = new Set(numbers([source.title, source.description, source.text, ...context.facts.map(fact => String(fact.value))].join("\n")));
  for (const number of numbers(body)) if (!allowedNumbers.has(number)) issues.push(`invented_number:${number}`);
  if (!strings(draft.used_fact_ids) || draft.used_fact_ids.some(id => !extraction.facts.some(fact => fact.id === id))) issues.push("unknown_source_fact");
  if (extraction.facts.some(fact => fact.essential && !draft.used_fact_ids?.includes(fact.id))) issues.push("essential_fact_missing");
  if (!Array.isArray(draft.context_claims) || draft.context_claims.some(claim =>
    !claim || !context.facts.some(fact => fact.id === claim.id && comparable(String(fact.value)) === comparable(String(claim.value))))) issues.push("context_claim_mismatch");
  const sourceNames = [...new Set([source.name, ...(source.sources ?? []).map(item => item.name)].filter(Boolean))];
  const sourceVoice = sourceNames.some(name => new RegExp(`(?:по мнению|как (?:пишет|отмечает|считает))\\s+${escapeRegExp(name)}|${escapeRegExp(name)}\\s+(?:считает|предлагает|анализирует|рассуждает)`, "iu").test(body));
  if (sourceVoice || /по мнению\s+(?:автора|журналиста|издания|портала|редакции)|в (?:своей колонке|материале[^.!?\n]{0,60}(?:говорится|отмечается|рассматривается))|(?:автор[а-яё]*|журналист[а-яё]*|обозревател[а-яё]*|редакци[а-яё]*|издани[а-яё]*|портал[а-яё]*)[^.!?\n]{0,60}\s(?:счита[а-яё]*|предлага[а-яё]*|анализиру[а-яё]*|отмеча[а-яё]*|полага[а-яё]*|рассужда[а-яё]*)/i.test(body)) issues.push("source_meta_narration");
  if (/по одному из мнений|другое мнение (?:предполагает|состоит|заключается)|по мнению одного из авторов/i.test(body)) issues.push("source_meta_narration");
  if (/\b(?:some|one|a single) (?:fans?|readers?|viewers?)\b/i.test(`${source.title} ${source.description}`) &&
      /фанат|болельщик|зрител/i.test(draft.title_ru) &&
      !/част[ьи]|некотор|один|одного|одним|может|могут|риск|(?:болельщик|фанат|зритель)(?![а-яё])/i.test(draft.title_ru)) issues.push("headline_scope_changed");
  if (extraction.article_type === "rumour" && !/(?:по данным|сообщает|может|предполож|слух|не подтвержд)/i.test(`${draft.title_ru}\n${draft.summary_ru}`)) issues.push("rumour_attribution_missing");
  // Deliberately narrow: adjacency alone is never proof of a team mismatch.
  // Historical, future and negated sentences go to the semantic verifier.
  for (const sentence of body.split(/[.!?\n]+/)) {
    if (/(?:выступал|ранее|раньше|бывш|перейд[её]т|будет|не выступает|не является|до \d{4}|в \d{4} году)/i.test(sentence)) continue;
    for (const fact of context.facts.filter(fact => fact.kind === "driver_team" && fact.scope === "current")) {
      for (const alias of fact.aliases ?? [fact.subject]) {
        const expression = new RegExp(`${escapeRegExp(alias)}[^.!?\\n]{0,35}?(?:выступает за|является пилотом|drives for)\\s+([A-Za-z][A-Za-z -]{1,35})`, "i");
        const claimed = sentence.match(expression)?.[1]?.trim();
        if (claimed && !comparable(claimed).startsWith(comparable(String(fact.value)))) issues.push("driver_team_conflict");
      }
    }
  }
  const lead = comparable(draft.summary_ru).replace(/[.!?]$/, "");
  if (comparable(draft.details_ru).startsWith(lead)) issues.push("repeated_lead");
  const words = value => new Set(comparable(value).split(/[.!?;]/)[0].match(/[\p{L}\d]+/gu)?.filter(word => word.length > 2).map(word => word.slice(0, 6)) ?? []);
  const openingWords = words(draft.details_ru);
  for (const sentence of draft.summary_ru.split(/[.!?]/)) {
    const leadWords = words(sentence);
    const shared = [...leadWords].filter(word => openingWords.has(word)).length;
    if ((leadWords.size >= 8 && shared >= 7 && shared / leadWords.size >= 0.75) ||
        (openingWords.size >= 8 && shared / openingWords.size >= 0.85)) issues.push("repeated_lead");
  }
  if (/сезон[ -]открывающ|правил[а-яё]* инцидентов|часть оценки сводится|для повышения справедливости|улучшить справедливость|закусочн[а-яё]* верси|делает[^.!?]{0,45}формат более сильным/i.test(body)) issues.push("unnatural_language");
  return [...new Set(issues)];
}

function numbers(value) {
  const numberWords = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
  const normalized = String(value)
    .replace(/(\d)(?:million|billion|thousand|km|mph|bhp|hp|ms|bn|m|k|s)\b/gi, "$1 ")
    .replace(/\b\d{1,3}(?:[ \u00a0\u202f]\d{3})+\b/g, match => match.replace(/\s/g, ""))
    .replace(new RegExp(`\\b(${numberWords.join("|")})\\b`, "gi"), word => String(numberWords.indexOf(word.toLowerCase())));
  return [...normalized.matchAll(/(?<![\p{L}\d])\d+(?:[.,]\d+)?(?![\p{L}\d])/gu)].map(match => match[0].replace(",", "."));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function verificationPasses(review) {
  return review?.decision === "PASS" && review.checked_claims === true && Array.isArray(review.issues) && !review.issues.length &&
    SCORE_KEYS.every(key => typeof review.scores?.[key] === "number" && review.scores[key] >= 0.9 && review.scores[key] <= 1);
}

/** Separate requests/contexts. No public write happens before the final decision. */
export async function runNewsEditorialPipeline({ source, context, request, extraction: savedExtraction }) {
  let extractionResponse = savedExtraction ?? await request("news.extract", { source });
  let extraction = parseSourceFacts(extractionResponse, source);
  if (!extraction) {
    extractionResponse = await request("news.extract", { source, feedback: "Предыдущий ответ не прошёл проверку структуры или evidence. main_fact и event_type обязательны и должны быть строками, event_stage может быть unknown. Каждый элемент массива evidence — короткий точный непрерывный фрагмент оригинала: не склеивай абзацы внутри одного элемента, не сокращай цитату многоточием. Для каждого мнения укажи attribution. Пересобери JSON по схеме." });
    extraction = parseSourceFacts(extractionResponse, source);
  }
  const result = { version: NEWS_EDITORIAL_VERSION, source, source_hash: sourceSnapshotHash(source), context, extraction, extraction_response: extractionResponse, attempts: [], decision: "MANUAL_REVIEW", issues: [] };
  if (!extraction) return { ...result, issues: ["invalid_extraction"] };
  if (!extraction.relevant) return { ...result, decision: "REJECT", issues: ["irrelevant_source"] };
  let feedback = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    // The writer receives the evidence-backed ideas, not the original column's
    // narrative voice. The independent verifier still reads the complete source.
    const draft = await request("news.article", { source: { published_at: source.published_at, coverage: source.coverage }, extraction, context, previous_draft: result.draft ?? null, feedback });
    const hardIssues = checkNewsDraft(draft, extraction, source, context);
    const review = await request("news.verify", { source, extraction, context, draft, hard_issues: hardIssues });
    result.attempts.push({ draft, review, hard_issues: hardIssues });
    result.draft = draft;
    result.review = review;
    const corrections = {
      source_meta_narration: `Удали из заголовка, лида и текста имена журналистов и пересказ их мнений: ${[...extraction.source_authors, ...(extraction.source_author_aliases ?? [])].join(", ")}. Передай саму идею условно, не приписывая её FIA.`,
      repeated_lead: "Первое предложение основного текста повторяет лид. Удали повтор и начни details_ru со следующего конкретного факта.",
      headline_scope_changed: "Источник описывает одного или часть болельщиков. Не объявляй общий отток аудитории: сохрани ограничение масштаба в заголовке или изложи риск условно.",
      unnatural_language: "Замени кальки и туманные обороты естественным русским языком. Например: «спринт на первом этапе сезона», «действия при инцидентах».",
      context_claim_mismatch: "В context_claims допустимы только id/value из context.facts. Факты f1/f2 указываются в used_fact_ids. Неиспользованный контекст не перечисляй.",
      essential_fact_missing: "Сохрани все существенные факты и перечисли их id в used_fact_ids.",
      raceside_opinion: "Не упоминай RaceSide и не приписывай нам журналистов или собственные мнения.",
    };
    feedback = [...hardIssues.map(issue => corrections[issue] ?? issue), ...(strings(review?.issues) ? review.issues : ["invalid_verification"])];
    if (!hardIssues.length && verificationPasses(review)) {
      const sensitive = extraction.risk === "high" || extraction.article_type === "legal" || extraction.facts.some(fact => fact.kind === "allegation");
      // Live audits still found opinion-as-fact and author narration despite
      // a model PASS. Keep those genres behind an explicit editorial decision.
      const needsEditor = ["opinion", "column", "analysis", "technical_analysis"].includes(extraction.article_type);
      return { ...result, decision: sensitive || needsEditor ? "MANUAL_REVIEW" : "PASS",
        issues: sensitive ? ["sensitive_material"] : needsEditor ? ["analysis_requires_editor"] : [] };
    }
    if (["REJECT", "MANUAL_REVIEW"].includes(review?.decision)) break;
  }
  return { ...result, issues: feedback.length ? feedback : ["quality_threshold_not_met"] };
}

export function buildDigestInput(articles) {
  const events = new Map();
  for (const article of articles) {
    const key = article.event_fingerprint || article.id;
    if (!events.has(key)) events.set(key, { event: key, articles: [] });
    events.get(key).articles.push({ id: article.id, title: article.ai_title_ru ?? article.original_title, summary: article.ai_summary_ru, main_fact: article.main_fact, type: article.editorial_meta?.article_type ?? "news", source: article.canonical_url, source_name: article.news_sources?.name, source_authors: article.editorial_meta?.source_authors ?? [] });
  }
  return [...events.values()];
}

export function combineNewsSources(previous, incoming) {
  const sources = [...(previous.sources ?? [previous]), incoming];
  const unique = [...new Map(sources.map(source => [source.url, source])).values()];
  if (unique.length > 3) return null;
  return { ...incoming, name: unique.map(source => source.name).join(" · "), authors: [...new Set(unique.flatMap(source => source.authors ?? []))], sources: unique,
    text: unique.map(source => `SOURCE: ${source.name}\nURL: ${source.url}\nPUBLISHED: ${source.published_at ?? "unknown"}\n${source.title}\n${source.description ?? ""}\n${source.text}`).join("\n\n") };
}

export function renderVerifiedDigest(payload, articles) {
  if (!Array.isArray(payload?.items) || !payload.items.length || payload.items.length > 6) return null;
  const seen = new Set();
  const lines = [];
  for (const item of payload.items) {
    if (!text(item.headline) || !text(item.summary) || !strings(item.article_ids) || !item.article_ids.length) return null;
    const references = item.article_ids.map(id => articles.find(article => article.id === id));
    if (references.some(article => !article)) return null;
    const events = references.map(article => article.event_fingerprint || article.id);
    if (events.some(event => seen.has(event))) return null;
    events.forEach(event => seen.add(event));
    const allowedNumbers = new Set(numbers(references.map(article => `${article.ai_title_ru} ${article.ai_summary_ru} ${article.ai_summary_long_ru}`).join("\n")));
    if (numbers(`${item.headline} ${item.summary}`).some(value => !allowedNumbers.has(value))) return null;
    const links = references.map(article => `[Подробнее](https://raceside.online/news/${encodeURIComponent(article.slug || article.id)})`).join(" · ");
    lines.push(`- **${escapeMarkdown(item.headline)}** ${escapeMarkdown(item.summary)} ${links}`);
  }
  return lines.join("\n\n");
}

function escapeMarkdown(value) {
  return text(value).replace(/\s+/g, " ").replace(/([\\`*_{}[\]()<>#!|])/g, "\\$1");
}
