// Opt-in quality check on real, already published sources. SELECT only; no article writes.
// node --env-file=.env.local scripts/check-news-editorial-sources.mjs --run
import { mkdir, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { resolveWorkerAiPrompt } from "../worker/ai-prompt-registry.mjs";
import { loadNewsContext, selectNewsContext } from "../worker/news-context.mjs";
import { runNewsEditorialPipeline } from "../worker/news-editorial.mjs";
import { newsResponseFormat, newsRequestOptions } from "../worker/news-response-format.mjs";
import { extractNewsSourceHtml, extractNewsSourceMarkdown, decodeNewsEntities } from "../worker/news-source-text.mjs";

if (!process.argv.includes("--run")) {
  console.log("Pass --run for a paid check of four real source articles. No database writes.");
  process.exit(0);
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ids = ["b62a9a39-d6b8-4648-bb9e-c53e804ea0ba", "8b29c6a3-864c-458c-ba5b-1fa8d392cabd", "8483dcf2-572d-440f-aaa3-b929eadeb76d", "a9ea25e6-947c-4dbb-abd7-c8e73f5b0ebe"];
const requestedIds = process.argv.find(value => value.startsWith("--ids="))?.slice(6).split(",") ?? ids;
if (!requestedIds.length || requestedIds.some(id => !ids.includes(id))) throw new Error("Choose IDs from the four audit fixtures");
const { data: articles, error } = await db.from("news_articles").select("id,canonical_url,original_title,original_description,source_published_at,source_image_url,raw_payload,news_sources(name)").in("id", requestedIds);
if (error) throw error;
const context = await loadNewsContext(db, { season: new Date().getUTCFullYear() });
const noOverrides = { from: () => ({ select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; }, async maybeSingle() { return { data: null }; } }) };
const folder = "/tmp/raceside-editorial-real-sources";
await mkdir(folder, { recursive: true });
const summary = [];
let totalCost = 0;
let calls = 0;
for (const article of articles ?? []) {
  const url = article.canonical_url;
  let sourceText;
  let coverage = "article";
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { "user-agent": "RaceSide/1.0 (+https://raceside.online)", accept: "text/html" } });
    if (!response.ok) throw new Error(`Source HTTP ${response.status}`);
    sourceText = extractNewsSourceHtml(await response.text());
    if (!sourceText || sourceText.length < 400) throw new Error("Incomplete source response");
  } catch (error) {
    if (!new URL(url).hostname.endsWith("racefans.net")) throw error;
    const response = await fetch(`https://r.jina.ai/${url}`, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) {
      const entry = { id: article.id, decision: "SOURCE_UNAVAILABLE", reason: `Reader HTTP ${response.status}` };
      summary.push(entry);
      console.log(JSON.stringify(entry));
      continue;
    }
    sourceText = extractNewsSourceMarkdown(await response.text());
  }
  if (!sourceText || sourceText.length < 400) throw new Error(`Insufficient source text: ${article.id}`);
  if (sourceText.length > 12000) coverage = "article_truncated";
  const source = { article_id: article.id, url, name: article.news_sources.name, title: decodeNewsEntities(article.original_title), description: decodeNewsEntities(article.original_description), text: sourceText.slice(0,12000), authors: [article.raw_payload?.author].filter(value => typeof value === "string"), published_at: article.source_published_at, coverage };
  const usage = [];
  const request = async (key, payload) => {
    if (++calls > 24 || totalCost >= 0.50) throw new Error("Diagnostic cost/call limit reached");
    const prompt = await resolveWorkerAiPrompt({ client: noOverrides, promptKey: key, variables: { payload_json: JSON.stringify(payload) } });
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST", signal: AbortSignal.timeout(90_000),
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: prompt.model, ...newsRequestOptions(key, prompt.model), max_completion_tokens: prompt.maxTokens, response_format: newsResponseFormat(key), messages: [{ role: "system", content: prompt.systemPrompt }, { role: "user", content: prompt.userPrompt }] }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(`OpenRouter HTTP ${response.status}: ${String(result.error?.message ?? "Request rejected").slice(0, 500)}`);
    totalCost += Number(result.usage?.cost ?? 0);
    usage.push({ key, model: prompt.model, usage: result.usage });
    const content = result.choices?.[0]?.message?.content;
    try {
      return JSON.parse(content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1));
    } catch {
      usage.at(-1).invalid_json = true;
      return null;
    }
  };
  const result = await runNewsEditorialPipeline({ source, context: selectNewsContext(context, source, []), request });
  await writeFile(`${folder}/${article.id}.json`, JSON.stringify({ result, usage, source_image_url: article.source_image_url }, null, 2));
  const entry = { id: article.id, decision: result.decision, title: result.draft?.title_ru, type: result.extraction?.article_type, issues: result.issues, calls: usage.length };
  summary.push(entry);
  console.log(JSON.stringify(entry));
}
await writeFile(`${folder}/summary.json`, JSON.stringify({ summary, totalCost, calls }, null, 2));
console.log(JSON.stringify({ totalCost, calls, folder }));
