import assert from "node:assert/strict";
import test from "node:test";
import { parseSourceFacts, checkNewsDraft, runNewsEditorialPipeline, buildDigestInput, renderVerifiedDigest, combineNewsSources, verificationPasses } from "./news-editorial.mjs";

const source = { title: "Hamilton at Ferrari", text: "Lewis Hamilton drives for Ferrari. Some fans may stop watching. The gap is 145 points.", url: "https://example.com/f1", name: "The Race", authors: ["Gary Anderson"] };
const extraction = () => ({ article_type: "news", relevant: true, risk: "normal", source_authors: ["Gary Anderson"], main_fact: "Хэмилтон выступает за Ferrari.", event_type: "driver_transfer", event_stage: "announcement", event_date: null, event_fingerprint: "hamilton_ferrari", entities: [{ type: "person", name: "Lewis Hamilton", normalized_name: "lewis_hamilton", role: "primary" }], facts: [{ id: "f1", kind: "fact", text: "Хэмилтон выступает за Ferrari.", evidence: "Lewis Hamilton drives for Ferrari.", attribution: null, essential: true }], caveats: [] });
const draft = () => ({ title_ru: "Хэмилтон выступает за Ferrari", summary_ru: "Хэмилтон продолжает выступать за Ferrari.", details_ru: "Отрыв составляет 145 очков.", used_fact_ids: ["f1"], context_claims: [], team_slugs: [], highlight_phrases_ru: [] });
const pass = () => ({ decision: "PASS", issues: [], scores: { fact_grounding: 1, source_fidelity: 1, attribution: 1, headline_fidelity: 1, information_density: 1, language_quality: 1 }, checked_claims: true });
const context = { current_date: "2026-09-22", season: 2026, facts: [{ id: "driver:ham:team", kind: "driver_team", subject: "Lewis Hamilton", aliases: ["Хэмилтон", "Hamilton"], value: "Ferrari", scope: "current" }] };

test("extraction rejects fabricated source fragments and unattributed opinions", () => {
  const fake = extraction(); fake.facts[0].evidence = "Hamilton drives for Mercedes";
  assert.equal(parseSourceFacts(fake, source), null);
  const opinion = extraction(); opinion.facts[0].kind = "opinion";
  assert.equal(parseSourceFacts(opinion, source), null);
  assert.ok(parseSourceFacts(extraction(), source));
});

test("several evidence fragments are all checked against the original", () => {
  const value = extraction();
  value.facts[0].evidence = ["Lewis Hamilton drives for Ferrari.", "Some fans may stop watching."];
  assert.ok(parseSourceFacts(value, source));
  value.facts[0].evidence.push("FIA approved the change.");
  assert.equal(parseSourceFacts(value, source), null);
});

test("evidence permits outer quotation marks but no changed content", () => {
  const value = extraction();
  value.facts[0].evidence = ['"Lewis Hamilton drives for Ferrari."'];
  assert.ok(parseSourceFacts(value, source));
  value.facts[0].evidence = ['"Lewis Hamilton drives for Mercedes."'];
  assert.equal(parseSourceFacts(value, source), null);
});

test("hard checks reject wrong current team without rejecting historical context", () => {
  const wrong = { ...draft(), details_ru: "Хэмилтон выступает за Mercedes." };
  assert.ok(checkNewsDraft(wrong, extraction(), source, context).includes("driver_team_conflict"));
  assert.ok(!checkNewsDraft({ ...draft(), details_ru: "До 2025 года Хэмилтон выступал за Mercedes." }, extraction(), source, context).includes("driver_team_conflict"));
});

test("hard checks reject invented numbers, false attribution and context values", () => {
  const wrong = { ...draft(), details_ru: "Эксперты RaceSide считают, что отрыв составляет 146 очков.", context_claims: [{ id: "driver:ham:team", value: "Mercedes" }] };
  const issues = checkNewsDraft(wrong, extraction(), source, context);
  assert.ok(issues.includes("invented_number:146"));
  assert.ok(issues.includes("raceside_opinion"));
  assert.ok(issues.includes("context_claim_mismatch"));
});

