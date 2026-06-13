"use server";

import { revalidatePath } from "next/cache";

import { getOpenRouterEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type DigestArticle = {
  id: string;
  ai_title_ru: string | null;
  original_title: string;
  ai_summary_ru: string | null;
  ai_summary_long_ru: string | null;
};

export async function generateDailyDigest() {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return;
  }

  const dateKey = new Date().toISOString().slice(0, 10);
  const env = getOpenRouterEnv();
  let cachedQuery = supabase
    .from("digests")
    .select("id")
    .eq("digest_type", "daily_news")
    .eq("date_key", dateKey)
    .eq("status", "published");

  cachedQuery = env ? cachedQuery.eq("ai_model", env.model) : cachedQuery.is("ai_model", null);

  const { data: cached } = await cachedQuery.maybeSingle();

  if (cached) {
    revalidatePath("/news");
    return;
  }

  const { data } = await supabase
    .from("news_articles")
    .select("id, ai_title_ru, original_title, ai_summary_ru, ai_summary_long_ru")
    .eq("status", "processed")
    .is("duplicate_of", null)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(12);

  const articles = (data ?? []) as DigestArticle[];
  let body = makeFallbackDigest(articles);
  let usage: { prompt_tokens?: number; completion_tokens?: number } | null = null;

  if (env && articles.length) {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.apiKey}`,
        "content-type": "application/json",
        "x-title": "RaceMate",
      },
      body: JSON.stringify({
        model: env.model,
        messages: [
          {
            role: "system",
            content:
              "Собери дневную F1-сводку RaceMate по-русски. Верни JSON: title_ru, body_md. body_md — 4-6 коротких пунктов Markdown, без выдуманных фактов.",
          },
          {
            role: "user",
            content: articles
              .map(
                (article, index) =>
                  `${index + 1}. ${article.ai_title_ru ?? article.original_title}\n${article.ai_summary_long_ru ?? article.ai_summary_ru ?? ""}`,
              )
              .join("\n\n"),
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: Number(process.env.AI_DIGEST_MAX_TOKENS ?? 800),
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(`OpenRouter failed for daily digest: ${response.status}`);
    }
    const parsed = safeJson(payload.choices?.[0]?.message?.content);
    body = typeof parsed?.body_md === "string" && parsed.body_md.trim() ? parsed.body_md.trim() : body;
    usage = payload.usage ?? null;
  }

  const { data: digest } = await supabase
    .from("digests")
    .insert({
      digest_type: "daily_news",
      date_key: dateKey,
      title: "Короткая сводка дня",
      body_md: body,
      ai_model: env?.model ?? null,
      status: "published",
      generated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (env && digest?.id) {
    await supabase.from("ai_usage_logs").insert({
      purpose: "news.daily_digest",
      provider: "openrouter",
      model: env.model,
      input_tokens: usage?.prompt_tokens ?? null,
      output_tokens: usage?.completion_tokens ?? null,
      estimated_cost_usd: null,
      related_digest_id: digest.id,
    });
  }

  revalidatePath("/news");
}

function makeFallbackDigest(articles: DigestArticle[]) {
  if (!articles.length) {
    return "Свежих обработанных новостей пока нет. Запусти RSS и AI-обработку, чтобы собрать сводку дня.";
  }

  return articles
    .slice(0, 6)
    .map((article) => `- ${article.ai_title_ru ?? article.original_title}: ${article.ai_summary_ru ?? "детали уточняются"}`)
    .join("\n");
}

function safeJson(value: unknown) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(
      String(value).replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim(),
    );
  } catch {
    return null;
  }
}
