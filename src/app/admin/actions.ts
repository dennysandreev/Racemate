"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";

const allowedJobs = new Set([
  "rss.fetch_all",
  "social.fetch_all",
  "social.fetch_x",
  "social.fetch_reddit",
  "social.fetch_telegram",
  "social.process_ai",
  "social.refresh_metrics",
  "social.retry_failed",
  "reports.check_latest",
  "reports.refresh_due",
  "reports.generate_summary",
  "ai.process_news",
  "ai.reprocess_fallback_news",
  "ai.retag_news",
  "circuit_stats.sync_all",
  "circuit_stats.sync",
  "jolpica.sync_calendar",
  "jolpica.sync_results",
  "jolpica.sync_standings",
  "openf1.sync_sessions",
  "openf1.sync_laps",
  "weather.sync_weekend",
  "predictions.score",
  "race_replay.prepare_current",
  "race_replay.prepare_completed",
]);

export async function triggerJob(formData: FormData) {
  const user = await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const jobName = String(formData.get("jobName") ?? "");
  const sourceId = normalizeOptionalString(formData.get("sourceId"), 64);

  if (!supabase || !allowedJobs.has(jobName)) {
    redirect("/admin");
  }

  const limit = consumeRateLimit("admin:trigger-job", `user:${user.id}`, 10, 60 * 1_000);

  if (!limit.ok) {
    redirect("/admin");
  }

  await supabase.from("job_runs").insert({
    job_name: jobName,
    status: "queued",
    items_processed: 0,
    metadata: { manual: true, ...(sourceId ? { sourceId } : {}) },
  });

  revalidatePath("/admin");
  redirect("/admin?queued=1");
}

export async function toggleSource(formData: FormData) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const sourceId = String(formData.get("sourceId") ?? "");
  const isActive = String(formData.get("isActive") ?? "") === "true";

  if (!supabase || !sourceId) {
    redirect("/admin");
  }

  await supabase
    .from("news_sources")
    .update({ is_active: !isActive })
    .eq("id", sourceId);

  revalidatePath("/admin");
  redirect("/admin?source=1");
}

export async function toggleSocialSource(formData: FormData) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const sourceId = String(formData.get("sourceId") ?? "");
  const isActive = String(formData.get("isActive") ?? "") === "true";

  if (!supabase || !sourceId) {
    redirect("/admin");
  }

  await supabase
    .from("social_sources")
    .update({ is_active: !isActive })
    .eq("id", sourceId);

  revalidatePath("/admin");
  revalidatePath("/social");
  redirect("/admin?social=1");
}

export async function saveSocialSource(formData: FormData) {
  await requireAdmin();
  const supabase = createSupabaseAdminClient();
  const platform = String(formData.get("platform") ?? "");
  const name = normalizeOptionalString(formData.get("name"), 120);
  const rawUrl = normalizeOptionalString(formData.get("url"), 2_048);
  const rawExternalKey = normalizeOptionalString(formData.get("externalKey"), 120);
  const telegramKey = platform === "telegram"
    ? normalizeTelegramSourceKey(rawExternalKey ?? rawUrl)
    : null;
  const url = platform === "telegram"
    ? normalizeTelegramSourceUrl(rawUrl, telegramKey)
    : normalizeUrl(rawUrl ?? "");
  const externalKey = platform === "telegram" ? telegramKey : rawExternalKey;
  const feedKind = String(formData.get("feedKind") ?? "new") === "hot" ? "hot" : "new";
  const trustLevel = ["official", "media", "community"].includes(String(formData.get("trustLevel")))
    ? String(formData.get("trustLevel"))
    : "community";
  const publicationMode = String(formData.get("publicationMode")) === "review" ? "review" : "auto";
  const interval = Math.max(5, Math.min(1440, Number(formData.get("fetchIntervalMinutes")) || 15));
  const initialBackfillDays = Math.max(1, Math.min(365, Number(formData.get("initialBackfillDays")) || 30));
  const requestedAdapter = String(formData.get("adapter") ?? "");

  if (!supabase || !["x", "reddit", "telegram"].includes(platform) || !name || !url || !externalKey) {
    redirect("/admin?social=1");
  }

  const adapter = platform === "x"
    ? requestedAdapter === "rsshub-x-user" ? "rsshub-x-user" : "x-api-user"
    : platform === "reddit"
      ? "reddit-oauth"
      : requestedAdapter === "telegram-bot-webhook" ? "telegram-bot-webhook" : "telegram-mtproto";
  const { data: existingSource } = await supabase
    .from("social_sources")
    .select("metadata")
    .eq("platform", platform)
    .eq("url", url)
    .maybeSingle();
  const existingMetadata = existingSource?.metadata && typeof existingSource.metadata === "object" && !Array.isArray(existingSource.metadata)
    ? existingSource.metadata
    : {};
  await supabase.from("social_sources").upsert({
    platform,
    name,
    url,
    external_key: externalKey.replace(/^@/, ""),
    adapter,
    source_type: adapter === "telegram-bot-webhook" ? "webhook" : "api",
    feed_kind: platform === "reddit" ? feedKind : platform === "x" ? "user" : "channel",
    trust_level: trustLevel,
    publication_mode: publicationMode,
    fetch_interval_minutes: interval,
    initial_backfill_days: initialBackfillDays,
    metadata: { ...existingMetadata, initialBackfillDays },
    include_reposts: String(formData.get("includeReposts")) === "on",
    include_replies: String(formData.get("includeReplies")) === "on",
    next_fetch_at: new Date().toISOString(),
    is_active: true,
  }, { onConflict: "platform,url" });

  revalidatePath("/admin");
  redirect("/admin?social=1");
}

