import { createHash } from "node:crypto";

export async function runDailyPublicSmoke(client, options = {}) {
  const { data: latest, error: latestError } = await client
    .from("admin_agent_runs")
    .select("started_at")
    .eq("run_kind", "browser_smoke")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw latestError;
  if (latest && Date.now() - Date.parse(latest.started_at) < 24 * 60 * 60 * 1_000) {
    return { skipped: true, failures: 0, checked: 0 };
  }

  const startedAt = new Date();
  const run = await client
    .from("admin_agent_runs")
    .insert({ run_kind: "browser_smoke", trigger_kind: "schedule", status: "running", ruleset_version: "http-smoke-1" })
    .select("id")
    .single();
  if (run.error) throw run.error;

  try {
    const routes = await loadPublicRoutes(client);
    const baseUrl = (options.baseUrl ?? process.env.OPS_PUBLIC_SMOKE_URL ?? "http://web:3000").replace(/\/$/, "");
    const failures = [];
    for (const route of routes) {
      try {
        const response = await fetch(`${baseUrl}${route}`, {
          headers: { "user-agent": "RaceSide-Public-Smoke/1.0" },
          redirect: "follow",
          signal: AbortSignal.timeout(12_000),
        });
        const body = await response.text();
        if (!response.ok || body.length < 200) failures.push({ route, status: response.status });
      } catch {
        failures.push({ route, status: null });
      }
    }

    const activeIds = [];
    for (const failure of failures) {
      const fingerprint = createHash("sha256").update(`browser-smoke-route:${failure.route}`).digest("hex");
      const finding = await client.rpc("record_admin_finding", {
        p_fingerprint: fingerprint,
        p_category: "browser",
        p_severity: failure.route === "/" ? "P0" : "P1",
        p_title: `Страница ${failure.route} не прошла проверку`,
        p_description: "Публичная страница не вернула ожидаемый успешный ответ.",
        p_evidence: { ruleKey: "browser-smoke-route", route: failure.route, status: failure.status },
        p_route: failure.route,
        p_entity_type: "public_route",
        p_entity_id: failure.route,
      });
      if (finding.error) throw finding.error;
      if (finding.data?.[0]?.finding_id) activeIds.push(finding.data[0].finding_id);
    }
    await resolveRecoveredSmokeFindings(client, activeIds);

    const status = failures.length ? "partial" : "succeeded";
    const update = await client.from("admin_agent_runs").update({
      status,
      counters: { checked: routes.length, failures: failures.length },
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt.getTime(),
    }).eq("id", run.data.id);
    if (update.error) throw update.error;
    return { skipped: false, failures: failures.length, checked: routes.length };
  } catch (error) {
    await client.from("admin_agent_runs").update({
      status: "failed",
      error_code: "public_smoke_failed",
      error_message: (error instanceof Error ? error.message : String(error)).slice(0, 1_000),
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt.getTime(),
    }).eq("id", run.data.id);
    throw error;
  }
}

async function loadPublicRoutes(client) {
  const [article, driver] = await Promise.all([
    client.from("news_articles").select("slug").eq("publication_status", "published").not("slug", "is", null).order("published_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("drivers").select("slug").eq("is_active", true).not("slug", "is", null).limit(1).maybeSingle(),
  ]);
  for (const result of [article, driver]) if (result.error) throw result.error;
  return [
    "/",
    "/news",
    article.data?.slug ? `/news/${article.data.slug}` : null,
    "/calendar",
    "/weekend",
    "/leaderboard",
    "/teams",
    driver.data?.slug ? `/drivers/${driver.data.slug}` : null,
    "/social",
    "/fantasy",
    "/polls",
    "/auth",
  ].filter(Boolean);
}

async function resolveRecoveredSmokeFindings(client, activeIds) {
  const { data, error } = await client
    .from("admin_findings")
    .select("id, evidence")
    .eq("entity_type", "public_route")
    .in("status", ["open", "acknowledged", "monitoring"])
    .limit(100);
  if (error) throw error;
  const active = new Set(activeIds);
  for (const finding of data ?? []) {
    if (finding.evidence?.ruleKey !== "browser-smoke-route" || active.has(finding.id)) continue;
    const result = await client.rpc("transition_admin_finding", {
      p_finding_id: finding.id,
      p_status: "resolved",
      p_actor_kind: "system",
      p_resolution: "Страница снова проходит ежедневную проверку.",
    });
    if (result.error) throw result.error;
  }
}
