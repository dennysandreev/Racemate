import "server-only";

import { getSiteUrl } from "@/lib/env";
import { createShareLinkCode, isShareLinkCode } from "@/lib/share-link-code";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { PredictionShareScope } from "@/types/racemate";

const CREATE_ATTEMPTS = 6;

type ShareLinkTarget =
  | { kind: "news"; newsArticleId: string }
  | { kind: "prediction"; predictionId: string; predictionScope: PredictionShareScope };

type ShareLinkRow = {
  code: string;
  news_article_id: string | null;
  prediction_id: string | null;
  prediction_scope: string | null;
};

export async function getOrCreateNewsShareUrl(
  newsArticleId: string,
  fallbackUrl: string,
): Promise<string> {
  return getOrCreateShareUrl({ kind: "news", newsArticleId }, fallbackUrl);
}

export async function getOrCreatePredictionShareUrl(
  predictionId: string,
  predictionScope: PredictionShareScope,
  fallbackUrl: string,
): Promise<string> {
  return getOrCreateShareUrl({ kind: "prediction", predictionId, predictionScope }, fallbackUrl);
}

export async function resolveShareLink(code: string): Promise<string | null> {
  if (!isShareLinkCode(code)) {
    return null;
  }

  const admin = createSupabaseAdminClient();

  if (!admin) {
    return null;
  }

  const { data, error } = await admin
    .from("share_links")
    .select("code, news_article_id, prediction_id, prediction_scope")
    .eq("code", code)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const link = data as ShareLinkRow;

  if (link.news_article_id) {
    const { data: article, error: articleError } = await admin
      .from("news_articles")
      .select("id, status, ai_model, duplicate_of")
      .eq("id", link.news_article_id)
      .maybeSingle();

    if (
      articleError
      || !article
      || article.status !== "processed"
      || article.ai_model === "fallback"
      || article.duplicate_of !== null
    ) {
      return null;
    }

    return `/news/${article.id}`;
  }

  if (link.prediction_id) {
    const { data: prediction, error: predictionError } = await admin
      .from("predictions")
      .select("share_slug, is_public")
      .eq("id", link.prediction_id)
      .maybeSingle();

    if (predictionError || !prediction?.is_public || !prediction.share_slug) {
      return null;
    }

    return link.prediction_scope === "qualification"
      ? `/prediction/${prediction.share_slug}?scope=qualification`
      : `/prediction/${prediction.share_slug}`;
  }

  return null;
}

async function getOrCreateShareUrl(
  target: ShareLinkTarget,
  fallbackUrl: string,
): Promise<string> {
  const admin = createSupabaseAdminClient();

  if (!admin) {
    return fallbackUrl;
  }

  const existingCode = await findShareLinkCode(admin, target);

  if (existingCode) {
    return buildShareUrl(existingCode);
  }

  for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt += 1) {
    const code = createShareLinkCode();
    const { data, error } = await admin
      .from("share_links")
      .insert({
        code,
        news_article_id: target.kind === "news" ? target.newsArticleId : null,
        prediction_id: target.kind === "prediction" ? target.predictionId : null,
        prediction_scope: target.kind === "prediction" ? target.predictionScope : null,
      })
      .select("code")
      .single();

    if (!error && data?.code) {
      return buildShareUrl(data.code);
    }

    if (error?.code !== "23505") {
      return fallbackUrl;
    }

    const concurrentCode = await findShareLinkCode(admin, target);

    if (concurrentCode) {
      return buildShareUrl(concurrentCode);
    }
  }

  return fallbackUrl;
}

async function findShareLinkCode(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  target: ShareLinkTarget,
): Promise<string | null> {
  let query = admin.from("share_links").select("code");

  if (target.kind === "news") {
    query = query.eq("news_article_id", target.newsArticleId);
  } else {
    query = query
      .eq("prediction_id", target.predictionId)
      .eq("prediction_scope", target.predictionScope);
  }

  const { data, error } = await query.maybeSingle();

  return error ? null : data?.code ?? null;
}

function buildShareUrl(code: string) {
  return `${getSiteUrl().replace(/\/+$/, "")}/s/${code}`;
}