export async function moderateSocialPost(formData: FormData) {
  await requireAdmin();
  const supabase = createSupabaseAdminClient();
  const postId = String(formData.get("postId") ?? "");
  const action = String(formData.get("moderationAction") ?? "");
  const topic = String(formData.get("topic") ?? "");
  const allowedTopics = new Map([
    ["social-upgrades", "Обновления болида"],
    ["social-transfers", "Трансферы и контракты"],
    ["social-technical", "Техника и регламент"],
    ["social-telemetry", "Телеметрия"],
    ["social-race-weekend", "Этап и результаты"],
    ["social-statements", "Комментарии команд и пилотов"],
    ["social-incidents", "Инциденты и штрафы"],
    ["social-rumors", "Слухи"],
    ["social-discussion", "Обсуждения"],
  ]);
  if (!supabase || !postId || !["publish", "reject", "retry"].includes(action)) {
    redirect("/admin?social=1");
  }

  if (topic && allowedTopics.has(topic)) {
    const { data: tag } = await supabase.from("tags").upsert({ type: "social_topic", slug: topic, name: allowedTopics.get(topic)! }, { onConflict: "slug" }).select("id").single();
    if (tag?.id) {
      const { data: existingTopics } = await supabase
        .from("social_post_tags")
        .select("tag_id, tags!inner(type)")
        .eq("post_id", postId)
        .eq("tags.type", "social_topic");
      const topicTagIds = (existingTopics ?? []).map((item) => item.tag_id);
      if (topicTagIds.length) {
        await supabase.from("social_post_tags").delete().eq("post_id", postId).in("tag_id", topicTagIds);
      }
      await supabase.from("social_post_tags").upsert({ post_id: postId, tag_id: tag.id, confidence: 1, method: "admin", is_primary: true }, { onConflict: "post_id,tag_id" });
    }
  }

  if (action === "retry") {
    await supabase.from("social_posts").update({ status: "pending", next_retry_at: new Date().toISOString(), last_processing_error: null }).eq("id", postId);
  } else {
    await supabase.from("social_posts").update({ status: action === "publish" ? "published" : "rejected", next_retry_at: null }).eq("id", postId);
  }
  revalidatePath("/admin");
  revalidatePath("/social");
  redirect("/admin?social=1");
}

export async function addManualXPost(formData: FormData) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const url = normalizeUrl(String(formData.get("url") ?? ""));
  const author = normalizeOptionalString(formData.get("author"), 80);
  const title = normalizeOptionalString(formData.get("title"), 280);
  const imageUrl = normalizeUrl(String(formData.get("imageUrl") ?? ""), true);

  if (!supabase || !url || !isAllowedManualXUrl(url)) {
    redirect("/admin?social=1");
  }

  const { data: source } = await supabase
    .from("social_sources")
    .upsert(
      {
        platform: "x",
        name: "X · ручные посты",
        source_type: "manual",
        url: "manual:x",
        adapter: "manual",
        feed_kind: "manual",
        is_active: true,
      },
      { onConflict: "platform,url" },
    )
    .select("id")
    .single();

  await supabase.from("social_posts").upsert(
    {
      platform: "x",
      source_id: source?.id ?? null,
      external_id: getXPostId(url) ?? url,
      author,
      title: title ?? "Пост из X",
      body: title,
      original_url: url,
      image_url: imageUrl,
      published_at: new Date().toISOString(),
      reaction_count: null,
      popularity_score: 0,
      raw_payload: { manual: true },
      last_synced_at: new Date().toISOString(),
    },
    { onConflict: "platform,external_id" },
  );

  revalidatePath("/admin");
  revalidatePath("/social");
  redirect("/admin?social=1");
}

