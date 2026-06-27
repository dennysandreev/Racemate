import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

import { createClient } from "@supabase/supabase-js";

import { scoreFantasyPrediction } from "./fantasy-scoring.mjs";

loadEnvFiles([".env", ".env.local"]);

const commands = new Map([
  ["rss.fetch_all", fetchAllRss],
  ["social.fetch_all", fetchAllSocial],
  ["social.fetch_reddit", fetchRedditSocial],
  ["social.fetch_x", fetchXSocial],
  ["reports.check_latest", checkLatestGrandPrixReport],
  ["reports.generate", generateGrandPrixReport],
  ["reports.generate_all_completed", generateAllCompletedGrandPrixReports],
  ["reports.generate_summary", generateGrandPrixReportSummary],
  ["reports.refresh_due", refreshDueGrandPrixReports],
  ["ai.process_news", processNewsWithAi],
  ["ai.reprocess_fallback_news", reprocessFallbackNewsWithAi],
  ["ai.rehighlight_news", rehighlightNewsWithAi],
  ["news.backfill_source_images", backfillNewsSourceImages],
  ["ai.retag_news", retagNewsWithAi],
  ["ai.generate_daily_digest", generateDailyDigest],
  ["polls.generate_next_race", generateNextRacePolls],
  ["jolpica.sync_calendar", syncCalendar],
  ["jolpica.sync_results", syncResults],
  ["jolpica.repair_race_results", repairRaceResults],
  ["jolpica.repair_qualifying_results", repairQualifyingResults],
  ["jolpica.sync_standings", syncStandings],
  ["openf1.sync_sessions", syncOpenF1Sessions],
  ["openf1.sync_laps", syncOpenF1Laps],
  ["weather.sync_weekend", syncWeekendWeather],
  ["predictions.score", scorePredictions],
]);

const command = process.argv[2];

if (!commands.has(command)) {
  console.log(`Usage: node worker/index.mjs ${Array.from(commands.keys()).join("|")}`);
  process.exit(command ? 1 : 0);
}

const supabase = createWorkerClient();
const openF1SessionsByYear = new Map();
const pollKinds = ["sport", "strategy", "fan"];
await runJob(command, commands.get(command));

function loadEnvFiles(paths) {
  for (const path of paths) {
    if (!existsSync(path)) {
      continue;
    }

    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }

      const index = trimmed.indexOf("=");
      const name = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");

      if (name && process.env[name] === undefined) {
        process.env[name] = value;
      }
    }
  }
}

function createWorkerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing for worker");
  }

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing for worker writes");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function runJob(jobName, runner) {
  const { data: job, error } = await supabase
    .from("job_runs")
    .insert({
      job_name: jobName,
      status: "running",
      items_processed: 0,
      metadata: { cli: true },
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  try {
    const result = await runner();
    await supabase
      .from("job_runs")
      .update({
        status: "success",
        finished_at: new Date().toISOString(),
        items_processed: result.itemsProcessed ?? 0,
        metadata: result.metadata ?? {},
      })
      .eq("id", job.id);
  } catch (jobError) {
    await supabase
      .from("job_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error_message: jobError instanceof Error ? jobError.message : String(jobError),
      })
      .eq("id", job.id);
    throw jobError;
  }
}

