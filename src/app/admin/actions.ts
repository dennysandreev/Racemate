"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const allowedJobs = new Set([
  "rss.fetch_all",
  "social.fetch_all",
  "ai.process_news",
  "ai.retag_news",
  "ai.generate_daily_digest",
  "jolpica.sync_calendar",
  "jolpica.sync_results",
  "jolpica.sync_standings",
  "openf1.sync_sessions",
  "openf1.sync_laps",
  "weather.sync_weekend",
  "predictions.score",
]);

export async function triggerJob(formData: FormData) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const jobName = String(formData.get("jobName") ?? "");

  if (!supabase || !allowedJobs.has(jobName)) {
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
  const author = normalizeOptionalString(formData.get("author"));
  const title = normalizeOptionalString(formData.get("title"));
  const imageUrl = normalizeUrl(String(formData.get("imageUrl") ?? ""), true);

  if (!supabase || !url) {
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

function normalizeOptionalString(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function normalizeUrl(value: string, optional = false) {
  const text = value.trim();

  if (!text) {
    return optional ? null : "";
  }

  try {
    const url = new URL(text);
    return url.toString();
  } catch {
    return optional ? null : "";
  }
}

function getXPostId(url: string) {
  return url.match(/\/status\/(\d+)/i)?.[1] ?? null;
}
