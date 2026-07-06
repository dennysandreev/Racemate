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
    metadata: { manual: true },
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