async function fetchAllRss() {
  const { data: sources, error } = await supabase
    .from("news_sources")
    .select("id, name, source_type, url, language")
    .eq("is_active", true);

  if (error) {
    throw error;
  }

  let itemsProcessed = 0;

  for (const source of sources ?? []) {
    try {
      const response = await fetch(source.url, {
        headers: { "user-agent": "RaceMate/0.1 (+https://racemate.local)" },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const xml = await response.text();
      const items = filterRssItemsForSource(parseRss(xml), source).slice(
        0,
        Number(process.env.AI_MAX_ARTICLES_PER_RUN ?? 50),
      );

      for (const item of items) {
        const canonicalUrl = item.link || item.guid;

        if (!canonicalUrl || !item.title) {
          continue;
        }

        const { error: articleError } = await supabase
          .from("news_articles")
          .upsert(
            {
              source_id: source.id,
              canonical_url: canonicalUrl,
              original_url: item.link,
              original_title: item.title,
              original_description: item.description,
              original_language: source.language,
              published_at: item.pubDate,
              source_image_url: item.imageUrl,
              status: "pending",
              raw_payload: item,
            },
            { onConflict: "canonical_url", ignoreDuplicates: true },
          );

        if (!articleError) {
          itemsProcessed += 1;
          if (item.imageUrl) {
            await supabase
              .from("news_articles")
              .update({ source_image_url: item.imageUrl })
              .eq("canonical_url", canonicalUrl)
              .is("source_image_url", null);
          }
        }
      }

      await supabase
        .from("news_sources")
        .update({
          last_fetched_at: new Date().toISOString(),
          last_success_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", source.id);
    } catch (sourceError) {
      await supabase
        .from("news_sources")
        .update({
          last_fetched_at: new Date().toISOString(),
          last_error: sourceError instanceof Error ? sourceError.message : String(sourceError),
        })
        .eq("id", source.id);
    }
  }

  return { itemsProcessed };
}

async function fetchAllSocial() {
  await ensureSocialSources({ platform: "x" });
  return fetchSocialSources({ platform: "x" });
}

async function fetchRedditSocial() {
  return {
    itemsProcessed: 0,
    metadata: {
      platform: "reddit",
      disabled: true,
    },
  };
}

async function fetchXSocial() {
  await ensureSocialSources({ platform: "x" });
  return fetchSocialSources({ platform: "x" });
}

async function ensureSocialSources({ platform } = {}) {
  const defaults = [];

  if (!platform || platform === "x") {
    for (const account of getXAccountsFromEnv()) {
      const handle = getXHandle(account);

      if (!handle) {
        continue;
      }

      defaults.push({
        platform: "x",
        name: `X · @${handle}`,
        source_type: "rss",
        url: `https://x.com/${handle}`,
        adapter: "rsshub-x-user",
        feed_kind: "user",
        fetch_interval_minutes: 15,
      });
    }
  }

  if (!defaults.length) {
    return;
  }

  const { error } = await supabase
    .from("social_sources")
    .upsert(defaults, { onConflict: "platform,url" });

  if (error) {
    throw error;
  }
}

async function fetchSocialSources({ platform } = {}) {
  let query = supabase
    .from("social_sources")
    .select("id, platform, name, url, adapter, feed_kind")
    .eq("is_active", true);

  if (platform) {
    query = query.eq("platform", platform);
  }

  const { data: sources, error } = await query.order("platform").order("name");

  if (error) {
    throw error;
  }

  let itemsProcessed = 0;

  for (const source of sources ?? []) {
    try {
      const feedUrl = getSocialFeedUrl(source);
      const response = await fetch(feedUrl, {
        headers: {
          accept: "application/rss+xml, application/atom+xml, text/xml;q=0.9, */*;q=0.8",
          "user-agent": "RaceMate/1.0 by racemate.ru",
        },
      });
      const xml = await response.text();

      logSocialFeedDiagnostics({
        contentType: response.headers.get("content-type"),
        feedUrl,
        source,
        status: `${response.status} ${response.statusText}`.trim(),
        xml,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const items = parseFeedItems(xml).slice(0, Number(process.env.SOCIAL_MAX_POSTS_PER_SOURCE ?? 30));

      for (const [index, item] of items.entries()) {
        const post = mapSocialFeedItem(source, item, index);

        if (!post) {
          continue;
        }

        const saved = await upsertSocialPost(post);

        if (saved) {
          itemsProcessed += 1;
        }
      }

      await supabase
        .from("social_sources")
        .update({
          last_fetched_at: new Date().toISOString(),
          last_success_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", source.id);
    } catch (sourceError) {
      await supabase
        .from("social_sources")
        .update({
          last_fetched_at: new Date().toISOString(),
          last_error: sourceError instanceof Error ? sourceError.message : String(sourceError),
        })
        .eq("id", source.id);
    }
  }

  return {
    itemsProcessed,
    metadata: {
      platform: platform ?? "all",
    },
  };
}

function getSocialFeedUrl(source) {
  if (source.adapter === "reddit-rss") {
    return source.url;
  }

  if (source.adapter === "rsshub-x-user") {
    const baseUrl = process.env.SOCIAL_X_RSSHUB_BASE_URL?.replace(/\/+$/, "");
    const handle = getXHandle(source.url);

    if (!baseUrl) {
      throw new Error("SOCIAL_X_RSSHUB_BASE_URL is missing for X social sync");
    }

    if (!handle) {
      throw new Error(`Cannot parse X handle from ${source.url}`);
    }

    return `${baseUrl}/twitter/user/${handle}/count=20&addLinkForPics=1&readable=1`;
  }

  throw new Error(`Unsupported social adapter: ${source.adapter}`);
}

function logSocialFeedDiagnostics({ contentType, feedUrl, source, status, xml }) {
  const items = getFeedItemBlocks(xml);

  console.log(
    JSON.stringify({
      event: "social.feed.fetch",
      source: source.name,
      platform: source.platform,
      url: sanitizeDiagnosticText(feedUrl),
      status,
      contentType,
      itemCount: items.length,
      items: items.map((item, index) => ({
        index,
        guid: sanitizeDiagnosticText(cleanXml(readTag(item, "guid") || readTag(item, "id"))),
        link: sanitizeDiagnosticText(cleanXml(readLinkHref(item) || readTag(item, "link"))),
        hasExtendedMediaUrl: extractFeedImage(item) !== null,
        imageUrl: sanitizeDiagnosticText(extractFeedImage(item)),
      })),
      rawRssPreview: sanitizeDiagnosticText(xml).slice(0, 1000),
    }),
  );
}

function getFeedItemBlocks(xml) {
  const rssItems = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => match[0]);

  if (rssItems.length) {
    return rssItems;
  }

  return [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((match) => match[0]);
}

function getXAccountsFromEnv() {
  const accounts = process.env.SOCIAL_X_ACCOUNTS?.trim() || "https://x.com/F1TelemetryData";

  return accounts
    .split(",")
    .map((account) => account.trim())
    .filter(Boolean);
}

function getXHandle(value) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    return null;
  }

  const withoutAt = normalized.replace(/^@/, "");
  const match =
    withoutAt.match(/(?:x\.com|twitter\.com)\/([A-Za-z0-9_]+)/i)?.[1] ??
    withoutAt.match(/^([A-Za-z0-9_]{1,30})$/)?.[1];

  return match && !["i", "intent", "share", "home", "search"].includes(match.toLowerCase())
    ? match
    : null;
}

function mapSocialFeedItem(source, item, index) {
  const originalUrl = normalizeSocialUrl(item.link || item.guid || item.id);

  if (!originalUrl) {
    return null;
  }

  const externalId =
    source.platform === "x"
      ? getXPostId(originalUrl) ?? originalUrl
      : getRedditPostId(originalUrl, item.guid || item.id) ?? originalUrl;
  const title = normalizeString(item.title) ?? normalizeString(item.description) ?? "Пост без заголовка";
  const body = normalizeString(item.content) ?? normalizeString(item.description);
  const reactionCount = numberOrNull(item.reactionCount);
  const popularityScore =
    reactionCount ??
    (source.platform === "reddit" && source.feed_kind === "hot" ? 1000 - index : 0);

  return {
    platform: source.platform,
    source_id: source.id,
    external_id: externalId,
    author: normalizeSocialAuthor(item.author, source),
    title,
    body: body && body !== title ? body : null,
    original_url: originalUrl,
    image_url: item.imageUrl ?? null,
    published_at: item.pubDate ?? new Date().toISOString(),
    reaction_count: reactionCount,
    popularity_score: popularityScore,
    raw_payload: item,
    last_synced_at: new Date().toISOString(),
  };
}

function normalizeSocialUrl(value) {
  const raw = normalizeString(value);

  if (!raw) {
    return null;
  }

  try {
    const url = new URL(raw);

    url.hash = "";
    return url.toString();
  } catch {
    return raw.startsWith("http") ? raw : null;
  }
}

function getXPostId(url) {
  return String(url).match(/\/status\/(\d+)/i)?.[1] ?? null;
}

function getRedditPostId(url, fallback) {
  return (
    String(url).match(/\/comments\/([a-z0-9]+)/i)?.[1] ??
    String(fallback ?? "").match(/t3_([a-z0-9]+)/i)?.[1] ??
    null
  );
}

function normalizeSocialAuthor(author, source) {
  const value = normalizeString(author);

  if (value) {
    return value.replace(/^\/?u\//i, "u/");
  }

  if (source.platform === "x") {
    const handle = getXHandle(source.url);
    return handle ? `@${handle}` : "X";
  }

  return "r/formuladank";
}

async function upsertSocialPost(post) {
  const { error } = await supabase
    .from("social_posts")
    .upsert(post, { onConflict: "platform,external_id" });

  if (!error) {
    return true;
  }

  if (error.code === "23505" && post.original_url) {
    const { error: updateError } = await supabase
      .from("social_posts")
      .update({
        ...post,
        updated_at: new Date().toISOString(),
      })
      .eq("original_url", post.original_url);

    return !updateError;
  }

  return false;
}

async function checkLatestGrandPrixReport() {
  const race = await findLatestCompletedRaceForReport();

  if (!race) {
    return { itemsProcessed: 0, metadata: { reason: "no_completed_race_with_results" } };
  }

  return generateGrandPrixReportForRace(race);
}

async function generateGrandPrixReport() {
  const season = numberOrNull(getCliOption("season"));
  const round = numberOrNull(getCliOption("round"));
  const race =
    season && round
      ? await getRaceForReport(season, round)
      : await findLatestCompletedRaceForReport();

  if (!race) {
    return { itemsProcessed: 0, metadata: { reason: "race_not_found_or_not_ready", season, round } };
  }

  return generateGrandPrixReportForRace(race, { force: true });
}

async function generateGrandPrixReportSummary() {
  const season = numberOrNull(getCliOption("season"));
  const round = numberOrNull(getCliOption("round"));
  let query = supabase
    .from("grand_prix_reports")
    .select("*")
    .in("status", ["ready", "partial", "summary_pending"]);

  if (season && round) {
    query = query.eq("season", season).eq("round", round);
  } else {
    query = query
      .in("summary_status", ["pending", "failed"])
      .order("race_date", { ascending: false, nullsFirst: false })
      .limit(1);
  }

  const { data, error } = await query.maybeSingle();

  if (error || !data) {
    return { itemsProcessed: 0, metadata: { reason: error?.message ?? "report_not_found" } };
  }

  const updated = await updateGrandPrixReportSummary(data);

  return { itemsProcessed: updated ? 1 : 0, metadata: { raceSlug: data.race_slug } };
}

async function generateAllCompletedGrandPrixReports() {
  const season = numberOrNull(getCliOption("season")) ?? Number(process.env.F1_SEASON ?? new Date().getUTCFullYear());
  const races = await findCompletedRacesReadyForReports(season, { requireDelay: false });
  let itemsProcessed = 0;

  for (const race of races) {
    const result = await generateGrandPrixReportForRace(race);
    itemsProcessed += result.itemsProcessed ?? 0;
  }

  return {
    itemsProcessed,
    metadata: {
      season,
      rounds: races.map((race) => race.round),
    },
  };
}

async function refreshDueGrandPrixReports() {
  const { data, error } = await supabase
    .from("grand_prix_reports")
    .select("season, round")
    .in("status", ["ready", "partial", "summary_pending"])
    .not("next_refresh_at", "is", null)
    .lte("next_refresh_at", new Date().toISOString())
    .order("next_refresh_at", { ascending: true })
    .limit(Number(process.env.REPORTS_REFRESH_LIMIT ?? 3));

  if (error) {
    throw error;
  }

  let itemsProcessed = 0;

  for (const report of data ?? []) {
    const race = await getRaceForReport(Number(report.season), Number(report.round));

    if (!race) {
      continue;
    }

    await generateGrandPrixReportForRace(race, { force: true });
    itemsProcessed += 1;
  }

  return { itemsProcessed };
}

async function generateGrandPrixReportForRace(race, { force = false } = {}) {
  const existing = await getExistingGrandPrixReport(race.season_year, race.round);

  if (!force && !shouldGenerateGrandPrixReport(existing)) {
    return {
      itemsProcessed: 0,
      metadata: { race: race.race_name, reason: "report_already_current", skipped: true },
    };
  }

  await upsertReportStatus(race, "collecting");

  const raceSession = await getRaceSessionForReport(race.id);
  const resultRows = raceSession ? await getRaceResultRows(raceSession.id) : [];

  if (!raceSession || !hasFinalRaceResults(resultRows)) {
    await upsertReportFailure(race, "Итоговые результаты гонки еще не готовы.");
    return { itemsProcessed: 0, metadata: { race: race.race_name, ready: false } };
  }

  await upsertReportStatus(race, "processing");

  const sourceErrors = {};
  const openF1 = await collectOpenF1ReportData(raceSession.openf1_session_key, sourceErrors);
  const fastF1Result = collectFastF1ReportData(race.season_year, race.round);
  let fastF1 = fastF1Result.data;

  if (!hasLapMetrics(fastF1)) {
    const openF1LapMetrics = buildOpenF1LapMetrics(openF1.laps ?? []);

    if (hasLapMetrics(openF1LapMetrics)) {
      fastF1 = openF1LapMetrics;
    } else if (fastF1Result.error) {
      sourceErrors.fastf1 = fastF1Result.error;
    }
  }

  const newsSummary = await getRaceNewsSummaryForReport(race.id);
  const structured = buildGrandPrixReportStructuredData(
    race,
    raceSession,
    resultRows,
    openF1,
    fastF1,
    sourceErrors,
    newsSummary,
  );
  const structuredHash = hashJson({
    race_statistics: structured.race_statistics,
    results: structured.results,
    key_events: structured.key_events,
    pit_stops: structured.pit_stops,
    strategies: structured.strategies,
    teammate_comparisons: structured.teammate_comparisons,
    highlights: structured.highlights,
    news_summary: structured.news_summary,
    championship_impact: structured.championship_impact,
  });
  const summaryStatus =
    existing?.structured_hash && existing.structured_hash !== structuredHash
      ? "pending"
      : existing?.summary_status ?? "pending";
  const status = Object.keys(sourceErrors).length ? "partial" : "summary_pending";
  const nextRefresh = getNextReportRefreshAt(existing?.refresh_stage ?? -1);

  const { data: report, error } = await supabase
    .from("grand_prix_reports")
    .upsert(
      {
        season: race.season_year,
        round: race.round,
        race_slug: makeRaceReportSlug(race.season_year, race.race_name),
        race_name: race.race_name,
        circuit_name: getRelationObject(race.circuits)?.name ?? null,
        country: getRelationObject(race.circuits)?.country ?? null,
        race_date: race.race_start_at,
        status,
        source_updated_at: new Date().toISOString(),
        generated_at: new Date().toISOString(),
        summary_status: summaryStatus,
        weather: structured.weather,
        race_statistics: structured.race_statistics,
        results: structured.results,
        key_events: structured.key_events,
        pit_stops: structured.pit_stops,
        strategies: structured.strategies,
        teammate_comparisons: structured.teammate_comparisons,
        highlights: structured.highlights,
        news_summary: structured.news_summary,
        championship_impact: structured.championship_impact,
        source_errors: sourceErrors,
        last_error: null,
        refresh_stage: nextRefresh.stage,
        next_refresh_at: nextRefresh.nextRefreshAt,
        structured_hash: structuredHash,
      },
      { onConflict: "season,round" },
    )
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  const summaryUpdated = await updateGrandPrixReportSummary(report);

  return {
    itemsProcessed: 1,
    metadata: {
      raceSlug: report.race_slug,
      status: report.status,
      summaryUpdated,
      sourceErrors,
    },
  };
}

function shouldGenerateGrandPrixReport(report) {
  if (!report) {
    return true;
  }

  return (
    ["pending", "collecting", "processing", "summary_pending", "failed"].includes(report.status) ||
    ["pending", "failed"].includes(report.summary_status)
  );
}

async function findLatestCompletedRaceForReport() {
  const races = await findCompletedRacesReadyForReports(undefined, { requireDelay: true, limit: 12 });

  return races[0] ?? null;
}

async function findCompletedRacesReadyForReports(season, { requireDelay = true, limit = 80 } = {}) {
  const { data, error } = await supabase
    .from("races")
    .select("id, season_year, round, race_name, race_start_at, status, circuits(name, country)")
    .order("race_start_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  const now = Date.now();
  const ready = [];

  for (const race of data ?? []) {
    if (season && Number(race.season_year) !== season) {
      continue;
    }

    const raceTime = race.race_start_at ? new Date(race.race_start_at).getTime() : 0;

    if (requireDelay && (!raceTime || now - raceTime < 27 * 60 * 60 * 1000)) {
      continue;
    }

    const session = await getRaceSessionForReport(race.id);
    const results = session ? await getRaceResultRows(session.id) : [];

    if (session && hasFinalRaceResults(results)) {
      ready.push(race);
    }
  }

  return ready.sort(
    (a, b) =>
      new Date(b.race_start_at ?? 0).getTime() -
      new Date(a.race_start_at ?? 0).getTime(),
  );
}

async function getRaceForReport(season, round) {
  const { data, error } = await supabase
    .from("races")
    .select("id, season_year, round, race_name, race_start_at, status, circuits(name, country)")
    .eq("season_year", season)
    .eq("round", round)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

async function getRaceSessionForReport(raceId) {
  const { data, error } = await supabase
    .from("sessions")
    .select("id, openf1_session_key, start_at")
    .eq("race_id", raceId)
    .eq("session_type", "race")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

async function getRaceResultRows(sessionId) {
  const { data, error } = await supabase
    .from("session_results")
    .select("position, grid, laps, points, status, time_text, raw_payload, drivers(full_name, permanent_number), teams(name)")
    .eq("session_id", sessionId)
    .order("position", { ascending: true, nullsFirst: false });

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function getRaceNewsSummaryForReport(raceId) {
  if (!raceId) {
    return { articles: [] };
  }

  const { data } = await supabase
    .from("news_articles")
    .select("ai_title_ru, original_title, ai_summary_ru, ai_summary_long_ru, published_at")
    .eq("status", "processed")
    .eq("related_race_id", raceId)
    .is("duplicate_of", null)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(Number(process.env.REPORT_NEWS_LIMIT ?? 8));

  return {
    articles: (data ?? []).map((article) => ({
      title: article.ai_title_ru ?? article.original_title,
      summary: article.ai_summary_ru ?? article.ai_summary_long_ru ?? null,
      publishedAt: article.published_at ?? null,
    })),
  };
}

function hasFinalRaceResults(results) {
  return (
    (results ?? []).length >= 10 &&
    results.some((result) => Number(result.position) === 1) &&
    results.some((result) => Number(result.points) > 0)
  );
}

async function collectOpenF1ReportData(sessionKey, sourceErrors) {
  if (!sessionKey) {
    sourceErrors.openf1 = "У гонки нет openf1_session_key.";
    return {};
  }

  const baseUrl = process.env.OPENF1_BASE_URL ?? "https://api.openf1.org/v1";
  const endpoints = {
    laps: "laps",
    pits: "pit",
    stints: "stints",
    positions: "position",
    raceControl: "race_control",
    weather: "weather",
  };
  const result = {};

  for (const [key, endpoint] of Object.entries(endpoints)) {
    try {
      result[key] = await fetchJson(`${baseUrl}/${endpoint}?session_key=${sessionKey}`);
    } catch (error) {
      sourceErrors[`openf1_${key}`] = error instanceof Error ? error.message : String(error);
      result[key] = [];
    }
  }

  return result;
}

function collectFastF1ReportData(season, round) {
  const python = process.env.FASTF1_PYTHON_BIN ?? "python3";
  const script = "worker/fastf1/report_metrics.py";

  if (!existsSync(script)) {
    return { data: {}, error: "FastF1 script is missing." };
  }

  const result = spawnSync(python, [script, String(season), String(round)], {
    encoding: "utf8",
    timeout: Number(process.env.FASTF1_TIMEOUT_MS ?? 60_000),
  });

  if (result.error || result.status !== 0) {
    return { data: {}, error: result.error?.message ?? result.stderr?.trim() ?? "FastF1 failed." };
  }

  return { data: safeJson(result.stdout) ?? {}, error: null };
}

function hasLapMetrics(value) {
  return Boolean(Object.keys(value?.driversByNumber ?? value?.drivers ?? {}).length);
}

function buildOpenF1LapMetrics(laps) {
  const byNumber = new Map();

  for (const lap of laps ?? []) {
    const driverNumber = numberOrNull(lap.driver_number);
    const lapDuration = numberOrNull(lap.lap_duration);

    if (!driverNumber || lapDuration === null) {
      continue;
    }

    const key = String(driverNumber);
    const driverLaps = byNumber.get(key) ?? [];
    driverLaps.push({
      lapDuration,
      isPitOutLap: Boolean(lap.is_pit_out_lap),
    });
    byNumber.set(key, driverLaps);
  }

  const driversByNumber = {};

  for (const [driverNumber, driverLaps] of byNumber.entries()) {
    const timedLaps = driverLaps.map((lap) => lap.lapDuration).filter(Number.isFinite);
    const cleanLaps = driverLaps
      .filter((lap) => !lap.isPitOutLap)
      .map((lap) => lap.lapDuration)
      .filter(Number.isFinite);
    const sample = cleanLaps.length ? cleanLaps : timedLaps;

    if (!sample.length) {
      continue;
    }

    driversByNumber[driverNumber] = {
      driverNumber: Number(driverNumber),
      bestLapSeconds: roundNumber(Math.min(...sample), 3),
      medianLapSeconds: medianNumber(sample),
      laps: driverLaps.length,
      quickLaps: cleanLaps.length,
    };
  }

  return {
    source: "openf1",
    drivers: driversByNumber,
    driversByNumber,
  };
}

function buildGrandPrixReportStructuredData(race, raceSession, resultRows, openF1, fastF1, sourceErrors, newsSummary) {
  const tyreStintsByDriver = getTyreStintsByDriverNumber(openF1.stints ?? []);
  const results = mapReportResults(resultRows, openF1.laps ?? [], tyreStintsByDriver);
  const pitStops = mapReportPitStops(openF1.pits ?? [], results);
  const strategies = mapReportStrategies(openF1.stints ?? [], pitStops, results, fastF1);
  const keyEvents = buildReportKeyEvents(results, pitStops, openF1.raceControl ?? [], openF1.positions ?? []);
  const teammateComparisons = buildTeammateComparisons(results, pitStops);
  const highlights = buildReportHighlights(results, pitStops, keyEvents, strategies);
  const weather = summarizeReportWeather(openF1.weather ?? []);
  const raceStatistics = buildRaceStatistics(results, keyEvents, weather);

  return {
    weather,
    race_statistics: {
      ...raceStatistics,
      laps: Math.max(...results.map((result) => result.laps ?? 0), 0),
      finishers: results.filter((result) => isFinisherStatus(result.status)).length,
      retirements: results.filter((result) => !isFinisherStatus(result.status)).length,
      fastf1Available: Boolean(Object.keys(fastF1 ?? {}).length),
    },
    results,
    key_events: keyEvents.slice(0, 20),
    pit_stops: pitStops,
    strategies,
    teammate_comparisons: teammateComparisons,
    highlights,
    news_summary: newsSummary,
    championship_impact: {
      note: "Таблица чемпионата обновляется отдельной синхронизацией standings.",
      topResult: results.slice(0, 3).map((result) => `${result.position}. ${result.driver}`),
    },
    source_errors: sourceErrors,
  };
}

function mapReportResults(rows, openF1Laps, tyreStintsByDriver) {
  const bestLapByDriverNumber = getBestOpenF1LapByDriverNumber(openF1Laps);
  const results = (rows ?? []).map((row) => {
    const driver = getRelationObject(row.drivers);
    const team = getRelationObject(row.teams);
    const position = numberOrNull(row.position);
    const grid = normalizeGridPosition(row.grid);
    const bestLap = getJolpicaBestLap(row.raw_payload) ?? bestLapByDriverNumber.get(Number(driver?.permanent_number)) ?? null;

    return {
      position,
      driverNumber: numberOrNull(driver?.permanent_number),
      driver: driver?.full_name ?? "Пилот уточняется",
      team: team?.name ?? "Команда уточняется",
      grid,
      positionDelta: grid && position ? grid - position : null,
      points: numberOrNull(row.points),
      status: row.status ?? "Финиш",
      laps: numberOrNull(row.laps),
      time: row.time_text ?? null,
      bestLap,
      tyres: tyreStintsByDriver.get(String(driver?.permanent_number ?? "")) ?? [],
    };
  });
  const fastestLap = getFastestLapResult(results);
  const bestGain = getExtremeByDelta(results, "max");
  const biggestDrop = getExtremeByDelta(results, "min");

  return results.map((result) => ({
    ...result,
    isWinner: result.position === 1,
    isPodium: result.position !== null && result.position <= 3,
    isFastestLap: fastestLap?.driver === result.driver,
    isBestGain: bestGain?.driver === result.driver && (bestGain.positionDelta ?? 0) > 0,
    isBiggestDrop: biggestDrop?.driver === result.driver && (biggestDrop.positionDelta ?? 0) < 0,
  }));
}

function getTyreStintsByDriverNumber(stints) {
  const byDriver = new Map();

  for (const stint of stints ?? []) {
    const driverNumber = String(stint.driver_number ?? "");

    if (!driverNumber) {
      continue;
    }

    const items = byDriver.get(driverNumber) ?? [];
    items.push({
      compound: normalizeTyreCompound(stint.compound),
      startLap: numberOrNull(stint.lap_start),
      endLap: numberOrNull(stint.lap_end),
    });
    byDriver.set(driverNumber, items);
  }

  for (const [driverNumber, items] of byDriver.entries()) {
    byDriver.set(
      driverNumber,
      items
        .filter((item) => item.compound)
        .sort((a, b) => Number(a.startLap ?? 999) - Number(b.startLap ?? 999)),
    );
  }

  return byDriver;
}

function normalizeTyreCompound(value) {
  const compound = normalizeString(value)?.toUpperCase() ?? "";

  if (["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"].includes(compound)) {
    return compound;
  }

  return compound || "UNKNOWN";
}

function mapReportPitStops(pits, results) {
  const resultByNumber = new Map();

  for (const result of results) {
    resultByNumber.set(String(result.driverNumber ?? ""), result);
  }

  return (pits ?? [])
    .map((pit) => {
      const driverNumber = String(pit.driver_number ?? "");
      const result = resultByNumber.get(driverNumber);

      return {
        lap: numberOrNull(pit.lap_number),
        driverNumber: numberOrNull(pit.driver_number),
        driver: result?.driver ?? `#${driverNumber}`,
        duration: numberOrNull(pit.pit_duration),
        date: pit.date ?? null,
      };
    })
    .filter((pit) => pit.lap !== null);
}

function mapReportStrategies(stints, pitStops, results, fastF1) {
  const stintsByDriver = new Map();

  for (const stint of stints ?? []) {
    const key = String(stint.driver_number ?? "");
    const items = stintsByDriver.get(key) ?? [];
    items.push({
      compound: stint.compound ?? "UNKNOWN",
      startLap: numberOrNull(stint.lap_start),
      endLap: numberOrNull(stint.lap_end),
    });
    stintsByDriver.set(key, items);
  }

  const pitCountByDriver = countBy(pitStops, (pit) => pit.driver);

  return results.slice(0, 20).map((result) => {
    const driverNumber = String(result.driverNumber ?? "");
    const fastF1Metrics =
      fastF1?.driversByNumber?.[driverNumber] ??
      fastF1?.drivers?.[driverNumber] ??
      fastF1?.drivers?.[result.driver] ??
      null;

    return {
      driver: result.driver,
      team: result.team,
      pitStops: pitCountByDriver.get(result.driver) ?? 0,
      compounds: [...new Set([...(stintsByDriver.get(driverNumber) ?? []).map((stint) => stint.compound)])],
      stints: stintsByDriver.get(driverNumber) ?? [],
      fastF1: fastF1Metrics,
    };
  });
}

function buildReportKeyEvents(results, pitStops, raceControl, positions) {
  const events = [
    {
      lap: 1,
      type: "start",
      title: "Старт гонки",
      detail: results[0] ? `${results[0].driver} финишировал победителем.` : null,
    },
  ];

  for (const result of results.filter((item) => !isFinisherStatus(item.status)).slice(0, 6)) {
    events.push({
      lap: result.laps ?? null,
      type: "retirement",
      title: `${result.driver}: сход или проблема`,
      detail: result.status,
    });
  }

  const fastestPit = [...pitStops]
    .filter((pit) => pit.duration !== null)
    .sort((a, b) => Number(a.duration) - Number(b.duration))[0];

  if (fastestPit) {
    events.push({
      lap: fastestPit.lap,
      type: "pit_stop",
      title: "Самый быстрый пит-стоп",
      detail: `${fastestPit.driver}: ${fastestPit.duration} с`,
    });
  }

  for (const control of (raceControl ?? []).slice(0, 60)) {
    const text = String(control.message ?? control.flag ?? "").trim();
    const category = String(control.category ?? control.flag ?? "").toLowerCase();

    if (!isImportantRaceControl(text, category)) {
      continue;
    }

    events.push({
      lap: numberOrNull(control.lap_number),
      type: category || "race_control",
      title: getRaceControlTitle(text, category),
      detail: text,
    });
  }

  for (const event of getLeadChangeEvents(positions, results).slice(0, 5)) {
    events.push(event);
  }

  return events
    .filter((event) => event.title)
    .sort((a, b) => (a.lap ?? 999) - (b.lap ?? 999));
}

function buildTeammateComparisons(results, pitStops) {
  const byTeam = new Map();
  const pitCountByDriver = countBy(pitStops, (pit) => pit.driver);

  for (const result of results) {
    const items = byTeam.get(result.team) ?? [];
    items.push({
      driver: result.driver,
      grid: result.grid,
      position: result.position,
      points: result.points,
      bestLap: result.bestLap,
      pitStops: pitCountByDriver.get(result.driver) ?? 0,
      status: result.status,
    });
    byTeam.set(result.team, items);
  }

  return [...byTeam.entries()].map(([team, drivers]) => ({
    team,
    drivers: drivers.sort((a, b) => Number(a.position ?? 99) - Number(b.position ?? 99)),
  }));
}

function buildReportHighlights(results, pitStops, keyEvents, strategies) {
  const podium = results.filter((result) => result.position !== null && result.position <= 3);
  const bestGain = getExtremeByDelta(results, "max");
  const biggestDrop = getExtremeByDelta(results, "min");
  const fastestLap = getFastestLapResult(results);
  const fastestPitStop = [...pitStops]
    .filter((pit) => pit.duration !== null)
    .sort((a, b) => Number(a.duration) - Number(b.duration))[0];
  const mostCommonStrategy = getMostCommonStrategy(strategies);
  const safetyCarSummary = getSafetyCarSummary(keyEvents);
  const teamPoints = new Map();

  for (const result of results) {
    teamPoints.set(result.team, (teamPoints.get(result.team) ?? 0) + Number(result.points ?? 0));
  }

  const bestTeam = [...teamPoints.entries()].sort((a, b) => b[1] - a[1])[0];
  const potentialLoss = getPotentialPointsLoss(results);

  return {
    winner: podium[0]?.driver ?? null,
    podium: podium.map((result) => result.driver),
    fastestLap: fastestLap ? { driver: fastestLap.driver, time: fastestLap.bestLap ?? null } : null,
    fastestPitStop: fastestPitStop
      ? { driver: fastestPitStop.driver, duration: fastestPitStop.duration, lap: fastestPitStop.lap }
      : null,
    safetyCarSummary,
    mostCommonStrategy,
    bestGain: bestGain ? { driver: bestGain.driver, delta: bestGain.positionDelta } : null,
    biggestDrop: biggestDrop ? { driver: biggestDrop.driver, delta: biggestDrop.positionDelta } : null,
    bestTeam: bestTeam ? { team: bestTeam[0], points: bestTeam[1] } : null,
    potentialPointsLoss: potentialLoss,
    surpriseResult: bestGain && (bestGain.positionDelta ?? 0) >= 5 ? bestGain.driver : null,
    retirements: results.filter((result) => !isFinisherStatus(result.status)).map((result) => result.driver),
  };
}

function getMostCommonStrategy(strategies) {
  const counts = new Map();

  for (const strategy of strategies ?? []) {
    const compounds = (strategy.stints ?? [])
      .map((stint) => normalizeTyreCompound(stint.compound))
      .filter((compound) => compound && compound !== "UNKNOWN");

    if (!compounds.length) {
      continue;
    }

    const key = compounds.join("-");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const mostCommon = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];

  return mostCommon ? { sequence: mostCommon[0], drivers: mostCommon[1] } : null;
}

function getSafetyCarSummary(keyEvents) {
  let safetyCar = 0;
  let vsc = 0;
  let redFlag = 0;

  for (const event of keyEvents ?? []) {
    const text = `${event.title ?? ""} ${event.detail ?? ""}`.toLowerCase();

    if (/red flag|красн/.test(text)) {
      redFlag += 1;
      continue;
    }

    if (/virtual safety car|\bvsc\b/.test(text)) {
      vsc += 1;
      continue;
    }

    if (/safety car|\bsc\b/.test(text)) {
      safetyCar += 1;
    }
  }

  if (!safetyCar && !vsc && !redFlag) {
    return null;
  }

  return [
    safetyCar ? `SC: ${safetyCar}` : null,
    vsc ? `VSC: ${vsc}` : null,
    redFlag ? `красные флаги: ${redFlag}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function summarizeReportWeather(weatherRows) {
  const rows = weatherRows ?? [];

  if (!rows.length) {
    return {};
  }

  const temperatures = rows.map((row) => Number(row.air_temperature)).filter(Number.isFinite);
  const rainfall = rows.some((row) => Number(row.rainfall) > 0);

  return {
    averageAirTemperature:
      temperatures.length ? Number((temperatures.reduce((sum, item) => sum + item, 0) / temperatures.length).toFixed(1)) : null,
    rainfall,
    samples: rows.length,
  };
}

function buildRaceStatistics(results, keyEvents, weather) {
  const eventText = keyEvents.map((event) => `${event.type} ${event.title} ${event.detail ?? ""}`.toLowerCase()).join(" ");

  return {
    safetyCar: /safety car/.test(eventText),
    virtualSafetyCar: /virtual safety car|vsc/.test(eventText),
    redFlag: /red flag/.test(eventText),
    weather,
  };
}

async function updateGrandPrixReportSummary(report) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.REPORT_SUMMARY_MODEL ?? process.env.AI_SUMMARY_MODEL ?? "google/gemini-2.5-flash-lite";

  if (!apiKey) {
    await supabase
      .from("grand_prix_reports")
      .update({ status: report.status === "summary_pending" ? "partial" : report.status, summary_status: "pending" })
      .eq("id", report.id);
    return false;
  }

  const facts = {
    race: {
      season: report.season,
      round: report.round,
      name: report.race_name,
      circuit: report.circuit_name,
      country: report.country,
    },
    top3: (report.results ?? []).slice(0, 3).map((result) => ({
      position: result.position,
      driver: result.driver,
      team: result.team,
      points: result.points,
      time: result.time,
    })),
    highlights: {
      winner: report.highlights?.winner,
      podium: report.highlights?.podium,
    },
    newsSummary: {
      articles: (report.news_summary?.articles ?? []).slice(0, 1).map((article) => ({
        title: article.title,
        summary: article.summary,
      })),
    },
  };

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "http-referer": process.env.OPENROUTER_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "",
        "x-title": process.env.OPENROUTER_APP_NAME ?? "RaceMate",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "Ты редактор RaceMate. Напиши компактный итог Гран-при на русском в 2-4 абзацах только по переданным фактам. Если есть newsSummary.articles, добавь короткий раздел «Что обсуждали вокруг этапа» по этим новостям. Не придумывай события, не добавляй неподтвержденные оценки, не уходи в нерелевантные темы.",
          },
          {
            role: "user",
            content: JSON.stringify(facts),
          },
        ],
        max_tokens: Number(process.env.REPORT_SUMMARY_MAX_TOKENS ?? 250),
      }),
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(`OpenRouter failed for report ${report.id}: ${response.status} ${JSON.stringify(payload).slice(0, 220)}`);
    }

    const summary = normalizeString(payload.choices?.[0]?.message?.content);

    if (!summary) {
      throw new Error("OpenRouter returned empty report summary.");
    }

    await supabase
      .from("grand_prix_reports")
      .update({
        ai_summary: summary,
        summary_status: "generated",
        status: Object.keys(report.source_errors ?? {}).length ? "partial" : "ready",
        last_error: null,
      })
      .eq("id", report.id);

    const usage = payload.usage ?? null;

    if (usage) {
      await supabase.from("ai_usage_logs").insert({
        purpose: "reports.summary",
        provider: "openrouter",
        model,
        input_tokens: usage.prompt_tokens ?? null,
        output_tokens: usage.completion_tokens ?? null,
        estimated_cost_usd: null,
      });
    }

    return true;
  } catch (error) {
    await supabase
      .from("grand_prix_reports")
      .update({
        summary_status: "failed",
        status: report.status === "summary_pending" ? "partial" : report.status,
        last_error: error instanceof Error ? error.message : String(error),
      })
      .eq("id", report.id);

    return false;
  }
}

async function upsertReportStatus(race, status) {
  await supabase.from("grand_prix_reports").upsert(
    {
      season: race.season_year,
      round: race.round,
      race_slug: makeRaceReportSlug(race.season_year, race.race_name),
      race_name: race.race_name,
      circuit_name: getRelationObject(race.circuits)?.name ?? null,
      country: getRelationObject(race.circuits)?.country ?? null,
      race_date: race.race_start_at,
      status,
      source_updated_at: new Date().toISOString(),
    },
    { onConflict: "season,round" },
  );
}

async function upsertReportFailure(race, message) {
  await supabase.from("grand_prix_reports").upsert(
    {
      season: race.season_year,
      round: race.round,
      race_slug: makeRaceReportSlug(race.season_year, race.race_name),
      race_name: race.race_name,
      circuit_name: getRelationObject(race.circuits)?.name ?? null,
      country: getRelationObject(race.circuits)?.country ?? null,
      race_date: race.race_start_at,
      status: "pending",
      last_error: message,
      source_updated_at: new Date().toISOString(),
    },
    { onConflict: "season,round" },
  );
}

async function getExistingGrandPrixReport(season, round) {
  const { data } = await supabase
    .from("grand_prix_reports")
    .select("id, structured_hash, summary_status, refresh_stage")
    .eq("season", season)
    .eq("round", round)
    .maybeSingle();

  return data ?? null;
}

function getNextReportRefreshAt(currentStage) {
  const stages = [30 * 60 * 1000, 3 * 60 * 60 * 1000, 24 * 60 * 60 * 1000];
  const stage = currentStage + 1;

  if (stage >= stages.length) {
    return { stage, nextRefreshAt: null };
  }

  return {
    stage,
    nextRefreshAt: new Date(Date.now() + stages[stage]).toISOString(),
  };
}

function hashJson(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function makeRaceReportSlug(season, raceName) {
  return `${season}-${slugify(String(raceName).replace(/\s+grand prix$/i, ""))}`;
}

function getCliOption(name) {
  const prefixed = `--${name}`;
  const index = process.argv.indexOf(prefixed);

  if (index >= 0) {
    return process.argv[index + 1] ?? null;
  }

  const inline = process.argv.find((arg) => arg.startsWith(`${prefixed}=`));

  return inline ? inline.slice(prefixed.length + 1) : null;
}

function getRelationObject(value) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function normalizeGridPosition(value) {
  const grid = numberOrNull(value);

  return grid && grid > 0 ? grid : null;
}

function getJolpicaBestLap(rawPayload) {
  const payload = rawPayload && typeof rawPayload === "object" ? rawPayload : {};
  const fastestLap = payload.FastestLap ?? payload.fastestLap;

  return normalizeString(fastestLap?.Time?.time ?? fastestLap?.time ?? fastestLap?.lapTime);
}

function getBestOpenF1LapByDriverNumber(laps) {
  const best = new Map();

  for (const lap of laps ?? []) {
    const driverNumber = numberOrNull(lap.driver_number);
    const duration = numberOrNull(lap.lap_duration);

    if (!driverNumber || !duration) {
      continue;
    }

    const current = best.get(driverNumber);

    if (!current || duration < current.duration) {
      best.set(driverNumber, {
        duration,
        label: formatLapDuration(duration),
      });
    }
  }

  return new Map([...best.entries()].map(([driverNumber, lap]) => [driverNumber, lap.label]));
}

function getFastestLapResult(results) {
  return [...results]
    .map((result) => ({ result, lapMs: parseLapTimeToMs(result.bestLap) }))
    .filter((item) => item.lapMs !== null)
    .sort((a, b) => Number(a.lapMs) - Number(b.lapMs))[0]?.result ?? null;
}

function parseLapTimeToMs(value) {
  const text = normalizeString(value);

  if (!text) {
    return null;
  }

  const minuteMatch = text.match(/^(\d+):(\d{1,2})(?:\.(\d+))?$/);

  if (minuteMatch) {
    const minutes = Number(minuteMatch[1]);
    const seconds = Number(minuteMatch[2]);
    const millis = Number(String(minuteMatch[3] ?? "0").padEnd(3, "0").slice(0, 3));

    return (minutes * 60 + seconds) * 1000 + millis;
  }

  const seconds = Number(text.replace(",", "."));

  return Number.isFinite(seconds) ? seconds * 1000 : null;
}

function getExtremeByDelta(results, direction) {
  const sorted = [...results]
    .filter((result) => result.positionDelta !== null)
    .sort((a, b) =>
      direction === "max"
        ? Number(b.positionDelta) - Number(a.positionDelta)
        : Number(a.positionDelta) - Number(b.positionDelta),
    );

  return sorted[0] ?? null;
}

function countBy(items, keyFn) {
  const counts = new Map();

  for (const item of items ?? []) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

function isImportantRaceControl(text, category) {
  const haystack = `${category} ${text}`.toLowerCase();

  return /safety car|virtual safety car|\bvsc\b|red flag|penalt|investigat|collision|incident|stopp|retir|black and white|drive through|time penalty/.test(
    haystack,
  );
}

function getRaceControlTitle(text, category) {
  const haystack = `${category} ${text}`.toLowerCase();

  if (/red flag/.test(haystack)) {
    return "Красный флаг";
  }

  if (/virtual safety car|\bvsc\b/.test(haystack)) {
    return "Virtual Safety Car";
  }

  if (/safety car/.test(haystack)) {
    return "Safety Car";
  }

  if (/penalt|drive through|time penalty/.test(haystack)) {
    return "Штраф";
  }

  if (/investigat|incident|collision/.test(haystack)) {
    return "Инцидент";
  }

  return "Сообщение дирекции гонки";
}

function getLeadChangeEvents(positions, results) {
  const resultByNumber = new Map(
    results
      .filter((result) => result.driverNumber)
      .map((result) => [String(result.driverNumber), result]),
  );
  let leader = null;
  const events = [];

  for (const position of [...(positions ?? [])].sort(
    (a, b) => new Date(a.date ?? 0).getTime() - new Date(b.date ?? 0).getTime(),
  )) {
    if (Number(position.position) !== 1) {
      continue;
    }

    const driverNumber = String(position.driver_number ?? "");

    if (!driverNumber || driverNumber === leader) {
      continue;
    }

    const result = resultByNumber.get(driverNumber);

    if (leader !== null && result?.driver) {
      events.push({
        lap: numberOrNull(position.lap_number),
        type: "lead_change",
        title: "Смена лидера",
        detail: `${result.driver} вышел на первое место.`,
      });
    }

    leader = driverNumber;
  }

  return events;
}

function isFinisherStatus(status) {
  const text = normalizeString(status)?.toLowerCase();

  if (!text) {
    return true;
  }

  if (/retired|accident|collision|engine|gearbox|brake|hydraulic|electrical|not classified|excluded|withdrawn|dnf|сход|авар|двигател|коробк|тормоз/.test(text)) {
    return false;
  }

  return true;
}

function getPotentialPointsLoss(results) {
  const scoring = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
  const losses = new Map();

  for (const result of results) {
    const expected = result.grid && result.grid <= scoring.length ? scoring[result.grid - 1] : 0;
    const actual = Number(result.points ?? 0);
    const loss = Math.max(0, expected - actual);

    if (loss > 0) {
      losses.set(result.team, (losses.get(result.team) ?? 0) + loss);
    }
  }

  const biggest = [...losses.entries()].sort((a, b) => b[1] - a[1])[0];

  return biggest ? { team: biggest[0], points: biggest[1] } : null;
}

function slugify(value) {
  return normalizeString(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "race";
}

async function processNewsWithAi() {
  return processNewsArticleBatch({ mode: "pending" });
}

async function reprocessFallbackNewsWithAi() {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is missing for fallback news reprocessing.");
  }

  return processNewsArticleBatch({ mode: "fallback" });
}

async function processNewsArticleBatch({ mode }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model =
    process.env.AI_SUMMARY_MODEL ?? process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash-lite";
  const maxTokens = Number(process.env.AI_SUMMARY_MAX_TOKENS ?? 1800);
  const limit = Math.max(
    1,
    Math.min(Number(getCliOption("limit") ?? process.env.AI_MAX_ARTICLES_PER_RUN ?? 20), 100),
  );
  const articleId = normalizeString(getCliOption("id"));

  let query = supabase
    .from("news_articles")
    .select("id, canonical_url, original_url, original_title, original_description, source_image_url, raw_payload")
    .is("duplicate_of", null)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (articleId) {
    query = query.eq("id", articleId);
  }

  if (mode === "fallback") {
    query = query.eq("status", "processed").eq("ai_model", "fallback");
  } else {
    query = query.eq("status", "pending");
  }

  const { data: articles, error } = await query;

  if (error) {
    throw error;
  }

  const [races, drivers, teams] = await Promise.all([
    getRaceChoices(),
    getDriverTagChoices(),
    getTeamTagChoices(),
  ]);
  let itemsProcessed = 0;

  for (const article of articles ?? []) {
    const articleContext = await getArticleContext(article);
    const fallback = makeFallbackNewsPayload(article);
    let aiPayload = fallback;
    let title = fallback.title;
    let usage = null;
    let relatedRace = matchRaceByText(article, races);

    if (apiKey) {
      try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
            "http-referer": process.env.OPENROUTER_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "",
            "x-title": process.env.OPENROUTER_APP_NAME ?? "RaceMate",
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "system",
                content: buildNewsAiSystemPrompt(),
              },
              {
                role: "user",
                content: `Источник: ${article.canonical_url ?? article.original_url ?? "RSS"}\nОригинальный заголовок: ${article.original_title}\n\nRSS-описание:\n${article.original_description ?? "Нет"}\n\nТекст оригинальной статьи или расширенный контекст:\n${articleContext.text || "Полный текст недоступен, используй только RSS-описание и не расширяй факты."}\n\nЭтапы сезона:\n${races
                  .map((race) => `${race.round}: ${race.race_name} (${race.circuit_name}, ${race.country})`)
                  .join("\n")}\n\nКоманды для team_slugs:\n${teams
                  .map((team) => `${team.slug}: ${team.name}`)
                  .join("\n")}`,
              },
            ],
            response_format: { type: "json_object" },
            max_tokens: maxTokens,
          }),
        });
        const payload = await readJsonResponse(response);
        if (!response.ok) {
          logWorkerWarning("openrouter.news_summary.fallback", {
            articleId: article.id,
            status: response.status,
            reason: getOpenRouterFailureReason(payload),
          });
        } else {
          const content = payload.choices?.[0]?.message?.content;
          const parsed = safeJson(content);
          const parsedTitle = normalizeString(parsed?.title_ru);
          const parsedSummary = normalizeString(parsed?.summary_ru);
          const parsedDetails = normalizeString(parsed?.details_ru);

          if (!isUsableRussianNewsPayload({
            details: parsedDetails,
            summary: parsedSummary,
            title: parsedTitle,
          })) {
            logWorkerWarning("openrouter.news_summary.non_russian", {
              articleId: article.id,
              model,
            });
          } else {
            title = parsedTitle ?? title;
            aiPayload = {
              summary: parsedSummary ?? aiPayload.summary,
              details: parsedDetails ?? aiPayload.details,
              keyPoints: normalizeStringArray(parsed?.key_points_ru) ?? aiPayload.keyPoints,
              highlights: selectArticleHighlights(
                normalizeStringArray(parsed?.highlight_phrases_ru) ?? aiPayload.highlights,
                parsedSummary ?? aiPayload.summary,
                parsedDetails ?? aiPayload.details,
              ),
            };
            const aiRace = races.find((race) => race.round === numberOrNull(parsed?.race_round));
            relatedRace = aiRace ?? relatedRace;
            aiPayload.teamSlugs = normalizeStringArray(parsed?.team_slugs) ?? [];
            usage = payload.usage ?? null;
          }
        }
      } catch (aiError) {
        logWorkerWarning("openrouter.news_summary.fallback", {
          articleId: article.id,
          reason: getSafeErrorMessage(aiError),
        });
      }
    }

    await supabase
      .from("news_articles")
      .update({
        ai_title_ru: title,
        ai_summary_ru: aiPayload.summary,
        ai_summary_long_ru: aiPayload.details,
        ai_key_points_ru: aiPayload.keyPoints,
        ai_highlights_ru: aiPayload.highlights,
        source_image_url: article.source_image_url ?? articleContext.imageUrl ?? null,
        related_race_id: relatedRace?.id ?? null,
        ai_model: usage ? model : "fallback",
        ai_processed_at: new Date().toISOString(),
        status: "processed",
      })
      .eq("id", article.id);

    if (relatedRace) {
      await upsertRaceTagForArticle(article.id, relatedRace, 0.84, "ai");
    }

    const matchedTeams = new Map();

    for (const team of matchTeamsByText(article, teams)) {
      matchedTeams.set(team.slug, { team, confidence: 0.66, method: "rule" });
    }

    for (const teamSlug of aiPayload.teamSlugs ?? []) {
      const team = teams.find((item) => item.slug === teamSlug);

      if (team) {
        matchedTeams.set(team.slug, { team, confidence: 0.82, method: "ai" });
      }
    }

    for (const driver of matchDriversByText(article, drivers)) {
      await upsertDriverTagForArticle(article.id, driver, 0.7, "rule");

      if (driver.team) {
        matchedTeams.set(driver.team.slug, {
          team: driver.team,
          confidence: 0.72,
          method: "driver-rule",
        });
      }
    }

    for (const { team, confidence, method } of matchedTeams.values()) {
      await upsertTeamTagForArticle(article.id, team, confidence, method);
    }

    if (usage) {
      await supabase.from("ai_usage_logs").insert({
        purpose: "news.summary",
        provider: "openrouter",
        model,
        input_tokens: usage.prompt_tokens ?? null,
        output_tokens: usage.completion_tokens ?? null,
        estimated_cost_usd: null,
        related_article_id: article.id,
      });
    }

    itemsProcessed += 1;
  }

  return { itemsProcessed, metadata: { model, openrouter: Boolean(apiKey), mode, limit } };
}

async function rehighlightNewsWithAi() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model =
    process.env.AI_SUMMARY_MODEL ?? process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash-lite";
  const limit = Math.max(1, Math.min(Number(getCliOption("limit") ?? 100), 200));

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is missing for news highlight refresh.");
  }

  const { data: articles, error } = await supabase
    .from("news_articles")
    .select("id, ai_summary_ru, ai_summary_long_ru, original_description")
    .eq("status", "processed")
    .is("duplicate_of", null)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  let itemsProcessed = 0;
  let skipped = 0;

  for (const article of articles ?? []) {
    const summary = normalizeString(article.ai_summary_ru) ?? normalizeString(article.original_description) ?? "";
    const details = normalizeString(article.ai_summary_long_ru) ?? "";

    if (!summary && !details) {
      skipped += 1;
      continue;
    }

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          "http-referer": process.env.OPENROUTER_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "",
          "x-title": process.env.OPENROUTER_APP_NAME ?? "RaceMate",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: buildNewsHighlightSystemPrompt() },
            {
              role: "user",
              content: `Лид:\n${summary || "Нет"}\n\nТекст статьи:\n${details || "Нет"}`,
            },
          ],
          response_format: { type: "json_object" },
          max_tokens: 500,
        }),
      });
      const payload = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(`OpenRouter returned HTTP ${response.status}: ${getOpenRouterFailureReason(payload)}`);
      }

      const parsed = safeJson(payload.choices?.[0]?.message?.content);
      const highlights = selectArticleHighlights(parsed?.highlight_phrases_ru, summary, details);
      const { error: updateError } = await supabase
        .from("news_articles")
        .update({ ai_highlights_ru: highlights })
        .eq("id", article.id);

      if (updateError) {
        throw updateError;
      }

      itemsProcessed += 1;
    } catch (highlightError) {
      skipped += 1;
      logWorkerWarning("openrouter.news_highlights.skip", {
        articleId: article.id,
        reason: getSafeErrorMessage(highlightError),
      });
    }
  }

  return { itemsProcessed, metadata: { limit, skipped } };
}

async function backfillNewsSourceImages() {
  const limit = Math.max(
    1,
    Math.min(Number(getCliOption("limit") ?? process.env.NEWS_SOURCE_IMAGE_BACKFILL_LIMIT ?? 80), 200),
  );
  const force = process.argv.includes("--force");

  let query = supabase
    .from("news_articles")
    .select("id, canonical_url, original_url, original_title, original_description, source_image_url, raw_payload")
    .eq("status", "processed")
    .is("duplicate_of", null)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (!force) {
    query = query.is("source_image_url", null);
  }

  const { data: articles, error } = await query;

  if (error) {
    throw error;
  }

  let itemsProcessed = 0;
  let itemsWithImage = 0;

  for (const article of articles ?? []) {
    const existingImage =
      normalizeString(article.source_image_url) ??
      normalizeString(article.raw_payload?.imageUrl) ??
      extractFeedImageFromPayload(article.raw_payload);
    let fetchedArticle = existingImage
      ? { imageUrl: existingImage }
      : await fetchReadableArticleMetadata(article.original_url ?? article.canonical_url);

    if (!fetchedArticle.imageUrl && shouldUseReaderFallback(article.original_url ?? article.canonical_url)) {
      fetchedArticle = await fetchReadableArticleMetadataViaReader(
        article.original_url ?? article.canonical_url,
        fetchedArticle,
      );
    }

    const imageUrl = normalizeString(fetchedArticle.imageUrl);

    if (!imageUrl) {
      itemsProcessed += 1;
      continue;
    }

    await supabase
      .from("news_articles")
      .update({ source_image_url: imageUrl })
      .eq("id", article.id);

    itemsProcessed += 1;
    itemsWithImage += 1;
  }

  return { itemsProcessed, metadata: { force, itemsWithImage, limit } };
}

async function retagNewsWithAi() {
  const { data: articles, error } = await supabase
    .from("news_articles")
    .select("id, original_title, original_description")
    .eq("status", "processed")
    .is("duplicate_of", null)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(Number(process.env.AI_RETAG_ARTICLES_PER_RUN ?? 100));

  if (error) {
    throw error;
  }

  const [races, drivers, teams] = await Promise.all([
    getRaceChoices(),
    getDriverTagChoices(),
    getTeamTagChoices(),
  ]);
  let itemsProcessed = 0;

  for (const article of articles ?? []) {
    const race = matchRaceByText(article, races);
    const matchedDrivers = matchDriversByText(article, drivers);
    const matchedTeams = new Map();

    for (const team of matchTeamsByText(article, teams)) {
      matchedTeams.set(team.slug, { team, confidence: 0.66, method: "rule" });
    }

    matchedDrivers.forEach((driver) => {
      if (driver.team) {
        matchedTeams.set(driver.team.slug, {
          team: driver.team,
          confidence: 0.72,
          method: "driver-rule",
        });
      }
    });

    if (!race && !matchedDrivers.length && !matchedTeams.size) {
      continue;
    }

    if (race) {
      await supabase
        .from("news_articles")
        .update({ related_race_id: race.id })
        .eq("id", article.id);
      await upsertRaceTagForArticle(article.id, race, 0.62, "rule");
    }

    for (const driver of matchedDrivers) {
      await upsertDriverTagForArticle(article.id, driver, 0.7, "rule");
    }

    for (const { team, confidence, method } of matchedTeams.values()) {
      await upsertTeamTagForArticle(article.id, team, confidence, method);
    }

    itemsProcessed += 1;
  }

  return { itemsProcessed, metadata: { method: "rule" } };
}

async function generateNextRacePolls() {
  const closed = await closeCompletedAiPolls();
  const completedRace = await findLatestCompletedRaceForPolls();

  if (!completedRace) {
    return { itemsProcessed: closed, metadata: { closed, reason: "no_completed_race" } };
  }

  const nextRace = await findNextRaceForPolls(completedRace.race_start_at);

  if (!nextRace) {
    return { itemsProcessed: closed, metadata: { closed, reason: "season_complete" } };
  }

  const { data: existing, error: existingError } = await supabase
    .from("polls")
    .select("id, poll_kind")
    .eq("race_id", nextRace.id)
    .not("poll_kind", "is", null);

  if (existingError) {
    throw existingError;
  }

  const existingKinds = new Set((existing ?? []).map((poll) => poll.poll_kind));
  const missingKinds = pollKinds.filter((kind) => !existingKinds.has(kind));

  if (!missingKinds.length) {
    return {
      itemsProcessed: closed,
      metadata: { closed, race: nextRace.race_name, generated: 0, cached: true },
    };
  }

  const context = await getPollGenerationContext(nextRace);
  const generated = await requestAiRacePolls(context);
  const pollsToCreate = generated.filter((poll) => missingKinds.includes(poll.kind));

  if (pollsToCreate.length !== missingKinds.length) {
    throw new Error("AI did not return every missing poll category.");
  }

  let created = 0;

  for (const poll of pollsToCreate) {
    const { data: createdPoll, error: pollError } = await supabase
      .from("polls")
      .insert({
        race_id: nextRace.id,
        question: poll.question,
        status: "published",
        poll_kind: poll.kind,
        generated_by_ai: true,
        generated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (pollError) {
      if (String(pollError.code ?? "") === "23505") {
        continue;
      }

      throw pollError;
    }

    const { error: optionsError } = await supabase.from("poll_options").insert(
      poll.options.map((label, index) => ({
        poll_id: createdPoll.id,
        label,
        sort_order: index + 1,
      })),
    );

    if (optionsError) {
      throw optionsError;
    }

    created += 1;
  }

  return {
    itemsProcessed: closed + created,
    metadata: {
      closed,
      generated: created,
      race: `${nextRace.season_year}-${nextRace.round}`,
    },
  };
}

async function closeCompletedAiPolls() {
  const { data: polls, error } = await supabase
    .from("polls")
    .select("id, race_id")
    .eq("status", "published")
    .eq("generated_by_ai", true)
    .not("race_id", "is", null);

  if (error) {
    throw error;
  }

  const raceIds = [...new Set((polls ?? []).map((poll) => poll.race_id).filter(Boolean))];
  const completedRaceIds = [];

  for (const raceId of raceIds) {
    const session = await getRaceSessionForReport(raceId);
    const results = session ? await getRaceResultRows(session.id) : [];

    if (hasFinalRaceResults(results)) {
      completedRaceIds.push(raceId);
    }
  }

  if (!completedRaceIds.length) {
    return 0;
  }

  const { data: closed, error: closeError } = await supabase
    .from("polls")
    .update({ status: "closed", closes_at: new Date().toISOString() })
    .in("race_id", completedRaceIds)
    .eq("status", "published")
    .eq("generated_by_ai", true)
    .select("id");

  if (closeError) {
    throw closeError;
  }

  return closed?.length ?? 0;
}

async function findLatestCompletedRaceForPolls() {
  const { data, error } = await supabase
    .from("races")
    .select("id, season_year, round, race_name, race_start_at, status, circuits(name, country, locality, external_id)")
    .order("race_start_at", { ascending: false, nullsFirst: false })
    .limit(16);

  if (error) {
    throw error;
  }

  for (const race of data ?? []) {
    const session = await getRaceSessionForReport(race.id);
    const results = session ? await getRaceResultRows(session.id) : [];

    if (hasFinalRaceResults(results)) {
      return race;
    }
  }

  return null;
}

async function findNextRaceForPolls(afterRaceStartAt) {
  if (!afterRaceStartAt) {
    return null;
  }

  const { data, error } = await supabase
    .from("races")
    .select("id, season_year, round, race_name, race_start_at, status, circuits(name, country, locality, external_id)")
    .gt("race_start_at", afterRaceStartAt)
    .order("race_start_at", { ascending: true, nullsFirst: false })
    .limit(12);

  if (error) {
    throw error;
  }

  return (data ?? []).find((race) => race.status !== "completed" && race.status !== "finished") ?? null;
}

async function getPollGenerationContext(nextRace) {
  const circuit = getRelationObject(nextRace.circuits);
  const [driverStandings, constructorStandings, recentRaces, historicalRace, raceNews, sessions] = await Promise.all([
    getPollDriverStandings(nextRace.season_year),
    getPollConstructorStandings(nextRace.season_year),
    getRecentRaceContext(nextRace),
    getHistoricalCircuitRaceContext(nextRace, circuit?.external_id ?? circuit?.name ?? ""),
    getPollNewsContext(nextRace.id),
    supabase
      .from("sessions")
      .select("id, name, start_at")
      .eq("race_id", nextRace.id)
      .order("start_at", { ascending: true, nullsFirst: false }),
  ]);
  const sessionIds = (sessions.data ?? []).map((session) => session.id);
  const { data: weather } = sessionIds.length
    ? await supabase
        .from("session_weather")
        .select("session_id, temperature_c, precipitation_mm, weather_code")
        .in("session_id", sessionIds)
    : { data: [] };

  return {
    race: {
      name: nextRace.race_name,
      season: nextRace.season_year,
      round: nextRace.round,
      circuit: circuit?.name ?? "Трасса уточняется",
      country: circuit?.country ?? "Страна уточняется",
      locality: circuit?.locality ?? null,
      circuitNotes: getCircuitPollNotes(circuit?.external_id ?? circuit?.name ?? ""),
    },
    driverStandings,
    constructorStandings,
    recentRaces,
    historicalRace,
    news: raceNews,
    weather: (sessions.data ?? []).map((session) => {
      const forecast = (weather ?? []).find((item) => item.session_id === session.id);
      return {
        session: session.name,
        temperatureC: forecast?.temperature_c ?? null,
        precipitationMm: forecast?.precipitation_mm ?? null,
        weatherCode: forecast?.weather_code ?? null,
      };
    }),
  };
}

async function getHistoricalCircuitRaceContext(nextRace, circuitKey) {
  if (!circuitKey || !nextRace.season_year) {
    return null;
  }

  const { data: races, error } = await supabase
    .from("races")
    .select("id, season_year, race_name, circuits(name, external_id)")
    .eq("season_year", Number(nextRace.season_year) - 1)
    .order("round", { ascending: true })
    .limit(32);

  if (error) {
    throw error;
  }

  const normalizedKey = normalizePollText(circuitKey);
  const race = (races ?? []).find((item) => {
    const circuit = getRelationObject(item.circuits);
    const candidates = [circuit?.external_id, circuit?.name].filter(Boolean);

    return candidates.some((candidate) => normalizePollText(candidate) === normalizedKey);
  });

  if (!race) {
    return null;
  }

  const session = await getRaceSessionForReport(race.id);
  const results = session ? await getRaceResultRows(session.id) : [];
  const podium = results
    .filter((result) => Number(result.position) > 0 && Number(result.position) <= 3)
    .slice(0, 3)
    .map((result) => getRelationObject(result.drivers)?.full_name ?? "Пилот");

  return podium.length
    ? { season: race.season_year, race: race.race_name, podium }
    : null;
}

async function getPollDriverStandings(season) {
  const { data, error } = await supabase
    .from("driver_standings")
    .select("round, position, points, wins, drivers(full_name), teams(name)")
    .eq("season_year", season)
    .order("round", { ascending: false, nullsFirst: false })
    .limit(80);

  if (error) {
    throw error;
  }

  const latestRound = Math.max(...(data ?? []).map((row) => Number(row.round ?? 0)));

  return (data ?? [])
    .filter((row) => Number(row.round ?? 0) === latestRound)
    .sort((left, right) => Number(left.position ?? 999) - Number(right.position ?? 999))
    .slice(0, 10)
    .map((row) => ({
      position: row.position,
      driver: getRelationObject(row.drivers)?.full_name ?? "Пилот",
      team: getRelationObject(row.teams)?.name ?? "Команда",
      points: row.points,
      wins: row.wins,
    }));
}

async function getPollConstructorStandings(season) {
  const { data, error } = await supabase
    .from("constructor_standings")
    .select("round, position, points, wins, teams(name)")
    .eq("season_year", season)
    .order("round", { ascending: false, nullsFirst: false })
    .limit(40);

  if (error) {
    throw error;
  }

  const latestRound = Math.max(...(data ?? []).map((row) => Number(row.round ?? 0)));

  return (data ?? [])
    .filter((row) => Number(row.round ?? 0) === latestRound)
    .sort((left, right) => Number(left.position ?? 999) - Number(right.position ?? 999))
    .slice(0, 10)
    .map((row) => ({
      position: row.position,
      team: getRelationObject(row.teams)?.name ?? "Команда",
      points: row.points,
      wins: row.wins,
    }));
}

async function getRecentRaceContext(nextRace) {
  const { data: races, error } = await supabase
    .from("races")
    .select("id, race_name, race_start_at, circuits(name)")
    .lt("race_start_at", nextRace.race_start_at)
    .order("race_start_at", { ascending: false, nullsFirst: false })
    .limit(3);

  if (error) {
    throw error;
  }

  const entries = [];

  for (const race of races ?? []) {
    const session = await getRaceSessionForReport(race.id);
    const results = session ? await getRaceResultRows(session.id) : [];
    const topThree = results
      .filter((result) => Number(result.position) > 0 && Number(result.position) <= 3)
      .slice(0, 3)
      .map((result) => getRelationObject(result.drivers)?.full_name ?? "Пилот");

    if (topThree.length) {
      entries.push({
        race: race.race_name,
        circuit: getRelationObject(race.circuits)?.name ?? "Трасса",
        podium: topThree,
      });
    }
  }

  return entries;
}

async function getPollNewsContext(raceId) {
  const { data, error } = await supabase
    .from("news_articles")
    .select("ai_title_ru, original_title, ai_summary_ru")
    .eq("status", "processed")
    .is("duplicate_of", null)
    .or(`related_race_id.eq.${raceId},related_race_id.is.null`)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(10);

  if (error) {
    throw error;
  }

  return (data ?? []).map((article) => ({
    title: article.ai_title_ru ?? article.original_title,
    summary: article.ai_summary_ru ?? null,
  }));
}

async function requestAiRacePolls(context) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.AI_SUMMARY_MODEL ?? process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash-lite";

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is missing for poll generation.");
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "http-referer": process.env.OPENROUTER_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "",
      "x-title": process.env.OPENROUTER_APP_NAME ?? "RaceMate",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: buildRacePollSystemPrompt() },
        { role: "user", content: JSON.stringify(context) },
      ],
      response_format: { type: "json_object" },
      max_tokens: Number(process.env.AI_POLL_MAX_TOKENS ?? 900),
    }),
  });
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(`OpenRouter poll generation failed: ${response.status} ${getOpenRouterFailureReason(payload)}`);
  }

  const parsed = safeJson(payload.choices?.[0]?.message?.content);
  const polls = validateGeneratedPolls(parsed?.polls);

  await supabase.from("ai_usage_logs").insert({
    purpose: "polls.generate",
    provider: "openrouter",
    model,
    input_tokens: payload.usage?.prompt_tokens ?? null,
    output_tokens: payload.usage?.completion_tokens ?? null,
    estimated_cost_usd: null,
  });

  return polls;
}

function buildRacePollSystemPrompt() {
  return [
    "Ты редактор RaceMate для русскоязычных фанатов Формулы-1.",
    "Сформируй ровно три фанатских опроса к следующему Гран-при на основе только переданного JSON-контекста.",
    "Верни только JSON: { polls: [{ kind, question, options }] }.",
    "kind должен быть ровно sport, strategy и fan: по одному опросу каждого типа.",
    "В каждом опросе ровно 3 варианта ответа. Вопрос короткий, живой и понятный; варианты должны быть равнозначными по интересу.",
    "sport — борьба пилотов или команд; strategy — шины, погода, Safety Car, пит-стопы или характер трассы; fan — интрига, герой, сюрприз или разочарование уикенда.",
    "Не придумывай факты, цитаты, травмы, обновления или прошлые результаты. Не делай все опросы про одного пилота или одну команду.",
    "Не используй оскорбления, кликбейт, вероятности, варианты вроде 'не знаю' и формулировки с очевидным ответом.",
    "Если в контексте нет подтвержденной информации, выбирай нейтральный фанатский вопрос, не утверждающий отсутствующие факты.",
  ].join(" ");
}

function validateGeneratedPolls(value) {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error("AI must return exactly three polls.");
  }

  const seenKinds = new Set();
  const seenQuestions = new Set();

  const polls = value.map((item) => {
    const kind = normalizeString(item?.kind);
    const question = normalizeString(item?.question);
    const options = Array.isArray(item?.options)
      ? item.options.map((option) => normalizeString(option)).filter(Boolean)
      : [];

    if (!pollKinds.includes(kind) || !question || question.length < 12 || question.length > 180) {
      throw new Error("AI returned an invalid poll question.");
    }

    if (options.length !== 3 || options.some((option) => option.length > 120)) {
      throw new Error("AI must return exactly three concise options.");
    }

    const normalizedOptions = new Set(options.map((option) => normalizePollText(option)));
    const normalizedQuestion = normalizePollText(question);

    if (normalizedOptions.size !== 3 || seenKinds.has(kind) || seenQuestions.has(normalizedQuestion)) {
      throw new Error("AI returned duplicate poll content.");
    }

    seenKinds.add(kind);
    seenQuestions.add(normalizedQuestion);

    return { kind, question, options };
  });

  if (seenKinds.size !== pollKinds.length) {
    throw new Error("AI must return sport, strategy and fan polls.");
  }

  return polls;
}

function normalizePollText(value) {
  return value.toLocaleLowerCase("ru-RU").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function getCircuitPollNotes(circuitName) {
  const key = normalizePollText(circuitName);
  const insights = [
    ["red bull ring|spielberg", "Короткий круг, несколько зон торможения и важность тяги на выходе из медленных поворотов."],
    ["barcelona|catalunya", "Длинные скоростные повороты обычно делают темп на длинной серии и деградацию шин особенно заметными."],
    ["monaco|monte carlo", "Узкая городская трасса, где позиция в квалификации особенно важна, а Safety Car может изменить стратегию."],
    ["silverstone", "Быстрые связки поворотов и переменчивая погода часто влияют на баланс и стратегию."],
    ["spa", "Длинный круг с переменчивой погодой; разница условий на разных секторах может быть значимой."],
    ["monza", "Низкая прижимная сила, тяжелые торможения и высокая ценность обгонов на прямых."],
    ["baku", "Городская трасса с длинной прямой, узкими секциями и повышенной вероятностью нейтрализаций."],
    ["singapore|marina bay", "Городская ночная трасса с высокой нагрузкой и частой ролью Safety Car в стратегии."],
    ["interlagos|sao paulo", "Короткий рельефный круг, где погода и рестарты часто меняют сценарий гонки."],
    ["las vegas", "Ночная уличная трасса с холодным покрытием и важным управлением температурой шин."],
    ["losail|lusail|qatar", "Быстрый поток поворотов и высокая нагрузка на шины делают темп на длинной серии важным фактором."],
  ];

  return insights.find(([pattern]) => new RegExp(pattern).test(key))?.[1] ?? "Подтвержденных особенностей трассы в локальном контексте нет.";
}

async function generateDailyDigest() {
  const model =
    process.env.AI_SUMMARY_MODEL ?? process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash-lite";
  const apiKey = process.env.OPENROUTER_API_KEY;
  const now = new Date();
  const dateKey = now.toISOString().slice(0, 10);
  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const { data: cached } = await supabase
    .from("digests")
    .select("id")
    .eq("digest_type", "daily_news")
    .eq("date_key", dateKey)
    .eq("status", "published")
    .maybeSingle();

  if (cached) {
    return { itemsProcessed: 0, metadata: { cached: true, dateKey } };
  }

  const { data: articles, error } = await supabase
    .from("news_articles")
    .select("id, ai_title_ru, original_title, ai_summary_ru, ai_summary_long_ru")
    .eq("status", "processed")
    .is("duplicate_of", null)
    .gte("published_at", windowStart)
    .lt("published_at", now.toISOString())
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(12);

  if (error) {
    throw error;
  }

  const title = "Короткая сводка дня";
  let body = makeDigestFallback(articles ?? []);
  let usage = null;

  if (apiKey && articles?.length) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          "http-referer": process.env.OPENROUTER_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "",
          "x-title": process.env.OPENROUTER_APP_NAME ?? "RaceMate",
        },
        body: JSON.stringify({
          model,
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
      const payload = await readJsonResponse(response);
      if (!response.ok) {
        logWorkerWarning("openrouter.daily_digest.fallback", {
          status: response.status,
          reason: getOpenRouterFailureReason(payload),
        });
      } else {
        const parsed = safeJson(payload.choices?.[0]?.message?.content);
        body = normalizeString(parsed?.body_md) ?? body;
        usage = payload.usage ?? null;
      }
    } catch (aiError) {
      logWorkerWarning("openrouter.daily_digest.fallback", {
        reason: getSafeErrorMessage(aiError),
      });
    }
  }

  const { data: digest } = await supabase
    .from("digests")
    .insert({
      digest_type: "daily_news",
      date_key: dateKey,
      title,
      body_md: body,
      ai_model: model,
      status: "published",
      generated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (digest?.id && usage) {
    await supabase.from("ai_usage_logs").insert({
      purpose: "news.daily_digest",
      provider: "openrouter",
      model,
      input_tokens: usage.prompt_tokens ?? null,
      output_tokens: usage.completion_tokens ?? null,
      estimated_cost_usd: null,
      related_digest_id: digest.id,
    });
  }

  return {
    itemsProcessed: articles?.length ?? 0,
    metadata: { dateKey, model, windowStart },
  };
}

async function syncCalendar() {
  const baseUrl = process.env.JOLPICA_BASE_URL ?? "https://api.jolpi.ca/ergast/f1";
  const season = new Date().getUTCFullYear();
  const response = await fetch(`${baseUrl}/${season}.json`);
  const payload = await response.json();
  const races = payload.MRData?.RaceTable?.Races ?? [];

  await supabase.from("seasons").upsert({ year: season });

  let itemsProcessed = 0;

  for (const race of races) {
    const circuit = race.Circuit;
    const { data: circuitRow } = await supabase
      .from("circuits")
      .upsert(
        {
          external_id: circuit.circuitId,
          name: circuit.circuitName,
          country: circuit.Location?.country,
          locality: circuit.Location?.locality,
          latitude: Number(circuit.Location?.lat ?? null),
          longitude: Number(circuit.Location?.long ?? null),
        },
        { onConflict: "external_id" },
      )
      .select("id")
      .single();

    const raceStartAt = race.date ? `${race.date}T${race.time ?? "00:00:00Z"}` : null;
    const raceStatus = isPastDate(raceStartAt) ? "completed" : "scheduled";
    const { data: raceRow } = await supabase.from("races").upsert(
      {
        season_year: season,
        round: Number(race.round),
        race_name: race.raceName,
        circuit_id: circuitRow?.id,
        official_url: race.url,
        race_start_at: raceStartAt,
        status: raceStatus,
      },
      { onConflict: "season_year,round" },
    )
      .select("id")
      .single();
    await upsertScheduleSessions(raceRow?.id, race, raceStatus);
    itemsProcessed += 1;
  }

  return { itemsProcessed, metadata: { season } };
}

async function syncResults() {
  const baseUrl = process.env.JOLPICA_BASE_URL ?? "https://api.jolpi.ca/ergast/f1";
  const season = Number(process.env.F1_SEASON ?? new Date().getUTCFullYear());
  const [raceResponse, qualifyingResponse, sprintResponse] = await Promise.all([
    fetch(`${baseUrl}/${season}/results.json?limit=1000`),
    fetch(`${baseUrl}/${season}/qualifying.json?limit=1000`),
    fetch(`${baseUrl}/${season}/sprint.json?limit=1000`),
  ]);
  const racePayload = await raceResponse.json();
  const qualifyingPayload = await qualifyingResponse.json();
  const sprintPayload = await sprintResponse.json();
  let raceRows = racePayload.MRData?.RaceTable?.Races ?? [];
  const qualifyingRows = qualifyingPayload.MRData?.RaceTable?.Races ?? [];
  let sprintRows = sprintPayload.MRData?.RaceTable?.Races ?? [];

  raceRows = await addPerRoundJolpicaRowsForCompletedRaces({
    baseUrl,
    endpoint: "results",
    resultKey: "Results",
    rows: raceRows,
    season,
  });
  sprintRows = await addPerRoundJolpicaRowsForCompletedRaces({
    baseUrl,
    endpoint: "sprint",
    resultKey: "SprintResults",
    rows: sprintRows,
    season,
  });
  let itemsProcessed = 0;

  for (const race of raceRows) {
    const raceId = await findRaceId(season, Number(race.round));
    const sessionId = raceId
      ? await findOrCreateSession(raceId, "race", "Гонка", race.date, race.time)
      : null;

    if (!raceId || !sessionId) {
      continue;
    }

    await supabase
      .from("races")
      .update({ status: "completed" })
      .eq("id", raceId);

    for (const result of race.Results ?? []) {
      const team = await upsertTeamFromJolpica(result.Constructor);
      const driver = await upsertDriverFromJolpica(result.Driver, team?.id);

      if (!driver?.id) {
        continue;
      }

      await supabase.from("session_results").upsert(
        {
          session_id: sessionId,
          driver_id: driver.id,
          team_id: team?.id ?? driver.current_team_id,
          position: numberOrNull(result.position),
          classified_position: result.positionText ?? null,
          grid: numberOrNull(result.grid),
          laps: numberOrNull(result.laps),
          points: numberOrNull(result.points),
          status: result.status ?? null,
          time_text: result.Time?.time ?? null,
          raw_payload: result,
        },
        { onConflict: "session_id,driver_id" },
      );
      itemsProcessed += 1;
    }
  }

  for (const race of qualifyingRows) {
    const raceId = await findRaceId(season, Number(race.round));
    const sessionId = raceId
      ? await findOrCreateSession(raceId, "qualifying", "Квалификация", race.date, race.time)
      : null;

    if (!sessionId) {
      continue;
    }

    // OpenF1 lap sync can provide a useful fallback, but Jolpica is the source of
    // truth for the official qualifying classification.
    await supabase
      .from("session_results")
      .delete()
      .eq("session_id", sessionId)
      .in("status", ["Лучший круг", "Лучшее время"]);

    for (const result of race.QualifyingResults ?? []) {
      const team = await upsertTeamFromJolpica(result.Constructor);
      const driver = await upsertDriverFromJolpica(result.Driver, team?.id);

      if (!driver?.id) {
        continue;
      }

      await supabase.from("session_results").upsert(
        {
          session_id: sessionId,
          driver_id: driver.id,
          team_id: team?.id ?? driver.current_team_id,
          position: numberOrNull(result.position),
          classified_position: result.position ?? null,
          time_text: getBestQualifyingTime(result),
          status: getQualifyingStatus(result),
          raw_payload: result,
        },
        { onConflict: "session_id,driver_id" },
      );
      itemsProcessed += 1;
    }
  }

  for (const race of sprintRows) {
    const raceId = await findRaceId(season, Number(race.round));
    const sessionId = raceId
      ? await findOrCreateSession(raceId, "sprint", "Спринт", race.date, race.time)
      : null;

    if (!sessionId) {
      continue;
    }

    for (const result of race.SprintResults ?? []) {
      const team = await upsertTeamFromJolpica(result.Constructor);
      const driver = await upsertDriverFromJolpica(result.Driver, team?.id);

      if (!driver?.id) {
        continue;
      }

      await supabase.from("session_results").upsert(
        {
          session_id: sessionId,
          driver_id: driver.id,
          team_id: team?.id ?? driver.current_team_id,
          position: numberOrNull(result.position),
          classified_position: result.positionText ?? null,
          grid: numberOrNull(result.grid),
          laps: numberOrNull(result.laps),
          points: numberOrNull(result.points),
          status: result.status ?? null,
          time_text: result.Time?.time ?? null,
          raw_payload: result,
        },
        { onConflict: "session_id,driver_id" },
      );
      itemsProcessed += 1;
    }
  }

  return { itemsProcessed, metadata: { season } };
}

async function repairRaceResults() {
  const baseUrl = process.env.JOLPICA_BASE_URL ?? "https://api.jolpi.ca/ergast/f1";
  const season = numberOrNull(getCliOption("season")) ?? Number(process.env.F1_SEASON ?? new Date().getUTCFullYear());
  const [raceResponse, sprintResponse] = await Promise.all([
    fetch(`${baseUrl}/${season}/results.json?limit=1000`),
    fetch(`${baseUrl}/${season}/sprint.json?limit=1000`),
  ]);
  const racePayload = await raceResponse.json();
  const sprintPayload = await sprintResponse.json();
  let raceRows = racePayload.MRData?.RaceTable?.Races ?? [];
  let sprintRows = sprintPayload.MRData?.RaceTable?.Races ?? [];

  raceRows = await addPerRoundJolpicaRowsForCompletedRaces({
    baseUrl,
    endpoint: "results",
    resultKey: "Results",
    rows: raceRows,
    season,
  });
  sprintRows = await addPerRoundJolpicaRowsForCompletedRaces({
    baseUrl,
    endpoint: "sprint",
    resultKey: "SprintResults",
    rows: sprintRows,
    season,
  });
  let itemsProcessed = 0;

  for (const race of raceRows) {
    itemsProcessed += await repairJolpicaClassificationSession({
      race,
      season,
      sessionType: "race",
      sessionName: "Гонка",
      results: race.Results ?? [],
    });
  }

  for (const race of sprintRows) {
    itemsProcessed += await repairJolpicaClassificationSession({
      race,
      season,
      sessionType: "sprint",
      sessionName: "Спринт",
      results: race.SprintResults ?? [],
    });
  }

  return { itemsProcessed, metadata: { season, raceRows: raceRows.length, sprintRows: sprintRows.length } };
}

async function repairQualifyingResults() {
  const baseUrl = process.env.JOLPICA_BASE_URL ?? "https://api.jolpi.ca/ergast/f1";
  const season = numberOrNull(getCliOption("season")) ?? Number(process.env.F1_SEASON ?? new Date().getUTCFullYear());
  const response = await fetch(`${baseUrl}/${season}/qualifying.json?limit=1000`);
  const payload = await response.json();
  let qualifyingRows = payload.MRData?.RaceTable?.Races ?? [];

  qualifyingRows = await addPerRoundJolpicaRowsForCompletedRaces({
    baseUrl,
    endpoint: "qualifying",
    resultKey: "QualifyingResults",
    rows: qualifyingRows,
    season,
  });

  let itemsProcessed = 0;

  for (const race of qualifyingRows) {
    itemsProcessed += await repairJolpicaQualifyingSession({
      race,
      season,
      results: race.QualifyingResults ?? [],
    });
  }

  return { itemsProcessed, metadata: { season, qualifyingRows: qualifyingRows.length } };
}

async function addPerRoundJolpicaRowsForCompletedRaces({ baseUrl, endpoint, resultKey, rows, season }) {
  const byRound = new Map(
    (rows ?? [])
      .map((race) => [Number(race.round), race])
      .filter(([round]) => Number.isFinite(round) && round > 0),
  );
  const rounds = await getCompletedRaceRounds(season);

  for (const round of rounds) {
    if (byRound.has(round)) {
      continue;
    }

    try {
      const payload = await fetchJolpicaJsonObject(`${baseUrl}/${season}/${round}/${endpoint}.json?limit=1000`);
      const race = payload.MRData?.RaceTable?.Races?.[0];
      const results = race?.[resultKey] ?? [];

      if (race && results.length) {
        byRound.set(round, race);
      }
    } catch (error) {
      console.warn(`Jolpica per-round ${endpoint} fetch failed for ${season}/${round}: ${error.message}`);
    }
  }

  return [...byRound.values()].sort((a, b) => Number(a.round) - Number(b.round));
}

async function fetchJolpicaJsonObject(url, attempt = 1) {
  const response = await fetch(url, {
    headers: { "user-agent": "RaceMate/0.1 (+https://racemate.local)" },
  });
  const payload = await response.json();

  if (response.status === 429 && attempt < 4) {
    await sleep(2500 * attempt);
    return fetchJolpicaJsonObject(url, attempt + 1);
  }

  if (!response.ok || !payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`Jolpica fetch failed ${response.status}: ${url}`);
  }

  return payload;
}

async function getCompletedRaceRounds(season) {
  const { data, error } = await supabase
    .from("races")
    .select("round, race_start_at, status")
    .eq("season_year", season)
    .order("round", { ascending: true });

  if (error) {
    throw error;
  }

  const now = Date.now();

  return (data ?? [])
    .filter((race) => {
      const raceTime = race.race_start_at ? new Date(race.race_start_at).getTime() : 0;

      return race.status === "completed" || (raceTime > 0 && raceTime < now);
    })
    .map((race) => Number(race.round))
    .filter((round) => Number.isFinite(round) && round > 0);
}

async function repairJolpicaClassificationSession({ race, season, sessionType, sessionName, results }) {
  const raceId = await findRaceId(season, Number(race.round));
  const sessionId = raceId
    ? await findOrCreateSession(raceId, sessionType, sessionName, race.date, race.time)
    : null;

  if (!raceId || !sessionId || !results.length) {
    return 0;
  }

  await supabase
    .from("session_results")
    .delete()
    .eq("session_id", sessionId)
    .in("status", ["Лучший круг", "Лучшее время"]);

  if (sessionType === "race") {
    await supabase.from("races").update({ status: "completed" }).eq("id", raceId);
  }

  let itemsProcessed = 0;

  for (const result of results) {
    const team = await upsertTeamFromJolpica(result.Constructor);
    const driver = await upsertDriverFromJolpica(result.Driver, team?.id);

    if (!driver?.id) {
      continue;
    }

    await supabase.from("session_results").upsert(
      {
        session_id: sessionId,
        driver_id: driver.id,
        team_id: team?.id ?? driver.current_team_id,
        position: numberOrNull(result.position),
        classified_position: result.positionText ?? null,
        grid: numberOrNull(result.grid),
        laps: numberOrNull(result.laps),
        points: numberOrNull(result.points),
        status: result.status ?? null,
        time_text: result.Time?.time ?? null,
        raw_payload: result,
      },
      { onConflict: "session_id,driver_id" },
    );
    itemsProcessed += 1;
  }

  return itemsProcessed;
}

async function repairJolpicaQualifyingSession({ race, season, results }) {
  const raceId = await findRaceId(season, Number(race.round));
  const sessionId = raceId
    ? await findOrCreateSession(raceId, "qualifying", "Квалификация", race.date, race.time)
    : null;

  if (!sessionId || !results.length) {
    return 0;
  }

  await supabase
    .from("session_results")
    .delete()
    .eq("session_id", sessionId)
    .in("status", ["Лучший круг", "Лучшее время"]);

  let itemsProcessed = 0;

  for (const result of results) {
    const team = await upsertTeamFromJolpica(result.Constructor);
    const driver = await upsertDriverFromJolpica(result.Driver, team?.id);

    if (!driver?.id) {
      continue;
    }

    await supabase.from("session_results").upsert(
      {
        session_id: sessionId,
        driver_id: driver.id,
        team_id: team?.id ?? driver.current_team_id,
        position: numberOrNull(result.position),
        classified_position: result.position ?? null,
        time_text: getBestQualifyingTime(result),
        status: getQualifyingStatus(result),
        raw_payload: result,
      },
      { onConflict: "session_id,driver_id" },
    );
    itemsProcessed += 1;
  }

  return itemsProcessed;
}

async function syncStandings() {
  const baseUrl = process.env.JOLPICA_BASE_URL ?? "https://api.jolpi.ca/ergast/f1";
  const season = Number(process.env.F1_SEASON ?? new Date().getUTCFullYear());
  const [driversResponse, constructorsResponse] = await Promise.all([
    fetch(`${baseUrl}/${season}/driverstandings.json`),
    fetch(`${baseUrl}/${season}/constructorstandings.json`),
  ]);
  const driversPayload = await driversResponse.json();
  const constructorsPayload = await constructorsResponse.json();
  const driverLists = driversPayload.MRData?.StandingsTable?.StandingsLists ?? [];
  const constructorLists = constructorsPayload.MRData?.StandingsTable?.StandingsLists ?? [];
  let itemsProcessed = 0;

  await supabase.from("seasons").upsert({ year: season });

  for (const list of driverLists) {
    const round = numberOrNull(list.round);

    for (const standing of list.DriverStandings ?? []) {
      const constructor = standing.Constructors?.[0];
      const team = await upsertTeamFromJolpica(constructor);
      const driver = await upsertDriverFromJolpica(standing.Driver, team?.id);

      if (!driver?.id) {
        continue;
      }

      await supabase.from("driver_standings").upsert(
        {
          season_year: season,
          round,
          driver_id: driver.id,
          team_id: team?.id ?? driver.current_team_id,
          position: numberOrNull(standing.position),
          points: numberOrNull(standing.points) ?? 0,
          wins: numberOrNull(standing.wins) ?? 0,
          raw_payload: standing,
        },
        { onConflict: "season_year,round,driver_id" },
      );
      itemsProcessed += 1;
    }
  }

  for (const list of constructorLists) {
    const round = numberOrNull(list.round);

    for (const standing of list.ConstructorStandings ?? []) {
      const team = await upsertTeamFromJolpica(standing.Constructor);

      if (!team?.id) {
        continue;
      }

      await supabase.from("constructor_standings").upsert(
        {
          season_year: season,
          round,
          team_id: team.id,
          position: numberOrNull(standing.position),
          points: numberOrNull(standing.points) ?? 0,
          wins: numberOrNull(standing.wins) ?? 0,
          raw_payload: standing,
        },
        { onConflict: "season_year,round,team_id" },
      );
      itemsProcessed += 1;
    }
  }

  return { itemsProcessed, metadata: { season } };
}

async function syncOpenF1Sessions() {
  const baseUrl = process.env.OPENF1_BASE_URL ?? "https://api.openf1.org/v1";
  const season = Number(process.env.F1_SEASON ?? new Date().getUTCFullYear());
  const [openF1Sessions, localSessions, circuits] = await Promise.all([
    fetchJson(`${baseUrl}/sessions?year=${season}`),
    getLocalSessionsForOpenF1(season),
    getCircuitsForLayouts(),
  ]);

  let matchedSessions = 0;
  let layouts = 0;

  for (const session of localSessions) {
    const match = findOpenF1SessionMatch(session, openF1Sessions);

    if (!match?.session_key) {
      continue;
    }

    await supabase
      .from("sessions")
      .update({
        openf1_session_key: Number(match.session_key),
        end_at: match.date_end ? new Date(match.date_end).toISOString() : session.end_at,
      })
      .eq("id", session.id);
    matchedSessions += 1;
  }

  for (const circuit of circuits) {
    const existingLayout = await getExistingCircuitLayout(circuit.id);

    if (existingLayout?.raw_payload?.lap_start) {
      continue;
    }

    const sourceSessions = await findLayoutSourceSessions(baseUrl, circuit, season, openF1Sessions);
    let layout = null;
    let sourceSession = null;

    for (const candidate of sourceSessions) {
      layout = await buildCircuitLayoutFromOpenF1(baseUrl, candidate.session_key);

      if (layout) {
        sourceSession = candidate;
        break;
      }
    }

    if (!layout || !sourceSession?.session_key) {
      continue;
    }

    await supabase.from("circuit_layouts").upsert(
      {
        circuit_id: circuit.id,
        provider: "openf1",
        svg_path: layout.svgPath,
        view_box: layout.viewBox,
        source_session_key: Number(sourceSession.session_key),
        raw_payload: layout.metadata,
      },
      { onConflict: "circuit_id,provider" },
    );
    layouts += 1;
  }

  return { itemsProcessed: matchedSessions + layouts, metadata: { season, matchedSessions, layouts } };
}

async function syncOpenF1Laps() {
  const baseUrl = process.env.OPENF1_BASE_URL ?? "https://api.openf1.org/v1";
  const season = Number(process.env.F1_SEASON ?? new Date().getUTCFullYear());
  const { data: sessions, error } = await supabase
    .from("sessions")
    .select("id, session_type, openf1_session_key, races(season_year)")
    .not("openf1_session_key", "is", null)
    .lte("start_at", new Date().toISOString())
    .order("start_at", { ascending: false, nullsFirst: false })
    .limit(Number(process.env.OPENF1_MAX_LAP_SESSIONS ?? 40));

  if (error) {
    throw error;
  }

  const drivers = await getDriverMapByNumber();
  let itemsProcessed = 0;

  for (const session of sessions ?? []) {
    const race = Array.isArray(session.races) ? session.races[0] : session.races;

    if (race?.season_year !== season && Number(process.env.OPENF1_SYNC_ALL_YEARS ?? 0) !== 1) {
      continue;
    }

    const sessionType = String(session.session_type);
    if (["race", "sprint"].includes(sessionType)) {
      continue;
    }

    if (sessionType === "qualifying" && await hasOfficialQualifyingClassification(session.id)) {
      continue;
    }

    let laps = [];

    try {
      laps = await fetchJson(`${baseUrl}/laps?session_key=${session.openf1_session_key}`);
    } catch {
      continue;
    }

    const bestLaps = getBestLapsByDriver(laps);

    for (const [index, lap] of bestLaps.entries()) {
      const driver = drivers.get(Number(lap.driver_number));

      if (!driver?.id) {
        continue;
      }

      await supabase.from("session_results").upsert(
        {
          session_id: session.id,
          driver_id: driver.id,
          team_id: driver.current_team_id ?? null,
          position: index + 1,
          classified_position: String(index + 1),
          laps: numberOrNull(lap.lap_number),
          status: "Лучшее время",
          time_text: formatLapDuration(lap.lap_duration),
          raw_payload: lap,
        },
        { onConflict: "session_id,driver_id" },
      );
      itemsProcessed += 1;
    }
  }

  return { itemsProcessed, metadata: { season } };
}

async function hasOfficialQualifyingClassification(sessionId) {
  const { data, error } = await supabase
    .from("session_results")
    .select("status, raw_payload")
    .eq("session_id", sessionId)
    .limit(25);

  if (error) {
    throw error;
  }

  return (data ?? []).some((result) => {
    const status = String(result.status ?? "").trim().toLowerCase();

    if (["лучший круг", "лучшее время"].includes(status)) {
      return false;
    }

    if (["q1", "q2", "q3"].includes(status)) {
      return true;
    }

    const rawPayload = result.raw_payload;
    return Boolean(rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload) && "Driver" in rawPayload);
  });
}

async function syncWeekendWeather() {
  const race = await getCurrentRaceForWorker("id, circuit_id, circuits(id, latitude, longitude)");

  const circuit = Array.isArray(race?.circuits) ? race?.circuits[0] : race?.circuits;

  if (!circuit?.latitude || !circuit?.longitude) {
    return { itemsProcessed: 0, metadata: { note: "No circuit coordinates" } };
  }

  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, race_id, start_at")
    .eq("race_id", race.id)
    .not("start_at", "is", null)
    .order("start_at", { ascending: true });

  const baseUrl = process.env.OPEN_METEO_BASE_URL ?? "https://api.open-meteo.com/v1";
  const sessionDates = (sessions ?? []).map((session) => new Date(session.start_at));
  const startDate = formatIsoDate(new Date(Math.min(...sessionDates.map((date) => date.getTime()), Date.now())));
  const endDate = formatIsoDate(new Date(Math.max(...sessionDates.map((date) => date.getTime()), Date.now())));
  const response = await fetch(
    `${baseUrl}/forecast?latitude=${circuit.latitude}&longitude=${circuit.longitude}&current=temperature_2m,wind_speed_10m,precipitation&hourly=temperature_2m,wind_speed_10m,precipitation,weather_code&timezone=UTC&start_date=${startDate}&end_date=${endDate}`,
  );
  const weather = await response.json();
  let itemsProcessed = 0;

  await supabase.from("circuit_weather").upsert(
    {
      race_id: race.id,
      circuit_id: circuit.id ?? null,
      temperature_c: weather.current?.temperature_2m ?? null,
      wind_speed_kmh: weather.current?.wind_speed_10m ?? null,
      precipitation_mm: weather.current?.precipitation ?? null,
      weather_code: weather.current?.weather_code ?? null,
      observed_at: weather.current?.time
        ? new Date(weather.current.time).toISOString()
        : new Date().toISOString(),
      provider: "open-meteo",
      raw_payload: weather,
    },
    { onConflict: "race_id,provider" },
  );
  itemsProcessed += 1;

  for (const session of sessions ?? []) {
    const forecast = pickHourlyForecast(weather.hourly, session.start_at);

    if (!forecast) {
      continue;
    }

    await supabase.from("session_weather").upsert(
      {
        session_id: session.id,
        race_id: race.id,
        circuit_id: circuit.id ?? race.circuit_id ?? null,
        temperature_c: forecast.temperature_c,
        wind_speed_kmh: forecast.wind_speed_kmh,
        precipitation_mm: forecast.precipitation_mm,
        weather_code: forecast.weather_code,
        forecast_at: forecast.forecast_at,
        provider: "open-meteo",
        raw_payload: forecast,
      },
      { onConflict: "session_id,provider" },
    );
    itemsProcessed += 1;
  }

  return { itemsProcessed, metadata: { weather: weather.current ?? null, sessions: sessions?.length ?? 0 } };
}

async function getCurrentRaceForWorker(select) {
  const nowIso = new Date().toISOString();
  const weekendWindowIso = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
  const baseSelect = select ?? "id, season_year, round, race_name, race_start_at";

  const { data: upcoming } = await supabase
    .from("races")
    .select(baseSelect)
    .gte("race_start_at", weekendWindowIso)
    .order("race_start_at", { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (upcoming) {
    return upcoming;
  }

  const { data: latest } = await supabase
    .from("races")
    .select(baseSelect)
    .lte("race_start_at", nowIso)
    .order("race_start_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  return latest ?? null;
}

async function fetchJson(url, attempt = 1) {
  const response = await fetch(url, {
    headers: { "user-agent": "RaceMate/0.1 (+https://racemate.local)" },
  });
  const payload = await response.json();

  if (response.status === 429 && attempt < 4) {
    await sleep(2500 * attempt);
    return fetchJson(url, attempt + 1);
  }

  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status}: ${url}`);
  }

  return Array.isArray(payload) ? payload : [];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getLocalSessionsForOpenF1(season) {
  const { data, error } = await supabase
    .from("sessions")
    .select("id, race_id, session_type, name, start_at, end_at, races(season_year, round, race_name, circuits(id, external_id, name, country, locality))")
    .order("start_at", { ascending: true, nullsFirst: false });

  if (error) {
    throw error;
  }

  return (data ?? []).filter((session) => {
    const race = Array.isArray(session.races) ? session.races[0] : session.races;
    return race?.season_year === season;
  });
}

async function getCircuitsForLayouts() {
  const { data, error } = await supabase
    .from("circuits")
    .select("id, external_id, name, country, locality")
    .order("name");

  if (error) {
    throw error;
  }

  return data ?? [];
}

function findOpenF1SessionMatch(localSession, openF1Sessions) {
  const race = Array.isArray(localSession.races) ? localSession.races[0] : localSession.races;
  const circuit = Array.isArray(race?.circuits) ? race?.circuits[0] : race?.circuits;
  const localType = normalizeSessionType(localSession.session_type);
  const localStart = localSession.start_at ? new Date(localSession.start_at).getTime() : null;

  return (openF1Sessions ?? [])
    .map((session) => ({
      session,
      score:
        scoreCircuitMatch(circuit, session) +
        (normalizeSessionType(session.session_type ?? session.session_name) === localType ? 40 : 0) +
        scoreDateMatch(localStart, session.date_start),
    }))
    .filter((item) => item.score >= 55)
    .sort((a, b) => b.score - a.score)[0]?.session ?? null;
}

async function getExistingCircuitLayout(circuitId) {
  const { data } = await supabase
    .from("circuit_layouts")
    .select("id, raw_payload")
    .eq("circuit_id", circuitId)
    .eq("provider", "openf1")
    .maybeSingle();

  return data ?? null;
}

async function findLayoutSourceSessions(baseUrl, circuit, season, currentYearSessions) {
  const years = [season, season - 1, season - 2, season - 3];
  const candidates = [];

  for (const year of years) {
    const sessions = await getOpenF1SessionsForYear(baseUrl, year, season, currentYearSessions);
    candidates.push(
      ...(sessions ?? [])
      .map((session) => ({ session, score: scoreCircuitMatch(circuit, session) }))
      .filter((item) => item.score >= 30)
      .sort((a, b) => {
        const typeScore = scoreLayoutSessionType(b.session) - scoreLayoutSessionType(a.session);
        return typeScore || b.score - a.score;
      })
      .map((item) => item.session),
    );
  }

  return candidates.filter((session) => session?.session_key);
}

async function getOpenF1SessionsForYear(baseUrl, year, currentSeason, currentYearSessions) {
  if (year === currentSeason) {
    return currentYearSessions;
  }

  if (openF1SessionsByYear.has(year)) {
    return openF1SessionsByYear.get(year);
  }

  const sessions = await fetchJson(`${baseUrl}/sessions?year=${year}`);
  openF1SessionsByYear.set(year, sessions);

  return sessions;
}

async function buildCircuitLayoutFromOpenF1(baseUrl, sessionKey) {
  let lapsPayload = [];

  try {
    lapsPayload = await fetchJson(`${baseUrl}/laps?session_key=${sessionKey}`);
  } catch {
    return null;
  }

  const laps = getBestLapsByDriver(lapsPayload);
  const sourceLap = laps[0];

  if (!sourceLap?.driver_number) {
    return null;
  }

  let locations = [];

  try {
    locations = await fetchJson(
      `${baseUrl}/location?session_key=${sessionKey}&driver_number=${sourceLap.driver_number}`,
    );
  } catch {
    return null;
  }
  const lapStart = sourceLap.date_start ? new Date(sourceLap.date_start).getTime() : null;
  const lapDurationMs = Number.isFinite(Number(sourceLap.lap_duration))
    ? Number(sourceLap.lap_duration) * 1000
    : null;
  const lapEnd = lapStart && lapDurationMs ? lapStart + lapDurationMs : null;
  const allPoints = locations
    .sort((a, b) => new Date(a.date ?? 0).getTime() - new Date(b.date ?? 0).getTime())
    .map((item) => ({
      x: Number(item.x),
      y: Number(item.z ?? item.y),
      date: item.date ? new Date(item.date).getTime() : null,
    }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  const lapPoints =
    lapStart && lapEnd
      ? allPoints.filter(
          (point) =>
            point.date !== null &&
            point.date >= lapStart - 2_000 &&
            point.date <= lapEnd + 2_000,
        )
      : [];
  const points = filterTrackPointOutliers(lapPoints.length >= 80 ? lapPoints : allPoints);

  if (points.length < 80) {
    return null;
  }

  const simplified = simplifyTrackPoints(points, 220);
  const normalized = normalizeTrackPoints(simplified, 480, 320, 28);
  const svgPath = normalized
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");

  return {
    svgPath: `${svgPath} Z`,
    viewBox: "0 0 480 320",
    metadata: {
      session_key: Number(sessionKey),
      driver_number: Number(sourceLap.driver_number),
      lap_number: numberOrNull(sourceLap.lap_number),
      lap_duration: numberOrNull(sourceLap.lap_duration),
      lap_start: sourceLap.date_start ?? null,
      lap_end: lapEnd ? new Date(lapEnd).toISOString() : null,
      points: points.length,
      source_points: allPoints.length,
    },
  };
}

async function getDriverMapByNumber() {
  const { data, error } = await supabase
    .from("drivers")
    .select("id, permanent_number, current_team_id");

  if (error) {
    throw error;
  }

  return new Map(
    (data ?? [])
      .filter((driver) => driver.permanent_number !== null)
      .map((driver) => [Number(driver.permanent_number), driver]),
  );
}

function getBestLapsByDriver(laps) {
  const byDriver = new Map();

  for (const lap of laps ?? []) {
    const driverNumber = Number(lap.driver_number);
    const lapDuration = Number(lap.lap_duration);

    if (!Number.isFinite(driverNumber) || !Number.isFinite(lapDuration) || lapDuration <= 0) {
      continue;
    }

    const previous = byDriver.get(driverNumber);

    if (!previous || Number(previous.lap_duration) > lapDuration) {
      byDriver.set(driverNumber, lap);
    }
  }

  return [...byDriver.values()].sort((a, b) => Number(a.lap_duration) - Number(b.lap_duration));
}

function scoreCircuitMatch(circuit, session) {
  const haystack = [
    session.circuit_short_name,
    session.location,
    session.country_name,
    session.country_code,
    session.meeting_name,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/[_-]/g, " ")
    .toLowerCase();
  const needles = [
    circuit?.external_id,
    circuit?.name,
    circuit?.locality,
    String(circuit?.name ?? "").replace(/^circuit\s+(de|of)\s+/i, ""),
    ...String(circuit?.name ?? "")
      .split(/[\s-]+/)
      .filter((part) => part.length > 4),
  ]
    .filter(Boolean)
    .map((value) => String(value).replace(/[_-]/g, " ").toLowerCase());

  if (needles.some((needle) => needle.length > 3 && haystack.includes(needle))) {
    return 35;
  }

  return circuit?.country && haystack.includes(String(circuit.country).toLowerCase()) ? 10 : 0;
}

function scoreDateMatch(localStart, openF1Start) {
  if (!localStart || !openF1Start) {
    return 0;
  }

  const diffHours = Math.abs(localStart - new Date(openF1Start).getTime()) / 3_600_000;

  if (diffHours <= 2) {
    return 40;
  }

  if (diffHours <= 12) {
    return 25;
  }

  if (diffHours <= 36) {
    return 10;
  }

  return 0;
}

function scoreLayoutSessionType(session) {
  const type = normalizeSessionType(session.session_type ?? session.session_name);

  if (type === "qualifying" || type === "race") {
    return 3;
  }

  if (type === "fp1" || type === "fp2" || type === "fp3") {
    return 2;
  }

  return 1;
}

function normalizeSessionType(value) {
  const normalized = String(value ?? "").toLowerCase();

  if (normalized.includes("practice 1") || normalized === "fp1") return "fp1";
  if (normalized.includes("practice 2") || normalized === "fp2") return "fp2";
  if (normalized.includes("practice 3") || normalized === "fp3") return "fp3";
  if (normalized.includes("sprint") && normalized.includes("qual")) return "sprint_qualifying";
  if (normalized.includes("sprint")) return "sprint";
  if (normalized.includes("qual")) return "qualifying";
  if (normalized.includes("race")) return "race";

  return normalized;
}

function simplifyTrackPoints(points, maxPoints) {
  const step = Math.max(1, Math.ceil(points.length / maxPoints));
  return points.filter((_, index) => index % step === 0);
}

function filterTrackPointOutliers(points) {
  if (points.length < 3) {
    return points;
  }

  const distances = [];

  for (let index = 1; index < points.length; index += 1) {
    distances.push(distanceBetween(points[index - 1], points[index]));
  }

  const sorted = [...distances].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 1;
  const maxDistance = Math.max(median * 8, 250);

  return points.filter((point, index) => {
    if (index === 0) {
      return true;
    }

    return distanceBetween(points[index - 1], point) <= maxDistance;
  });
}

function distanceBetween(a, b) {
  return Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y));
}

function normalizeTrackPoints(points, width, height, padding) {
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const sourceWidth = Math.max(1, maxX - minX);
  const sourceHeight = Math.max(1, maxY - minY);
  const scale = Math.min((width - padding * 2) / sourceWidth, (height - padding * 2) / sourceHeight);
  const offsetX = (width - sourceWidth * scale) / 2;
  const offsetY = (height - sourceHeight * scale) / 2;

  return points.map((point) => ({
    x: offsetX + (point.x - minX) * scale,
    y: height - (offsetY + (point.y - minY) * scale),
  }));
}

async function scorePredictions() {
  const { data: races, error } = await supabase
    .from("races")
    .select("id, season_year, round")
    .eq("status", "completed")
    .order("season_year", { ascending: false })
    .order("round", { ascending: false })
    .limit(5);

  if (error) {
    throw error;
  }

  let itemsProcessed = 0;

  for (const race of races ?? []) {
    const actual = await getRaceActuals(race.id);

    if (!actual.top10DriverIds.length && !actual.poleDriverId) {
      continue;
    }

    const { data: predictions } = await supabase
      .from("predictions")
      .select("id, top10_driver_ids, winner_driver_id, pole_driver_id, fastest_lap_driver_id, dnf_driver_id, dnf_pick_kind, top_scoring_team_id, fastest_pit_stop_team_id")
      .eq("race_id", race.id);

    for (const prediction of predictions ?? []) {
      const breakdown = scoreFantasyPrediction(prediction, actual);

      await supabase
        .from("predictions")
        .update({
          score: breakdown.total,
          score_breakdown: breakdown,
          scored_at: new Date().toISOString(),
        })
        .eq("id", prediction.id);
      itemsProcessed += 1;
    }
  }

  return { itemsProcessed };
}

async function getRaceActuals(raceId) {
  const { data: race } = await supabase
    .from("races")
    .select("season_year, round")
    .eq("id", raceId)
    .maybeSingle();

  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, session_type")
    .eq("race_id", raceId)
    .in("session_type", ["race", "sprint", "qualifying"]);

  const raceSessionId = sessions?.find((session) => session.session_type === "race")?.id;
  const qualifyingSessionId = sessions?.find((session) => session.session_type === "qualifying")?.id;
  const pointsSessionIds =
    sessions
      ?.filter((session) => session.session_type === "race" || session.session_type === "sprint")
      .map((session) => session.id) ?? [];

  const [raceResults, qualifyingResults, pointsResults, teamsResult, reportResult] = await Promise.all([
    raceSessionId
      ? supabase
          .from("session_results")
          .select("driver_id, team_id, position, status, laps, points, raw_payload")
          .eq("session_id", raceSessionId)
          .order("position", { ascending: true, nullsFirst: false })
      : { data: [] },
    qualifyingSessionId
      ? supabase
          .from("session_results")
          .select("driver_id, position")
          .eq("session_id", qualifyingSessionId)
          .order("position", { ascending: true, nullsFirst: false })
      : { data: [] },
    pointsSessionIds.length
      ? supabase
          .from("session_results")
          .select("team_id, points")
          .in("session_id", pointsSessionIds)
      : { data: [] },
    supabase.from("teams").select("id, name, code, external_id").eq("is_active", true),
    race
      ? supabase
          .from("grand_prix_reports")
          .select("pit_stops, results, highlights")
          .eq("season", race.season_year)
          .eq("round", race.round)
          .in("status", ["ready", "partial"])
          .order("generated_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null },
  ]);

  const raceClassification = (raceResults.data ?? []).filter(
    (result) => result.driver_id && result.position && result.position > 0 && !isLapOnlyPredictionResult(result),
  );
  const pole = qualifyingResults.data?.find((result) => result.position === 1);
  const fastestLap = raceClassification.find(
    (result) => String(result.raw_payload?.FastestLap?.rank ?? "") === "1",
  );
  const firstDnfDriverIds = getFirstDnfDriverIds(raceClassification);
  const topScoringTeamId = getTopScoringTeamId(pointsResults.data ?? []);
  const fastestPitStopTeamId = getFastestPitStopTeamId(
    reportResult.data,
    teamsResult.data ?? [],
  );

  return {
    top10DriverIds: raceClassification
      .filter((result) => Number(result.position) >= 1 && Number(result.position) <= 10)
      .sort((a, b) => Number(a.position) - Number(b.position))
      .map((result) => result.driver_id)
      .filter(Boolean),
    winnerDriverId: raceClassification.find((result) => result.position === 1)?.driver_id ?? null,
    poleDriverId: pole?.driver_id ?? null,
    fastestLapDriverId: fastestLap?.driver_id ?? null,
    firstDnfDriverIds,
    topScoringTeamId,
    fastestPitStopTeamId,
  };
}

function getTopScoringTeamId(results) {
  const totals = new Map();

  for (const result of results ?? []) {
    if (!result.team_id) {
      continue;
    }

    const points = Number(result.points ?? 0);

    if (!Number.isFinite(points) || points <= 0) {
      continue;
    }

    totals.set(result.team_id, (totals.get(result.team_id) ?? 0) + points);
  }

  return [...totals.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}

function getFastestPitStopTeamId(report, teams) {
  if (!report || typeof report !== "object") {
    return null;
  }

  const pitStops = Array.isArray(report.pit_stops) ? report.pit_stops : [];
  const fastestPit = pitStops
    .filter((pit) => Number.isFinite(Number(pit?.duration)))
    .sort((left, right) => Number(left.duration) - Number(right.duration))[0];

  if (!fastestPit) {
    return null;
  }

  const results = Array.isArray(report.results) ? report.results : [];
  const result = results.find((item) =>
    sameNormalizedName(item?.driver, fastestPit.driver),
  );

  return resolveTeamId(result?.team, teams);
}

function resolveTeamId(teamNameOrCode, teams) {
  if (!teamNameOrCode) {
    return null;
  }

  const normalized = normalizeFantasyTeamKey(teamNameOrCode);
  const match = teams.find((team) => {
    const candidates = [team.name, team.code, team.external_id].filter(Boolean);

    return candidates.some((candidate) => {
      const normalizedCandidate = normalizeFantasyTeamKey(candidate);

      return (
        normalized === normalizedCandidate ||
        normalized.includes(normalizedCandidate) ||
        normalizedCandidate.includes(normalized)
      );
    });
  });

  return match?.id ?? null;
}

function sameNormalizedName(left, right) {
  const normalizedLeft = normalizeFantasyTeamKey(left);
  const normalizedRight = normalizeFantasyTeamKey(right);

  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft)
  );
}

function normalizeFantasyTeamKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getFirstDnfDriverIds(results) {
  const retirements = results
    .filter((result) => result.driver_id && result.status && !isFinisherStatus(result.status))
    .map((result) => ({
      driverId: result.driver_id,
      lap: Number(result.laps ?? result.raw_payload?.laps),
    }))
    .filter((result) => Number.isFinite(result.lap) && result.lap > 0);

  if (!retirements.length) {
    return [];
  }

  const firstLap = Math.min(...retirements.map((result) => result.lap));

  return retirements.filter((result) => result.lap === firstLap).map((result) => result.driverId);
}

function isLapOnlyPredictionResult(result) {
  const status = normalizeString(result.status)?.toLowerCase();

  if (status === "лучший круг" || status === "лучшее время") {
    return true;
  }

  const payload = result.raw_payload;

  return Boolean(
    payload &&
      typeof payload === "object" &&
      !Array.isArray(payload) &&
      "lap_duration" in payload &&
      "session_key" in payload &&
      "lap_number" in payload &&
      !("Driver" in payload),
  );
}

async function findRaceId(season, round) {
  const { data } = await supabase
    .from("races")
    .select("id")
    .eq("season_year", season)
    .eq("round", round)
    .maybeSingle();

  return data?.id ?? null;
}

async function findOrCreateSession(raceId, sessionType, name, date, time) {
  const startAt = date ? `${date}T${time ?? "00:00:00Z"}` : null;
  const { data: existing } = await supabase
    .from("sessions")
    .select("id, start_at")
    .eq("race_id", raceId)
    .eq("session_type", sessionType)
    .maybeSingle();

  if (existing?.id) {
    const { data } = await supabase
      .from("sessions")
      .update({
        name,
        start_at: existing.start_at ?? startAt,
        status: "completed",
      })
      .eq("id", existing.id)
      .select("id")
      .single();

    return data?.id ?? null;
  }

  const { data } = await supabase
    .from("sessions")
    .insert({
      race_id: raceId,
      session_type: sessionType,
      name,
      start_at: startAt,
      status: "completed",
    })
    .select("id")
    .single();

  return data?.id ?? null;
}

async function upsertScheduleSessions(raceId, race, raceStatus) {
  if (!raceId) {
    return;
  }

  const schedule = [
    ["fp1", "Свободная практика 1", race.FirstPractice],
    ["fp2", "Свободная практика 2", race.SecondPractice],
    ["fp3", "Свободная практика 3", race.ThirdPractice],
    ["sprint_qualifying", "Спринт-квалификация", race.SprintQualifying ?? race.SprintShootout],
    ["sprint", "Спринт", race.Sprint],
    ["qualifying", "Квалификация", race.Qualifying],
    ["race", "Гонка", { date: race.date, time: race.time }],
  ];

  for (const [sessionType, name, value] of schedule) {
    if (!value?.date) {
      continue;
    }

    const startAt = `${value.date}T${value.time ?? "00:00:00Z"}`;
    const status = raceStatus === "completed" || isPastDate(startAt) ? "completed" : "scheduled";

    await supabase.from("sessions").upsert(
      {
        race_id: raceId,
        session_type: sessionType,
        name,
        start_at: startAt,
        status,
      },
      { onConflict: "race_id,session_type" },
    );
  }
}

async function getRaceChoices() {
  const { data } = await supabase
    .from("races")
    .select("id, season_year, round, race_name, circuits(name, country, locality)")
    .order("season_year", { ascending: false })
    .order("round", { ascending: true })
    .limit(30);

  return (data ?? []).map((race) => {
    const circuit = Array.isArray(race.circuits) ? race.circuits[0] : race.circuits;

    return {
      id: race.id,
      season_year: race.season_year,
      round: race.round,
      race_name: race.race_name,
      circuit_name: circuit?.name ?? "",
      country: circuit?.country ?? "",
      locality: circuit?.locality ?? "",
    };
  });
}

async function getDriverTagChoices() {
  const { data } = await supabase
    .from("drivers")
    .select("id, code, first_name, last_name, full_name, teams:current_team_id(id, name, short_name, code)")
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  return (data ?? []).map((driver) => {
    const team = Array.isArray(driver.teams) ? driver.teams[0] : driver.teams;

    return {
      id: driver.id,
      code: driver.code ?? "",
      firstName: driver.first_name ?? "",
      lastName: driver.last_name ?? "",
      fullName: driver.full_name ?? "",
      slug: `driver-${slugify(driver.full_name ?? driver.code ?? driver.id)}`,
      team: team
        ? {
            id: team.id,
            code: team.code ?? "",
            name: team.short_name ?? team.name ?? "",
            slug: makeTeamTagSlug(team.code ?? team.short_name ?? team.name ?? team.id),
          }
        : null,
    };
  });
}

async function getTeamTagChoices() {
  const { data } = await supabase
    .from("teams")
    .select("id, name, short_name, code")
    .eq("is_active", true)
    .order("name", { ascending: true });

  return (data ?? []).map((team) => ({
    id: team.id,
    code: team.code ?? "",
    name: team.short_name ?? team.name ?? "",
    fullName: team.name ?? "",
    slug: makeTeamTagSlug(team.code ?? team.short_name ?? team.name ?? team.id),
  }));
}

async function upsertRaceTagForArticle(articleId, race, confidence, method) {
  const slug = `race-${race.season_year}-${String(race.round).padStart(2, "0")}`;
  const { data: tag } = await supabase
    .from("tags")
    .upsert(
      {
        type: "race",
        slug,
        name: race.race_name,
      },
      { onConflict: "slug" },
    )
    .select("id")
    .single();

  if (!tag?.id) {
    return;
  }

  await supabase.from("news_article_tags").upsert(
    {
      article_id: articleId,
      tag_id: tag.id,
      confidence,
      method,
    },
    { onConflict: "article_id,tag_id" },
  );
}

async function upsertDriverTagForArticle(articleId, driver, confidence, method) {
  if (!driver?.fullName) {
    return;
  }

  const { data: tag } = await supabase
    .from("tags")
    .upsert(
      {
        type: "driver",
        slug: driver.slug,
        name: driver.fullName,
      },
      { onConflict: "slug" },
    )
    .select("id")
    .single();

  if (!tag?.id) {
    return;
  }

  await supabase.from("news_article_tags").upsert(
    {
      article_id: articleId,
      tag_id: tag.id,
      confidence,
      method,
    },
    { onConflict: "article_id,tag_id" },
  );
}

async function upsertTeamTagForArticle(articleId, team, confidence, method) {
  if (!team?.name) {
    return;
  }

  const { data: tag } = await supabase
    .from("tags")
    .upsert(
      {
        type: "team",
        slug: team.slug,
        name: team.name,
      },
      { onConflict: "slug" },
    )
    .select("id")
    .single();

  if (!tag?.id) {
    return;
  }

  await supabase.from("news_article_tags").upsert(
    {
      article_id: articleId,
      tag_id: tag.id,
      confidence,
      method,
    },
    { onConflict: "article_id,tag_id" },
  );
}

function makeTeamTagSlug(value) {
  return `team-${slugify(value)}`;
}

function matchRaceByText(article, races) {
  const text = `${article.original_title ?? ""} ${article.original_description ?? ""}`.toLowerCase();

  return (
    races.find((race) => {
      const candidates = [
        race.race_name,
        race.race_name.replace(/ grand prix/i, ""),
        race.circuit_name,
        race.country,
        race.locality,
      ]
        .filter(Boolean)
        .map((value) => value.toLowerCase());

      return candidates.some((value) => value.length > 3 && text.includes(value));
    }) ?? null
  );
}

function matchDriversByText(article, drivers) {
  const text = ` ${article.original_title ?? ""} ${article.original_description ?? ""} `.toLowerCase();

  return drivers.filter((driver) => {
    const aliases = [
      driver.fullName,
      `${driver.firstName} ${driver.lastName}`.trim(),
      driver.code?.length === 3 ? driver.code : "",
      driver.lastName?.length > 4 ? driver.lastName : "",
    ]
      .filter(Boolean)
      .map((alias) => alias.toLowerCase());

    return aliases.some((alias) => new RegExp(`(^|[^a-zа-яё0-9])${escapeRegExp(alias)}([^a-zа-яё0-9]|$)`, "i").test(text));
  });
}

function matchTeamsByText(article, teams) {
  const text = ` ${article.original_title ?? ""} ${article.original_description ?? ""} `.toLowerCase();

  return teams.filter((team) => {
    const aliases = [team.name, team.fullName, team.code?.length >= 2 ? team.code : ""]
      .filter(Boolean)
      .map((alias) => alias.toLowerCase());

    return aliases.some((alias) => new RegExp(`(^|[^a-zа-яё0-9])${escapeRegExp(alias)}([^a-zа-яё0-9]|$)`, "i").test(text));
  });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function upsertTeamFromJolpica(constructor) {
  if (!constructor?.constructorId) {
    return null;
  }

  const code = makeTeamCode(constructor.constructorId);
  const { data } = await supabase
    .from("teams")
    .upsert(
      {
        external_id: constructor.constructorId,
        code,
        name: constructor.name ?? constructor.constructorId,
        short_name: constructor.name ?? constructor.constructorId,
        country: constructor.nationality ?? null,
        is_active: true,
      },
      { onConflict: "external_id" },
    )
    .select("id")
    .single();

  return data ?? null;
}

async function upsertDriverFromJolpica(driver, teamId) {
  if (!driver?.driverId) {
    return null;
  }

  const firstName = driver.givenName ?? driver.given_name ?? "Пилот";
  const lastName = driver.familyName ?? driver.family_name ?? driver.driverId;
  const fullName = `${firstName} ${lastName}`.trim();

  const { data } = await supabase
    .from("drivers")
    .upsert(
      {
        external_id: driver.driverId,
        code: driver.code ?? driver.driverId.slice(0, 3).toUpperCase(),
        permanent_number: numberOrNull(driver.permanentNumber),
        first_name: firstName,
        last_name: lastName,
        full_name: fullName,
        slug: slugify(fullName),
        country: driver.nationality ?? null,
        current_team_id: teamId ?? null,
        is_active: true,
      },
      { onConflict: "external_id" },
    )
    .select("id, current_team_id")
    .single();

  return data ?? null;
}

function makeTeamCode(externalId) {
  return externalId
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 3)
    .toUpperCase()
    .padEnd(3, "X");
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundNumber(value, digits = 0) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function medianNumber(values) {
  const numbers = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);

  if (!numbers.length) {
    return null;
  }

  const middle = Math.floor(numbers.length / 2);
  const value = numbers.length % 2 === 1
    ? numbers[middle]
    : (numbers[middle - 1] + numbers[middle]) / 2;

  return roundNumber(value, 3);
}

function getBestQualifyingTime(result) {
  const times = [result.Q1, result.Q2, result.Q3].filter(Boolean);

  return times.sort(compareLapTimeText)[0] ?? null;
}

function getQualifyingStatus(result) {
  if (result.Q3) return "Q3";
  if (result.Q2) return "Q2";
  if (result.Q1) return "Q1";

  return "Квалификация";
}

function compareLapTimeText(a, b) {
  return parseLapTimeText(a) - parseLapTimeText(b);
}

function parseLapTimeText(value) {
  const parts = String(value).split(":");

  if (parts.length === 2) {
    return Number(parts[0]) * 60 + Number(parts[1]);
  }

  return Number(value);
}

function formatLapDuration(value) {
  const duration = Number(value);

  if (!Number.isFinite(duration)) {
    return null;
  }

  const minutes = Math.floor(duration / 60);
  const seconds = duration - minutes * 60;

  return `${minutes}:${seconds.toFixed(3).padStart(6, "0")}`;
}

function pickHourlyForecast(hourly, startAt) {
  if (!hourly?.time?.length || !startAt) {
    return null;
  }

  const target = new Date(startAt).getTime();
  let bestIndex = 0;
  let bestDiff = Number.POSITIVE_INFINITY;

  hourly.time.forEach((time, index) => {
    const diff = Math.abs(new Date(time).getTime() - target);

    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = index;
    }
  });

  return {
    forecast_at: new Date(hourly.time[bestIndex]).toISOString(),
    temperature_c: hourly.temperature_2m?.[bestIndex] ?? null,
    wind_speed_kmh: hourly.wind_speed_10m?.[bestIndex] ?? null,
    precipitation_mm: hourly.precipitation?.[bestIndex] ?? null,
    weather_code: hourly.weather_code?.[bestIndex] ?? null,
  };
}

function formatIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function isPastDate(value) {
  if (!value) {
    return false;
  }

  const date = new Date(value);

  return Number.isFinite(date.getTime()) && date.getTime() < Date.now() - 6 * 60 * 60 * 1000;
}

function parseRss(xml) {
  return parseFeedItems(xml);
}

function filterRssItemsForSource(items, source) {
  if (source.source_type !== "rss-formula-1") {
    return items;
  }

  return items.filter((item) =>
    (item.categories ?? []).some((category) => normalizeString(category)?.toLowerCase() === "formula 1"),
  );
}

function parseFeedItems(xml) {
  const rssItems = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => {
    const item = match[0];

    return {
      title: cleanXml(readTag(item, "title")),
      link: cleanXml(readTag(item, "link")),
      guid: cleanXml(readTag(item, "guid")),
      description: cleanXml(readTag(item, "description")),
      content: cleanXml(readTag(item, "content:encoded") || readTag(item, "content")),
      author: cleanXml(readTag(item, "author") || readTag(item, "dc:creator")),
      categories: readTags(item, "category").map(cleanXml).filter(Boolean),
      imageUrl: extractFeedImage(item),
      pubDate: normalizeDate(cleanXml(readTag(item, "pubDate"))),
      reactionCount: parseReactionCount(item),
    };
  });
  const atomItems = [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((match) => {
    const item = match[0];

    return {
      title: cleanXml(readTag(item, "title")),
      link: cleanXml(readLinkHref(item)) || cleanXml(readTag(item, "link")),
      guid: cleanXml(readTag(item, "id")),
      id: cleanXml(readTag(item, "id")),
      description: cleanXml(readTag(item, "summary")),
      content: cleanXml(readTag(item, "content")),
      author: cleanXml(readTag(readTag(item, "author"), "name") || readTag(item, "author")),
      categories: readTags(item, "category").map(cleanXml).filter(Boolean),
      imageUrl: extractFeedImage(item),
      pubDate: normalizeDate(cleanXml(readTag(item, "published") || readTag(item, "updated"))),
      reactionCount: parseReactionCount(item),
    };
  });

  return rssItems.length ? rssItems : atomItems;
}

function readTag(xml, tag) {
  return xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1] ?? "";
}

function readTags(xml, tag) {
  return [...xml.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"))].map(
    (match) => match[1],
  );
}

function readLinkHref(xml) {
  const alternate =
    xml.match(/<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*\/?>/i)?.[1] ??
    xml.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']alternate["'][^>]*\/?>/i)?.[1];

  return alternate ?? xml.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i)?.[1] ?? "";
}

function extractFeedImage(xml) {
  const decoded = decodeXml(xml);
  const media =
    xml.match(/<media:thumbnail\b[^>]*url=["']([^"']+)["'][^>]*\/?>/i)?.[1] ??
    xml.match(/<media:content\b[^>]*url=["']([^"']+)["'][^>]*\/?>/i)?.[1] ??
    xml.match(/<image\b[^>]*url=["']([^"']+)["'][^>]*\/?>/i)?.[1] ??
    xml.match(/<enclosure\b[^>]*url=["']([^"']+)["'][^>]*(?:type=["']image\/[^"']+["'])[^>]*\/?>/i)?.[1] ??
    extractImageFromHtml(decoded) ??
    extractFeedImageUrl(decoded);

  return media ? normalizeFeedImageUrl(decodeXml(media.trim())) : null;
}

function extractFeedImageUrl(value) {
  const imageUrls = [
    ...String(value ?? "").matchAll(/https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|gif|webp|avif)(?:\?[^\s"'<>]+)?/gi),
    ...String(value ?? "").matchAll(/https?:\/\/pbs\.twimg\.com\/(?:media|ext_tw_video_thumb)\/[^\s"'<>]+/gi),
    ...String(value ?? "").matchAll(/https?:\/\/video\.twimg\.com\/[^\s"'<>]+/gi),
  ].map((match) => match[0]);

  return imageUrls.find(isLikelyFeedImageUrl) ?? null;
}

function isLikelyFeedImageUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();

    return (
      (host === "pbs.twimg.com" &&
        (url.pathname.startsWith("/media/") || url.pathname.startsWith("/ext_tw_video_thumb/"))) ||
      (host === "video.twimg.com" && /\.(jpe?g|png|webp|avif)$/i.test(url.pathname)) ||
      /\.(jpe?g|png|gif|webp|avif)$/i.test(url.pathname) ||
      /(?:wp-content\/uploads|cdn|images?|media)/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function extractFeedImageFromPayload(payload) {
  if (!payload) {
    return null;
  }

  return (
    normalizeString(payload.imageUrl) ??
    extractImageFromHtml(payload.content) ??
    extractImageFromHtml(payload.description) ??
    extractFeedImageUrl(`${payload.content ?? ""} ${payload.description ?? ""}`)
  );
}

function extractImageFromHtml(html, baseUrl) {
  const htmlText = String(html ?? "");
  const candidates = [
    ...[...htmlText.matchAll(/<img\b[^>]*>/gi)].flatMap((match) => {
      const tag = match[0];

      return [
        ...extractImageCandidatesFromSrcset(readAttribute(tag, "srcset")),
        readAttribute(tag, "src"),
        readAttribute(tag, "data-src"),
        readAttribute(tag, "data-lazy-src"),
        readAttribute(tag, "data-original"),
        readAttribute(tag, "data-orig-file"),
      ];
    }),
    ...[...htmlText.matchAll(/<source\b[^>]*>/gi)].flatMap((match) =>
      extractImageCandidatesFromSrcset(readAttribute(match[0], "srcset")),
    ),
    ...extractImageCandidatesFromSrcset(htmlText),
  ]
    .filter(Boolean)
    .map((candidate) => resolveUrl(decodeXml(candidate), baseUrl));

  return candidates.find((candidate) => isLikelyFeedImageUrl(candidate)) ?? null;
}

function readAttribute(tag, attribute) {
  return (
    tag.match(new RegExp(`\\b${attribute}=["']([^"']+)["']`, "i"))?.[1] ??
    tag.match(new RegExp(`\\b${attribute}=([^\\s>]+)`, "i"))?.[1] ??
    null
  );
}

function extractImageCandidatesFromSrcset(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .split(",")
    .map((entry) => entry.trim().split(/\s+/)[0])
    .filter(Boolean);
}

function normalizeFeedImageUrl(value) {
  try {
    const url = new URL(value);

    if (
      url.hostname === "pbs.twimg.com" &&
      (url.pathname.startsWith("/media/") || url.pathname.startsWith("/ext_tw_video_thumb/"))
    ) {
      const format = url.searchParams.get("format") ?? url.pathname.match(/\.(jpe?g|png|gif|webp)$/i)?.[1];

      if (format) {
        url.pathname = url.pathname.replace(/\.(jpe?g|png|gif|webp)$/i, "");
        url.searchParams.set("format", format === "jpeg" ? "jpg" : format);
        url.searchParams.set("name", "orig");
      }
    }

    return url.toString();
  } catch {
    return value;
  }
}

function sanitizeDiagnosticText(value) {
  return String(value ?? "")
    .replace(/(auth_token=)[^;&\s"']+/gi, "$1[redacted]")
    .replace(/(ct0=)[^;&\s"']+/gi, "$1[redacted]")
    .replace(/(authorization:\s*bearer\s+)[^;&\s"']+/gi, "$1[redacted]")
    .replace(/(TWITTER_AUTH_TOKEN=)[^;&\s"']+/gi, "$1[redacted]");
}

function parseReactionCount(xml) {
  const value =
    xml.match(/<score[^>]*>([\s\S]*?)<\/score>/i)?.[1] ??
    xml.match(/<ups[^>]*>([\s\S]*?)<\/ups>/i)?.[1] ??
    xml.match(/<reactions[^>]*>([\s\S]*?)<\/reactions>/i)?.[1];

  return numberOrNull(cleanXml(value));
}

function cleanXml(value) {
  return decodeXml(value).replace(/<[^>]+>/g, "").trim();
}

function decodeXml(value) {
  return String(value ?? "")
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function safeJson(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(String(value).replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim());
  } catch {
    return null;
  }
}

async function readJsonResponse(response) {
  const text = await response.text();
  return safeJson(text) ?? { message: text.slice(0, 500) };
}

function getOpenRouterFailureReason(payload) {
  return getSafeErrorMessage(payload?.error?.message ?? payload?.message ?? payload?.error ?? "request failed");
}

function getSafeErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error ?? "unknown error");
  return message.replace(/https?:\/\/\S+/g, "[url]").slice(0, 240);
}

function logWorkerWarning(event, metadata) {
  console.warn(JSON.stringify({ event, ...metadata }));
}

function normalizeString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return null;
  }

  const items = value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5);

  return items.length ? items : null;
}

async function getArticleContext(article) {
  const snippets = [
    normalizeString(article.raw_payload?.content),
    normalizeString(article.original_description),
  ].filter(Boolean);
  const sourceUrl = article.original_url ?? article.canonical_url;
  let fetchedArticle = await fetchReadableArticleMetadata(sourceUrl);

  if (!fetchedArticle.imageUrl && shouldUseReaderFallback(sourceUrl)) {
    fetchedArticle = await fetchReadableArticleMetadataViaReader(sourceUrl, fetchedArticle);
  }

  if (fetchedArticle.text) {
    snippets.push(fetchedArticle.text);
  }

  return {
    text: clampText(dedupeTextBlocks(snippets).join("\n\n"), Number(process.env.AI_ARTICLE_TEXT_MAX_CHARS ?? 12000)),
    imageUrl: article.source_image_url ?? article.raw_payload?.imageUrl ?? fetchedArticle.imageUrl ?? null,
  };
}

async function fetchReadableArticleMetadata(url) {
  if (!url) {
    return { text: null, imageUrl: null };
  }

  try {
    const response = await fetch(url, {
      headers: {
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "user-agent": "RaceMate/1.0 (+https://racemate.ru)",
      },
      signal: AbortSignal.timeout(Number(process.env.AI_ARTICLE_FETCH_TIMEOUT_MS ?? 8000)),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return null;
    }

    const html = await response.text();
    return {
      text: extractReadableTextFromHtml(html),
      imageUrl: extractMetadataImageFromHtml(html, url),
    };
  } catch (fetchError) {
    logWorkerWarning("news.article_text.unavailable", {
      url: sanitizeDiagnosticText(url),
      reason: getSafeErrorMessage(fetchError),
    });
    return { text: null, imageUrl: null };
  }
}

async function fetchReadableArticleMetadataViaReader(url, fallback = { text: null, imageUrl: null }) {
  if (!url) {
    return fallback;
  }

  try {
    const response = await fetch(`https://r.jina.ai/http://${url}`, {
      headers: {
        accept: "text/plain, text/markdown;q=0.9, */*;q=0.8",
        "user-agent": "RaceMate/1.0 (+https://racemate.ru)",
      },
      signal: AbortSignal.timeout(Number(process.env.AI_ARTICLE_READER_TIMEOUT_MS ?? 15000)),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const markdown = await response.text();

    return {
      text: fallback.text ?? extractReadableTextFromMarkdown(markdown),
      imageUrl: fallback.imageUrl ?? extractImageFromMarkdown(markdown, url),
    };
  } catch (readerError) {
    logWorkerWarning("news.article_reader.unavailable", {
      url: sanitizeDiagnosticText(url),
      reason: getSafeErrorMessage(readerError),
    });

    return fallback;
  }
}

function shouldUseReaderFallback(url) {
  try {
    return new URL(url).hostname.toLowerCase().includes("racefans.net");
  } catch {
    return false;
  }
}

function extractReadableTextFromHtml(html) {
  const body =
    html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
    html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ??
    html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ??
    html;
  const text = decodeXml(
    body
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<\/(?:p|div|section|article|h[1-6]|li|blockquote)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\u00a0/g, " "),
  );

  const paragraphs = text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 80)
    .filter((line) => !/^(advertisement|subscribe|sign up|read more|cookies?|privacy|terms)/i.test(line))
    .slice(0, 24);

  return paragraphs.length ? paragraphs.join("\n\n") : null;
}

function extractReadableTextFromMarkdown(markdown) {
  const lines = String(markdown ?? "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(Title:|URL Source:|Published Time:|Markdown Content:|#+\s|[*-]\s+\[|Advert\b|Menu and widgets|Follow RaceFans)/i.test(line))
    .map((line) => line.replace(/\[[^\]]+]\([^)]+\)/g, " ").replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 80)
    .slice(0, 24);

  return lines.length ? lines.join("\n\n") : null;
}

function extractMetadataImageFromHtml(html, baseUrl) {
  const htmlText = String(html ?? "");
  const metaCandidates = [...htmlText.matchAll(/<meta\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) =>
      /(?:property|name)=["'](?:og:image|og:image:secure_url|twitter:image|twitter:image:src|thumbnailUrl)["']/i.test(tag),
    )
    .map((tag) => readAttribute(tag, "content"))
    .filter(Boolean);
  const linkCandidates = [...htmlText.matchAll(/<link\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => /\brel=["'][^"']*(?:image_src|preload)[^"']*["']/i.test(tag))
    .map((tag) => readAttribute(tag, "href"))
    .filter(Boolean);
  const jsonLdCandidates = extractJsonLdImages(htmlText);
  const htmlCandidates = [extractImageFromHtml(htmlText, baseUrl)].filter(Boolean);
  const candidates = [
    ...metaCandidates,
    ...linkCandidates,
    ...jsonLdCandidates,
    ...htmlCandidates,
  ]
    .map((candidate) => resolveUrl(decodeXml(candidate), baseUrl))
    .filter(Boolean);
  const imageUrl = candidates.find((candidate) => isLikelyFeedImageUrl(candidate));

  return imageUrl ? normalizeFeedImageUrl(imageUrl) : null;
}

function extractImageFromMarkdown(markdown, baseUrl) {
  const title = normalizeString(String(markdown ?? "").match(/^Title:\s*(.+)$/im)?.[1]);
  const images = [...String(markdown ?? "").matchAll(/!\[[^\]]*]\(([^)]+)\)/g)]
    .map((match) => resolveUrl(decodeXml(match[1]), baseUrl))
    .filter(isLikelyFeedImageUrl);
  const articleImages = images.filter((imageUrl) => {
    const lower = imageUrl.toLowerCase();

    return (
      !lower.includes("/themes/") &&
      !lower.includes("/buttons/") &&
      !lower.includes("amazon") &&
      !lower.includes("donate") &&
      !lower.includes("goadfree")
    );
  });

  if (!articleImages.length) {
    return null;
  }

  const titleWords = new Set(
    String(title ?? "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 4),
  );

  return normalizeFeedImageUrl(
    articleImages.find((imageUrl) =>
      [...titleWords].some((word) => imageUrl.toLowerCase().includes(word)),
    ) ??
      articleImages.find((imageUrl) => /\/wp-content\/uploads\//i.test(imageUrl)) ??
      articleImages[0],
  );
}

function extractJsonLdImages(html) {
  return [...String(html ?? "").matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .flatMap((match) => {
      const parsed = safeJson(decodeXml(match[1]));

      return collectJsonImages(parsed);
    })
    .filter(Boolean);
}

function collectJsonImages(value) {
  if (!value) {
    return [];
  }

  if (typeof value === "string") {
    return isLikelyFeedImageUrl(value) ? [value] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectJsonImages);
  }

  if (typeof value === "object") {
    const direct = [
      value.url,
      value.contentUrl,
      value.thumbnailUrl,
      value.image,
      value.logo,
    ].flatMap(collectJsonImages);

    return [...direct, ...Object.values(value).flatMap(collectJsonImages)];
  }

  return [];
}

function resolveUrl(value, baseUrl) {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function dedupeTextBlocks(blocks) {
  const seen = new Set();
  const result = [];

  for (const block of blocks) {
    const normalized = block.replace(/\s+/g, " ").trim();
    const key = normalized.toLowerCase().slice(0, 240);

    if (!normalized || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function clampText(value, maxLength) {
  const text = String(value ?? "").trim();

  if (!text || text.length <= maxLength) {
    return text || null;
  }

  return `${text.slice(0, maxLength).replace(/\s+\S*$/, "")}\n\n[Текст обрезан для лимита AI-контекста]`;
}

function makeFallbackNewsPayload(article) {
  const description = normalizeString(article.original_description);
  const sourceText = description
    ? `В RSS-описании источника есть только краткий фрагмент: ${description}`
    : "Источник пока не передал достаточно деталей для уверенного пересказа.";

  return {
    title: "Новость Формулы-1: детали уточняются",
    summary: "Источник сообщил новую информацию по Формуле-1, но деталей пока недостаточно для уверенного русского пересказа. Мы не добавляем неподтвержденные факты и обновим материал после повторной обработки.",
    details: `${sourceText}\n\nПодробная русская версия появится после повторной обработки. До этого RaceMate показывает только осторожное описание без дополнительных выводов и домыслов.`,
    keyPoints: ["Источник передал краткое описание.", "Подробная русская версия готовится.", "Факты не расширялись без подтверждения источника."],
    highlights: ["Подробная русская версия готовится"],
    teamSlugs: [],
  };
}

function buildNewsAiSystemPrompt() {
  return [
    "Ты редактор RaceMate для русскоязычных фанатов Формулы-1.",
    "Твоя задача — прочитать переданные материалы, перевести смысл на русский и написать подробный редакторский пересказ своими словами.",
    "Все пользовательские текстовые поля JSON должны быть на русском языке, кроме названий команд, пилотов, серий, технических аббревиатур и team_slugs.",
    "Не возвращай английский заголовок, английский лид или английский текст статьи как title_ru, summary_ru или details_ru.",
    "Не копируй фразы источника дословно, не выдавай текст за оригинальную публикацию и не придумывай факты.",
    "Если данных мало, напиши короткий осторожный пересказ на русском по доступному RSS-описанию.",
    "Верни только JSON: title_ru, summary_ru, details_ru, key_points_ru, highlight_phrases_ru, race_round, race_confidence, team_slugs.",
    "summary_ru — короткий лид на 2-3 предложения.",
    "details_ru — полноценный материал RaceMate: 5-8 абзацев, разделенных пустой строкой, с контекстом, участниками, причиной важности и возможными последствиями только из переданных фактов.",
    "key_points_ru — массив из 4-5 коротких пунктов.",
    "highlight_phrases_ru — массив из 3-6 точных коротких фактических фраз на русском, которые дословно встречаются в summary_ru или details_ru. Каждая фраза должна быть 4-140 символов, без оценок и без новых формулировок: RaceMate подчеркнет их в тексте статьи.",
    "race_round — номер этапа из списка или null.",
    "team_slugs — массив slug команд из списка, если новость прямо связана с командой, ее пилотом, руководителем, болидом, стратегией или результатом команды. Не придумывай slug вне списка.",
  ].join(" ");
}

function isUsableRussianNewsPayload({ details, summary, title }) {
  return (
    isMostlyRussianText(title, { minCyrillic: 4, minRatio: 0.25 }) &&
    isMostlyRussianText(summary, { minCyrillic: 32, minRatio: 0.45 }) &&
    isMostlyRussianText(details, { minCyrillic: 64, minRatio: 0.45 })
  );
}

function isMostlyRussianText(value, { minCyrillic, minRatio }) {
  const text = normalizeString(value);

  if (!text) {
    return false;
  }

  const cyrillicCount = (text.match(/[А-Яа-яЁё]/g) ?? []).length;
  const latinCount = (text.match(/[A-Za-z]/g) ?? []).length;

  return cyrillicCount >= minCyrillic && cyrillicCount >= latinCount * minRatio;
}

function buildNewsHighlightSystemPrompt() {
  return [
    "Ты редактор RaceMate для русскоязычных фанатов Формулы-1.",
    "Верни только JSON: highlight_phrases_ru.",
    "Выбери 3-6 коротких фактических фраз, которые дословно присутствуют в переданном лиде или тексте статьи.",
    "Фразы должны выделять ключевые факты: результат, решение, цитату, изменение, срок или причину. Не добавляй оценок, новых слов, заголовков и фраз, которых нет в тексте.",
    "Каждая фраза: от 4 до 140 символов. Не повторяй похожие фразы.",
  ].join(" ");
}

function selectArticleHighlights(value, summary, details) {
  const articleText = `${summary ?? ""}\n${details ?? ""}`.toLocaleLowerCase("ru-RU");
  const seen = new Set();

  return (normalizeStringArray(value) ?? [])
    .map((item) => item.trim())
    .filter((item) => item.length >= 4 && item.length <= 140)
    .filter((item) => articleText.includes(item.toLocaleLowerCase("ru-RU")))
    .filter((item) => {
      const key = item.toLocaleLowerCase("ru-RU");

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .slice(0, 6);
}

function makeDigestFallback(articles) {
  if (!articles.length) {
    return "Свежих обработанных новостей пока нет. Запусти RSS и AI-обработку, чтобы собрать сводку дня.";
  }

  return articles
    .slice(0, 6)
    .map((article) => `- ${article.ai_title_ru ?? article.original_title}: ${article.ai_summary_ru ?? "детали уточняются"}`)
    .join("\n");
}
