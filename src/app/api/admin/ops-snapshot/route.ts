import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireAdmin();
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 503 });
  }

  const [findings, runs, heartbeats, queuedJobs, failedJobs] = await Promise.all([
    admin
      .from("admin_findings")
      .select("id, severity, status, category, title, route, last_seen_at, occurrence_count")
      .in("status", ["open", "acknowledged", "action_pending", "fixing", "monitoring"])
      .order("last_seen_at", { ascending: false })
      .limit(50),
    admin
      .from("admin_agent_runs")
      .select("id, run_kind, status, counters, ruleset_version, started_at, finished_at, duration_ms, error_code")
      .order("started_at", { ascending: false })
      .limit(20),
    admin
      .from("ops_service_heartbeats")
      .select("service_name, status, release_sha, checked_at")
      .order("checked_at", { ascending: false })
      .limit(30),
    admin.from("job_runs").select("id", { count: "exact", head: true }).eq("status", "queued"),
    admin.from("job_runs").select("id", { count: "exact", head: true }).eq("status", "failed"),
  ]);
  const error = [findings.error, runs.error, heartbeats.error, queuedJobs.error, failedJobs.error].find(Boolean);
  if (error) {
    return NextResponse.json({ ok: false, error: "snapshot_unavailable" }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    checkedAt: new Date().toISOString(),
    counts: {
      activeFindings: findings.data?.length ?? 0,
      failedJobs: failedJobs.count ?? 0,
      queuedJobs: queuedJobs.count ?? 0,
    },
    findings: findings.data ?? [],
    heartbeats: heartbeats.data ?? [],
    runs: runs.data ?? [],
  }, {
    headers: {
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