export async function toggleGrandPrixReportVisibility(formData: FormData) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const reportId = String(formData.get("reportId") ?? "");
  const isHidden = String(formData.get("isHidden") ?? "") === "true";

  if (!supabase || !reportId) {
    redirect("/admin?reports=1");
  }

  await supabase
    .from("grand_prix_reports")
    .update({ is_hidden: !isHidden })
    .eq("id", reportId);

  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/calendar");
  redirect("/admin?reports=1");
}

export async function queueGrandPrixReportReload(formData: FormData) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const reportId = String(formData.get("reportId") ?? "");
  const season = Number(formData.get("season"));
  const round = Number(formData.get("round"));

  if (!supabase || !reportId || !Number.isFinite(season) || !Number.isFinite(round)) {
    redirect("/admin?reports=1");
  }

  await supabase
    .from("grand_prix_reports")
    .update({
      status: "pending",
      summary_status: "pending",
      next_refresh_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", reportId);

  await supabase.from("job_runs").insert({
    job_name: "reports.generate",
    status: "queued",
    items_processed: 0,
    metadata: { manual: true, season, round },
  });

  revalidatePath("/admin");
  redirect("/admin?reports=1");
}

export async function queueGrandPrixReportSummary(formData: FormData) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const reportId = String(formData.get("reportId") ?? "");
  const season = Number(formData.get("season"));
  const round = Number(formData.get("round"));

  if (!supabase || !reportId || !Number.isFinite(season) || !Number.isFinite(round)) {
    redirect("/admin?reports=1");
  }

  await supabase
    .from("grand_prix_reports")
    .update({ summary_status: "pending", last_error: null })
    .eq("id", reportId);

  await supabase.from("job_runs").insert({
    job_name: "reports.generate_summary",
    status: "queued",
    items_processed: 0,
    metadata: { manual: true, season, round },
  });

  revalidatePath("/admin");
  redirect("/admin?reports=1");
}

export async function editGrandPrixReportSummary(formData: FormData) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const reportId = String(formData.get("reportId") ?? "");
  const summary = normalizeOptionalString(formData.get("summary"), 4_000);

  if (!supabase || !reportId) {
    redirect("/admin?reports=1");
  }

  await supabase
    .from("grand_prix_reports")
    .update({
      ai_summary: summary,
      summary_status: summary ? "edited" : "pending",
      status: summary ? "ready" : "partial",
    })
    .eq("id", reportId);

  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/calendar");
  redirect("/admin?reports=1");
}

export async function updateDriverAdminProfile(formData: FormData) {
  await requireAdmin();
  const supabase = await createSupabaseAdminClient();
  const driverId = String(formData.get("driverId") ?? "");
  const slug = normalizeSlug(String(formData.get("slug") ?? ""));
  const permanentNumber = normalizeNumber(formData.get("permanentNumber"));
  const country = normalizeOptionalString(formData.get("country"), 80);
  const countryCode = normalizeCountryCode(formData.get("countryCode"));
  const teamId = normalizeOptionalString(formData.get("teamId"), 80);

  if (!supabase || !driverId || !slug) {
    redirect("/admin?drivers=1");
  }

  await supabase
    .from("drivers")
    .update({
      slug,
      permanent_number: permanentNumber,
      country,
      country_code: countryCode,
      current_team_id: teamId,
      avatar_placeholder_style: normalizeOptionalString(formData.get("avatarPlaceholderStyle"), 32),
    })
    .eq("id", driverId);

  revalidatePath("/admin");
  revalidatePath(`/drivers/${slug}`);
  redirect("/admin?drivers=1");
}