test("a translated byline cannot enter the article as its subject", () => {
  const value = { ...extraction(), source_author_aliases: ["Гэри Андерсон"] };
  const result = checkNewsDraft({ ...draft(), summary_ru: "Гэри Андерсон предлагает изменить правила." }, value, source, context);
  assert.ok(result.includes("source_meta_narration"));
  assert.ok(checkNewsDraft({ ...draft(), summary_ru: "Предложение Андерсона касается новых правил." }, value, source, context).includes("source_meta_narration"));
  assert.ok(!checkNewsDraft({ ...draft(), summary_ru: "FIA рассматривает изменение правил." }, value, source, context).includes("source_meta_narration"));
});

test("compact financial units are source numbers, not invented values", () => {
  const input = { ...source, text: "$19million spending boost: $11m allowance and $8m loan." };
  const issues = checkNewsDraft({ ...draft(), details_ru: "Бюджет увеличен на 19 миллионов долларов: 11 миллионов дополнительного лимита и 8 миллионов займа." }, extraction(), input, context);
  assert.ok(!issues.some(issue => issue.startsWith("invented_number:")));
});

test("source narration is blocked with and without journalist names", () => {
  for (const details_ru of [
    "В материале The Race говорится о выступлениях Хэмилтона.",
    "Автор считает, что формат можно изменить.",
    "По мнению автора, формат стоит изменить.",
    "По мнению The Race, формат стоит изменить.",
    "Журналисты портала предлагают изменить формат.",
    "The Race анализирует возможные изменения.",
    "По одному из мнений, формат стоит изменить.",
    "Другое мнение предполагает изменение формата.",
  ]) assert.ok(checkNewsDraft({ ...draft(), details_ru }, extraction(), source, context).includes("source_meta_narration"), details_ru);
  assert.ok(!checkNewsDraft({ ...draft(), details_ru: "FIA рассматривает изменения. Формат можно было бы сократить." }, extraction(), source, context).includes("source_meta_narration"));
});

test("an individual fan's story cannot become a general audience exodus", () => {
  const limited = { ...source, title: "Why some fans switch off", description: "How one fan stopped watching" };
  assert.ok(checkNewsDraft({ ...draft(), title_ru: "Спринты вызывают отток фанатов" }, extraction(), limited, context).includes("headline_scope_changed"));
  assert.ok(!checkNewsDraft({ ...draft(), title_ru: "Почему часть болельщиков теряет интерес к спринтам" }, extraction(), limited, context).includes("headline_scope_changed"));
  assert.ok(!checkNewsDraft({ ...draft(), title_ru: "Давний болельщик перестал смотреть спринты" }, extraction(), limited, context).includes("headline_scope_changed"));
});

test("a shorter opening sentence cannot repeat a longer lead", () => {
  const value = { ...draft(), summary_ru: "Стефано Доменикали неоднократно заявлял о популярности спринтерских гонок среди фанатов, но опросы читателей показывают противоположную картину.", details_ru: "Стефано Доменикали неоднократно заявлял о популярности спринтерских гонок среди фанатов." };
  assert.ok(checkNewsDraft(value, extraction(), source, context).includes("repeated_lead"));
  assert.ok(checkNewsDraft({ ...value, summary_ru: `Количество спринтов выросло. ${value.summary_ru}` }, extraction(), source, context).includes("repeated_lead"));
});

test("extractor gets one correction attempt without admitting unsupported evidence", async () => {
  let extractions = 0;
  const result = await runNewsEditorialPipeline({ source, context, request: async key => {
    if (key === "news.extract") return ++extractions === 1 ? { ...extraction(), main_fact: { id: "f1" } } : extraction();
    return key === "news.article" ? draft() : pass();
  } });
  assert.equal(extractions, 2);
  assert.equal(result.decision, "PASS");
});

test("independent verifier blocks a headline which generalizes some fans", async () => {
  const calls = [];
  const result = await runNewsEditorialPipeline({ source, context, request: async (key) => {
    calls.push(key);
    if (key === "news.extract") return extraction();
    if (key === "news.article") return { ...draft(), title_ru: "Болельщики уходят из Формулы-1" };
    return { ...pass(), decision: "REWRITE", issues: ["headline_scope_changed"] };
  } });
  assert.equal(result.decision, "MANUAL_REVIEW");
  assert.deepEqual(calls, ["news.extract", "news.article", "news.verify", "news.article", "news.verify"]);
});

