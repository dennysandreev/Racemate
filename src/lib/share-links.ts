import "server-only";

import { getSiteUrl } from "@/lib/env";
import { createShareLinkCode, isShareLinkCode } from "@/lib/share-link-code";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { PredictionShareScope } from "@/types/racemate";

const CREATE_ATTEMPTS = 6;

type ShareLinkTarget =
  | { kind: "news"; newsArticleId: string }
  | {
      kind: "prediction";
      predictionId: string;
      predictionScope: PredictionShareScope;
      shareImageVersion: number;
    };

type ShareLinkRow = {
  code: string;
  news_article_id: string | null;
  prediction_id: string | null;
  prediction_scope: string | null;
  share_image_version: number | null;
};

type NewsShareArticleRow = {
  ai_model: string | null;
  duplicate_of: string | null;
  id: string;
  slug?: string | null;
  status: string;
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
  shareImageVersion: number,
  fallbackUrl: string,
): Promise<string> {
  return getOrCreateShareUrl({
    kind: "prediction",
    predictionId,
    predictionScope,
    shareImageVersion,
  }, fallbackUrl);
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
    .select("code, news_article_id, prediction_id, prediction_scope, share_image_version")
    .eq("code", code)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const link = data as ShareLinkRow;

  if (link.news_article_id) {
    let { data: article, error: articleError } = await admin
      .from("news_articles")
      .select("id, slug, status, ai_model, duplicate_of")
      .eq("id", link.news_article_id)
      .maybeSingle();

    if (articleError && isMissingNewsSlugError(articleError)) {
      const fallback = await admin
        .from("news_articles")
        .select("id, status, ai_model, duplicate_of")
        .eq("id", link.news_article_id)
        .maybeSingle();

      article = fallback.data as typeof article;
      articleError = fallback.error;
    }

    const newsArticle = article as NewsShareArticleRow | null;

    if (
      articleError
      || !newsArticle
      || newsArticle.status !== "processed"
      || newsArticle.ai_model === "fallback"
      || newsArticle.duplicate_of !== null
    ) {
      return null;
    }

    return `/news/${newsArticle.slug ?? newsArticle.id}`;
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

    const query = new URLSearchParams();

    if (link.prediction_scope === "qualification") {
      query.set("scope", "qualification");
    }
    query.set("v", String(link.share_image_version ?? 1));

    return `/prediction/${prediction.share_slug}?${query.toString()}`;
  }

  return null;
}

function isMissingNewsSlugError(error: unknown) {
  const message = error && typeof error === "object" && "message" in error
    ? String((error as { message?: unknown }).message ?? "")
    : String(error ?? "");

  return /news_articles\.slug|Could not find.*slug/i.test(message);
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
        share_image_version: target.kind === "prediction" ? target.shareImageVersion : null,
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
      .eq("prediction_scope", target.predictionScope)
      .eq("share_image_version", target.shareImageVersion);
  }

  const { data, error } = await query.maybeSingle();

  return error ? null : data?.code ?? null;
}

function buildShareUrl(code: string) {
  return `${getSiteUrl().replace(/\/+$/, "")}/s/${code}`;
}
