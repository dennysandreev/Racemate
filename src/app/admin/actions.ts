"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const allowedJobs = new Set([
  "rss.fetch_all",
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