test("opinion is substantive conditional text and legal risk requires review", async () => {
  const opinion = extraction(); opinion.article_type = "opinion";
  assert.ok(checkNewsDraft({ ...draft(), title_ru: "Авторы The Race предлагают пересмотреть формат" }, opinion, source, context).includes("source_meta_narration"));
  assert.ok(!checkNewsDraft({ ...draft(), title_ru: "Как можно изменить формат квалификации", details_ru: "Один из вариантов — сократить квалификацию." }, opinion, source, context).includes("source_meta_narration"));
  const legal = extraction(); legal.article_type = "legal"; legal.risk = "high";
  const result = await runNewsEditorialPipeline({ source, context, request: async key => key === "news.extract" ? legal : key === "news.article" ? draft() : pass() });
  assert.equal(result.decision, "MANUAL_REVIEW");
});

test("missing verification dimensions and missing essential facts prevent publication", async () => {
  const result = await runNewsEditorialPipeline({ source, context, request: async key => key === "news.extract" ? extraction() : key === "news.article" ? draft() : { decision: "PASS" } });
  assert.equal(result.decision, "MANUAL_REVIEW");
  assert.ok(checkNewsDraft({ ...draft(), used_fact_ids: [] }, extraction(), source, context).includes("essential_fact_missing"));
});

test("a verified analysis can publish; genre alone is not a review reason", async () => {
  for (const article_type of ["opinion", "column", "analysis", "technical_analysis"]) {
    const value = { ...extraction(), article_type };
    const result = await runNewsEditorialPipeline({ source, context, request: async key => key === "news.extract" ? value : key === "news.article" ? draft() : pass() });
    assert.equal(result.decision, "PASS");
    assert.deepEqual(result.issues, []);
  }
});

test("COVID-19 is a name, while a separate unsupported 19 remains blocked", () => {
  const input = { ...source, text: "The race returned during the Covid pandemic in 2020 and 2021." };
  const valid = { ...draft(), details_ru: "Гонка возвращалась во время пандемии COVID-19 в 2020 и 2021 годах." };
  assert.ok(!checkNewsDraft(valid, extraction(), input, context).includes("invented_number:19"));
  assert.ok(checkNewsDraft({ ...valid, details_ru: `${valid.details_ru} Бюджет составил 19 миллионов.` }, extraction(), input, context).includes("invented_number:19"));
});

test("nonblocking editorial suggestions do not override a verified factual pass", () => {
  const review = { ...pass(), policy_version: 2, blocking_issues: [], suggestions: ["Можно сократить историческую справку."], scores: { ...pass().scores, information_density: 0.8, language_quality: 0.8 } };
  assert.equal(verificationPasses(review), true);
  assert.equal(verificationPasses({ ...review, blocking_issues: [{ category: "factual_error", explanation_ru: "Неверная команда." }] }), false);
  assert.equal(verificationPasses({ ...review, checked_claims: false }), false);
  assert.equal(verificationPasses({ ...review, policy_version: undefined, blocking_issues: [{ category: "factual_error" }] }), false);
});

test("12-hour source times allow the equivalent 24-hour time, not a different hour", () => {
  const input = { ...source, text: "Practice at 1.30pm, qualifying at 4pm, race at 3pm." };
  const valid = { ...draft(), details_ru: "Практика в 13:30, квалификация в 16:00, гонка в 15:00." };
  assert.ok(!checkNewsDraft(valid, extraction(), input, context).some(issue => issue.startsWith("invented_number:")));
  assert.ok(checkNewsDraft({ ...valid, details_ru: "Гонка в 17:00." }, extraction(), input, context).includes("invented_number:17"));
});

test("a factual error still blocks a high-scoring analysis with suggestions", async () => {
  const review = { ...pass(), policy_version: 2, suggestions: ["Сократить текст."], blocking_issues: [{ category: "factual_error", draft_excerpt: "Ferrari", source_quote: "Ferrari", explanation_ru: "Нужно исправить фактическое утверждение." }] };
  const result = await runNewsEditorialPipeline({ source, context, request: async key => key === "news.extract" ? { ...extraction(), article_type: "analysis" } : key === "news.article" ? draft() : review });
  assert.equal(result.decision, "MANUAL_REVIEW");
  assert.ok(result.issues.includes("Нужно исправить фактическое утверждение."));
  for (const patch of [{ policy_version: 3 }, { blocking_issues: null }, { suggestions: null }, { scores: {} }]) {
    assert.equal(verificationPasses({ ...pass(), policy_version: 2, suggestions: [], blocking_issues: [], ...patch }), false);
  }
});

