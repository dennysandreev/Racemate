"use server";

import { createHash } from "node:crypto";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { consumeIpRateLimit, consumeRateLimit } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  escapeSupportTelegramHtml,
  sendSupportTelegramMessage,
} from "@/lib/support-telegram";

const allowedReactions = new Set(["🔥", "🏁", "👀", "🤔"]);

export type NewsErrorReportState = {
  ok: boolean;
  message: string;
};

export async function reportNewsErrorAction(
  _previousState: NewsErrorReportState,
  formData: FormData,
): Promise<NewsErrorReportState> {
  const message = String(formData.get("message") ?? "").trim();
  const articleId = String(formData.get("articleId") ?? "").trim();
  const articleSlug = String(formData.get("articleSlug") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(articleId) || message.length < 10 || message.length > 2_000) {
    return { ok: false, message: "Опиши ошибку чуть подробнее, от 10 до 2000 символов." };
  }

  const rateLimit = await consumeIpRateLimit("news:error-report", null, 5, 60 * 60 * 1_000);
  if (!rateLimit.ok) {
    return { ok: false, message: "Слишком много сообщений. Попробуй снова через час." };
  }

  const headerList = await headers();
  const userAgent = headerList.get("user-agent")?.slice(0, 500) ?? null;
  const referrerPath = toSafePath(headerList.get("referer"));
  const pagePath = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(articleSlug)
    ? `/news/${articleSlug}`
    : `/news/${articleId}`;
  const requestFingerprint = makeRequestFingerprint(headerList, userAgent);
  const releaseSha = normalizeRelease(
    process.env.RACESIDE_RELEASE_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA,
  );
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Сообщение не отправлено. Попробуй ещё раз позже." };
  }
  const { data: reportId, error } = await supabase.rpc("submit_news_error_report", {
    p_article_id: articleId,
    p_message: message,
    p_page_path: pagePath,
    p_user_agent: userAgent,
    p_referrer_path: referrerPath,
    p_request_fingerprint: requestFingerprint,
    p_release_sha: releaseSha,
    p_technical_context: {
      acceptLanguage: headerList.get("accept-language")?.slice(0, 200) ?? null,
      requestId: headerList.get("x-request-id")?.slice(0, 120) ?? null,
    },
  });

  if (error || !reportId) {
    const rateLimited = error?.message?.includes("report_rate_limited");
    return {
      ok: false,
      message: rateLimited
        ? "Слишком много сообщений. Попробуй снова через час."
        : "Сообщение не отправлено. Попробуй ещё раз позже.",
    };
  }

  await deliverNewsErrorReport(supabase, reportId, {
    articleId,
    message,
    pagePath,
    releaseSha,
    userAgent,
  });
  revalidatePath("/admin/issues");
  return { ok: true, message: "Спасибо. Сообщение сохранено и отправлено команде RaceSide." };
}

async function deliverNewsErrorReport(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  reportId: string,
  input: {
    articleId: string;
    message: string;
    pagePath: string;
    releaseSha: string | null;
    userAgent: string | null;
  },
) {
  if (!supabase) return;
  const [{ data: article }, { data: authData }] = await Promise.all([
    supabase
      .from("news_articles")
      .select("ai_title_ru, original_title, source_id")
      .eq("id", input.articleId)
      .eq("publication_status", "published")
      .maybeSingle(),
    supabase.auth.getUser(),
  ]);
  const { data: source } = article?.source_id
    ? await supabase.from("news_sources").select("name").eq("id", article.source_id).maybeSingle()
    : { data: null };
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://raceside.online").replace(/\/$/, "");
  const text = [
    "🛠 <b>Ошибка в новости</b>",
    "",
    `<b>Материал:</b> ${escapeSupportTelegramHtml(article?.ai_title_ru ?? article?.original_title ?? "Новость RaceSide")}`,
    `<b>Источник:</b> ${escapeSupportTelegramHtml(source?.name ?? "Не указан")}`,
    `<b>Сообщение:</b> ${escapeSupportTelegramHtml(input.message)}`,
    "",
    `<b>Страница:</b> ${escapeSupportTelegramHtml(input.pagePath)}`,
    `<b>Браузер:</b> ${escapeSupportTelegramHtml(input.userAgent ?? "Не определён")}`,
    `<b>Версия:</b> ${escapeSupportTelegramHtml(input.releaseSha ?? "Не указана")}`,
    `<b>Вход выполнен:</b> ${authData.user ? "да" : "нет"}`,
    `<b>Запись:</b> ${escapeSupportTelegramHtml(reportId.slice(0, 8))}`,
  ].join("\n");
  const delivery = await sendSupportTelegramMessage({
    text,
    replyMarkup: {
      inline_keyboard: [[{ text: "Открыть сообщения", url: `${siteUrl}/admin/issues` }]],
    },
  });
  await supabase.rpc("finish_news_error_report_delivery", {
    p_report_id: reportId,
    p_status: delivery.status,
    p_error: delivery.ok ? null : delivery.reason.slice(0, 500),
  });
}

function makeRequestFingerprint(headerList: Awaited<ReturnType<typeof headers>>, userAgent: string | null) {
  const forwardedFor = headerList.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = headerList.get("cf-connecting-ip")?.trim()
    ?? headerList.get("x-real-ip")?.trim()
    ?? forwardedFor
    ?? "unknown";
  return createHash("sha256")
    .update(`${ip}\n${userAgent ?? "unknown"}`)
    .digest("hex");
}

function toSafePath(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}`.slice(0, 500);
  } catch {
    return null;
  }
}

function normalizeRelease(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized && /^[0-9a-f]{7,64}$/.test(normalized) ? normalized : null;
}

export async function reactToArticle(formData: FormData) {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect("/news");
  }

  const limit = consumeRateLimit("news:reaction", `user:${user.id}`, 60, 60 * 1_000);

  if (!limit.ok) {
    redirect("/news");
  }

  const articleId = String(formData.get("articleId") ?? "");
  const articleSlug = String(formData.get("articleSlug") ?? "");
  const reaction = String(formData.get("reaction") ?? "");

  if (!articleId || !allowedReactions.has(reaction)) {
    redirect("/news");
  }

  const articlePath = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(articleSlug)
    ? `/news/${articleSlug}`
    : `/news/${articleId}`;

  const { data: existing } = await supabase
    .from("article_reactions")
    .select("reaction")
    .eq("article_id", articleId)
    .eq("user_id", user.id)
    .eq("reaction", reaction)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("article_reactions")
      .delete()
      .eq("article_id", articleId)
      .eq("user_id", user.id)
      .eq("reaction", reaction);
  } else {
    await supabase.from("article_reactions").insert({
      article_id: articleId,
      user_id: user.id,
      reaction,
    });
  }

  revalidatePath("/news");
  revalidatePath(articlePath);
  redirect(articlePath);
}