export async function uploadDriverAvatar(formData: FormData) {
  await requireAdmin();
  const supabase = await createSupabaseAdminClient();
  const driverId = String(formData.get("driverId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const file = formData.get("avatar");

  if (!supabase || !driverId || !slug || !(file instanceof File) || file.size === 0) {
    redirect("/admin?drivers=1");
  }

  if (!["image/webp", "image/png", "image/jpeg"].includes(file.type) || file.size > 2_097_152) {
    redirect("/admin?drivers=1");
  }

  const extension = getImageExtension(file.type);
  const path = `${driverId}/${Date.now()}.${extension}`;
  const { error } = await supabase.storage
    .from("driver-avatars")
    .upload(path, file, { contentType: file.type, upsert: true });

  if (!error) {
    const { data } = supabase.storage.from("driver-avatars").getPublicUrl(path);

    await supabase
      .from("drivers")
      .update({ ai_avatar_url: data.publicUrl })
      .eq("id", driverId);
  }

  revalidatePath("/admin");
  revalidatePath(`/drivers/${slug}`);
  redirect("/admin?drivers=1");
}

export async function deleteDriverAvatar(formData: FormData) {
  await requireAdmin();
  const supabase = await createSupabaseAdminClient();
  const driverId = String(formData.get("driverId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const avatarUrl = String(formData.get("avatarUrl") ?? "");

  if (!supabase || !driverId || !slug) {
    redirect("/admin?drivers=1");
  }

  const storagePath = getDriverAvatarStoragePath(avatarUrl);

  if (storagePath) {
    await supabase.storage.from("driver-avatars").remove([storagePath]);
  }

  await supabase
    .from("drivers")
    .update({ ai_avatar_url: null })
    .eq("id", driverId);

  revalidatePath("/admin");
  revalidatePath(`/drivers/${slug}`);
  redirect("/admin?drivers=1");
}

function normalizeOptionalString(value: FormDataEntryValue | null, maxLength = 1_000) {
  const text = typeof value === "string" ? value.trim() : "";
  return text && text.length <= maxLength ? text : null;
}

function normalizeUrl(value: string, optional = false) {
  const text = value.trim();

  if (!text || text.length > 2_048) {
    return optional ? null : "";
  }

  try {
    const url = new URL(text);
    if (url.protocol !== "https:") {
      return optional ? null : "";
    }
    return url.toString();
  } catch {
    return optional ? null : "";
  }
}

function normalizeTelegramSourceKey(value: string | null) {
  const text = value?.trim() ?? "";
  const linkMatch = text.match(/^(?:https?:\/\/)?(?:www\.)?t\.me\/([A-Za-z][A-Za-z0-9_]{3,})(?:[/?#]|$)/i);
  const key = linkMatch?.[1] ?? text.replace(/^@/, "");

  return /^[A-Za-z][A-Za-z0-9_]{3,}$/.test(key) || /^-?\d+$/.test(key) ? key : null;
}

function normalizeTelegramSourceUrl(value: string | null, key: string | null) {
  const normalizedUrl = value ? normalizeUrl(value, true) : null;

  if (normalizedUrl) {
    try {
      const hostname = new URL(normalizedUrl).hostname.toLowerCase();
      if (hostname === "t.me" || hostname === "www.t.me") return normalizedUrl;
    } catch {
      return "";
    }
  }

  if (!key) return "";
  return /^-?\d+$/.test(key) ? `telegram:${key}` : `https://t.me/${key}`;
}

function isAllowedManualXUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    return hostname === "x.com" || hostname.endsWith(".x.com") || hostname === "twitter.com" || hostname.endsWith(".twitter.com");
  } catch {
    return false;
  }
}

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function normalizeNumber(value: FormDataEntryValue | null) {
  const raw = typeof value === "string" ? Number(value) : Number.NaN;

  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

function normalizeCountryCode(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim().toUpperCase() : "";

  return text || null;
}

function getImageExtension(contentType: string) {
  if (contentType === "image/png") {
    return "png";
  }

  if (contentType === "image/jpeg") {
    return "jpg";
  }

  return "webp";
}

function getDriverAvatarStoragePath(publicUrl: string) {
  if (!publicUrl) {
    return null;
  }

  try {
    const url = new URL(publicUrl);
    const marker = "/driver-avatars/";
    const index = url.pathname.indexOf(marker);

    return index >= 0 ? decodeURIComponent(url.pathname.slice(index + marker.length)) : null;
  } catch {
    return null;
  }
}

function getXPostId(url: string) {
  return url.match(/\/status\/(\d+)/i)?.[1] ?? null;
}