test("an exact repeated lead is removed without deleting the new detail", async () => {
  const lead = "Хэмилтон продолжает выступать за Ferrari.";
  const result = await runNewsEditorialPipeline({ source, context, request: async key => key === "news.extract" ? extraction() : key === "news.article" ? { ...draft(), details_ru: `${lead}\n\nОтрыв составляет 145 очков.` } : pass() });
  assert.equal(result.decision, "PASS");
  assert.equal(result.draft.details_ru, "Отрыв составляет 145 очков.");
});

test("irrelevant materials stop before writer and verifier", async () => {
  const calls = [];
  const result = await runNewsEditorialPipeline({ source, context, request: async key => { calls.push(key); return { ...extraction(), relevant: false }; } });
  assert.equal(result.decision, "REJECT");
  assert.deepEqual(calls, ["news.extract"]);
});

test("API failure never becomes a pass", async () => {
  await assert.rejects(runNewsEditorialPipeline({ source, context, request: async () => { throw new Error("API unavailable"); } }), /API unavailable/);
});

test("successful independent verification yields a publishable result", async () => {
  const result = await runNewsEditorialPipeline({ source, context, request: async key => key === "news.extract" ? extraction() : key === "news.article" ? draft() : pass() });
  assert.equal(result.decision, "PASS");
  assert.equal(result.attempts.length, 1);
});

test("digest groups the same event but retains source references", () => {
  const result = buildDigestInput([{ id: "a", event_fingerprint: "same_event", ai_title_ru: "A", canonical_url: "https://one.test" }, { id: "b", event_fingerprint: "same_event", ai_title_ru: "B", canonical_url: "https://two.test" }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].articles.length, 2);
});

test("digest rejects invented references, numbers and repeated events", () => {
  const articles = [{ id: "a", slug: "one", event_fingerprint: "event", ai_title_ru: "Отрыв 145 очков", ai_summary_ru: "Отрыв 145 очков" }];
  const item = { headline: "Отрыв 145 очков", summary: "Отрыв 145 очков", article_ids: ["a"] };
  assert.match(renderVerifiedDigest({ items: [item] }, articles), /https:\/\/raceside.online\/news\/one/);
  assert.equal(renderVerifiedDigest({ items: [{ ...item, article_ids: ["fake"] }] }, articles), null);
  assert.equal(renderVerifiedDigest({ items: [{ ...item, summary: "Отрыв 146 очков" }] }, articles), null);
  assert.equal(renderVerifiedDigest({ items: [item, item] }, articles), null);
});

test("multi-source facts must point to the original that actually supports them", () => {
  const other = { ...source, url: "https://other.test", text: "Other independent reporting on the same event.", title: "Different details" };
  const combined = combineNewsSources(source, other);
  const extracted = extraction();
  extracted.facts[0].source_url = other.url;
  assert.equal(parseSourceFacts(extracted, combined), null);
  extracted.facts[0].source_url = source.url;
  assert.ok(parseSourceFacts(extracted, combined));
  assert.equal(combineNewsSources({ sources: [source, other, { ...other, url: "https://third.test" }] }, { ...other, url: "https://fourth.test" }), null);
});

test("malformed nested output is held instead of crashing or publishing", () => {
  assert.equal(parseSourceFacts({ ...extraction(), facts: [null] }, source), null);
  assert.equal(parseSourceFacts({ ...extraction(), entities: [null] }, source), null);
  assert.ok(checkNewsDraft({ ...draft(), context_claims: [null] }, extraction(), source, context).includes("context_claim_mismatch"));
});

test("an unknown event stage is explicit and source numbers can be written as digits", () => {
  assert.equal(parseSourceFacts({ ...extraction(), event_stage: null }, source).event_stage, "unknown");
  assert.ok(!checkNewsDraft({ ...draft(), details_ru: "Команда не выиграла 4 квалификации." }, extraction(), { ...source, text: `${source.text} Four qualifying sessions without pole.` }, context).includes("invented_number:4"));
});
