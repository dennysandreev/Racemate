// Explicit opt-in smoke test. Synthetic sources only; no database writes/publication.
// node --env-file=.env.local scripts/check-news-editorial-live.mjs --run
import { writeFile } from "node:fs/promises";
import { resolveWorkerAiPrompt } from "../worker/ai-prompt-registry.mjs";
import { runNewsEditorialPipeline } from "../worker/news-editorial.mjs";
import { newsResponseFormat, newsRequestOptions } from "../worker/news-response-format.mjs";

if (!process.argv.includes("--run")) {
  console.log("Pass --run to test the configured OpenRouter models on synthetic news. No articles are published.");
  process.exit(0);
}
if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is required");
const source = {
  name: "Synthetic editorial regression fixture", url: "https://example.com/f1-test", authors: [], published_at: "2026-09-22T08:00:00Z",
  title: "Ferrari prepares upgrade after four qualifying sessions without pole",
  text: "Ferrari will introduce a new front wing at the next race. The team has not taken pole in the last four qualifying sessions. Its engineers said the wing is designed to improve balance in slow corners. They have not yet confirmed a lap time gain. Lewis Hamilton drives for Ferrari. The team said both drivers will receive the same specification. No change to the rear wing is planned.",
};
const context = { season: 2026, current_date: "2026-09-22", races: [], teams: [{ slug: "team-fer", name: "Ferrari" }], facts: [{ id: "season", kind: "season", value: 2026 }, { id: "hamilton_team", kind: "driver_team", subject: "Lewis Hamilton", aliases: ["Hamilton", "Хэмилтон"], value: "Ferrari", scope: "current" }] };
const usage = [];
const noPublishedVersions = { from: () => ({ select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; }, async maybeSingle() { return { data: null }; } }) };
const request = async (promptKey, payload) => {
  if (usage.length >= 6) throw new Error("Smoke-test call limit exceeded");
  const prompt = await resolveWorkerAiPrompt({ client: noPublishedVersions, promptKey, variables: { payload_json: JSON.stringify(payload) } });
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST", signal: AbortSignal.timeout(90_000),
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: prompt.model, max_completion_tokens: prompt.maxTokens, ...newsRequestOptions(promptKey, prompt.model), response_format: newsResponseFormat(promptKey), messages: [{ role: "system", content: prompt.systemPrompt }, { role: "user", content: prompt.userPrompt }] }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`OpenRouter HTTP ${response.status}`);
  usage.push({ key: promptKey, model: prompt.model, usage: result.usage, content: result.choices?.[0]?.message?.content });
  const content = result.choices?.[0]?.message?.content;
  const start = content?.indexOf("{");
  const end = content?.lastIndexOf("}");
  return JSON.parse(content.slice(start, end + 1));
};
const result = await runNewsEditorialPipeline({ source, context, request });
await writeFile("/tmp/raceside-editorial-smoke.json", JSON.stringify({ result, usage }, null, 2));
console.log(JSON.stringify({ decision: result.decision, issues: result.issues, calls: usage.length, costUsd: usage.reduce((sum, item) => sum + Number(item.usage?.cost ?? 0), 0), report: "/tmp/raceside-editorial-smoke.json" }));
if (result.decision !== "PASS") process.exitCode = 1;
