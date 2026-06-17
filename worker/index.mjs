import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

import { createClient } from "@supabase/supabase-js";

loadEnvFiles([".env", ".env.local"]);

const commands = new Map([
  ["rss.fetch_all", fetchAllRss],
  ["social.fetch_all", fetchAllSocial],
  ["social.fetch_reddit", fetchRedditSocial],
  ["social.fetch_x", fetchXSocial],
  ["reports.check_latest", checkLatestGrandPrixReport],
  ["reports.generate", generateGrandPrixReport],
  ["reports.generate_summary", generateGrandPrixReportSummary],
  ["reports.refresh_due", refreshDueGrandPrixReports],
  ["ai.process_news", processNewsWithAi],
  ["ai.retag_news", retagNewsWithAi],
  ["ai.generate_daily_digest", generateDailyDigest],
  ["jolpica.sync_calendar", syncCalendar],
  ["jolpica.sync_results", syncResults],
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
    .select("id, name, url, language")
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
      const xml = await response.text();
      const items = parseRss(xml).slice(0, Number(process.env.AI_MAX_ARTICLES_PER_RUN ?? 50));

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
              status: "pending",
              raw_payload: item,
            },
            { onConflict: "canonical_url", ignoreDuplicates: true },
          );

        if (!articleError) {
          itemsProcessed += 1;
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

  return generateGrandPrixReportForRace(race);
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

    await generateGrandPrixReportForRace(race);
    itemsProcessed += 1;
  }

  return { itemsProcessed };
}

async function generateGrandPrixReportForRace(race) {
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
  const fastF1 = collectFastF1ReportData(race.season_year, race.round, sourceErrors);
  const structured = buildGrandPrixReportStructuredData(race, raceSession, resultRows, openF1, fastF1, sourceErrors);
  const structuredHash = hashJson({
    race_statistics: structured.race_statistics,
    results: structured.results,
    key_events: structured.key_events,
    pit_stops: structured.pit_stops,
    strategies: structured.strategies,
    teammate_comparisons: structured.teammate_comparisons,
    highlights: structured.highlights,
    championship_impact: structured.championship_impact,
  });
  const existing = await getExistingGrandPrixReport(race.season_year, race.round);
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

async function findLatestCompletedRaceForReport() {
  const { data, error } = await supabase
    .from("races")
    .select("id, season_year, round, race_name, race_start_at, status, circuits(name, country)")
    .eq("status", "completed")
    .order("race_start_at", { ascending: false, nullsFirst: false })
    .limit(8);

  if (error) {
    throw error;
  }

  for (const race of data ?? []) {
    const session = await getRaceSessionForReport(race.id);
    const results = session ? await getRaceResultRows(session.id) : [];

    if (session && hasFinalRaceResults(results)) {
      return race;
    }
  }

  return null;
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

function collectFastF1ReportData(season, round, sourceErrors) {
  const python = process.env.FASTF1_PYTHON_BIN ?? "python3";
  const script = "worker/fastf1/report_metrics.py";

  if (!existsSync(script)) {
    sourceErrors.fastf1 = "FastF1 script is missing.";
    return {};
  }

  const result = spawnSync(python, [script, String(season), String(round)], {
    encoding: "utf8",
    timeout: Number(process.env.FASTF1_TIMEOUT_MS ?? 60_000),
  });

  if (result.error || result.status !== 0) {
    sourceErrors.fastf1 = result.error?.message ?? result.stderr?.trim() ?? "FastF1 failed.";
    return {};
  }

  return safeJson(result.stdout) ?? {};
}

function buildGrandPrixReportStructuredData(race, raceSession, resultRows, openF1, fastF1, sourceErrors) {
  const results = mapReportResults(resultRows, openF1.laps ?? []);
  const pitStops = mapReportPitStops(openF1.pits ?? [], results);
  const strategies = mapReportStrategies(openF1.stints ?? [], pitStops, results, fastF1);
  const keyEvents = buildReportKeyEvents(results, pitStops, openF1.raceControl ?? [], openF1.positions ?? []);
  const teammateComparisons = buildTeammateComparisons(results, pitStops);
  const highlights = buildReportHighlights(results);
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
    championship_impact: {
      note: "Таблица чемпионата обновляется отдельной синхронизацией standings.",
      topResult: results.slice(0, 3).map((result) => `${result.position}. ${result.driver}`),
    },
    source_errors: sourceErrors,
  };
}

function mapReportResults(rows, openF1Laps) {
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

  return results.slice(0, 20).map((result) => ({
    driver: result.driver,
    team: result.team,
    pitStops: pitCountByDriver.get(result.driver) ?? 0,
    compounds: [...new Set([...(stintsByDriver.get(String(result.driverNumber ?? "")) ?? []).map((stint) => stint.compound)])],
    stints: stintsByDriver.get(String(result.driverNumber ?? "")) ?? [],
    fastF1: fastF1?.drivers?.[result.driver] ?? null,
  }));
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

function buildReportHighlights(results) {
  const podium = results.filter((result) => result.position !== null && result.position <= 3);
  const bestGain = getExtremeByDelta(results, "max");
  const biggestDrop = getExtremeByDelta(results, "min");
  const fastestLap = getFastestLapResult(results);
  const teamPoints = new Map();

  for (const result of results) {
    teamPoints.set(result.team, (teamPoints.get(result.team) ?? 0) + Number(result.points ?? 0));
  }

  const bestTeam = [...teamPoints.entries()].sort((a, b) => b[1] - a[1])[0];
  const potentialLoss = getPotentialPointsLoss(results);

  return {
    winner: podium[0]?.driver ?? null,
    podium: podium.map((result) => result.driver),
    fastestLap: fastestLap?.driver ?? null,
    bestGain: bestGain ? { driver: bestGain.driver, delta: bestGain.positionDelta } : null,
    biggestDrop: biggestDrop ? { driver: biggestDrop.driver, delta: biggestDrop.positionDelta } : null,
    bestTeam: bestTeam ? { team: bestTeam[0], points: bestTeam[1] } : null,
    potentialPointsLoss: potentialLoss,
    surpriseResult: bestGain && (bestGain.positionDelta ?? 0) >= 5 ? bestGain.driver : null,
    retirements: results.filter((result) => !isFinisherStatus(result.status)).map((result) => result.driver),
  };
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
    statistics: report.race_statistics,
    top10: (report.results ?? []).slice(0, 10),
    keyEvents: (report.key_events ?? []).slice(0, 12),
    strategies: (report.strategies ?? []).slice(0, 10),
    highlights: report.highlights,
    championshipImpact: report.championship_impact,
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
              "Ты редактор RaceMate. Напиши итог Гран-при на русском в 3-6 абзацах только по переданным фактам. Не придумывай события, не добавляй неподтвержденные оценки, не уходи в нерелевантные темы.",
          },
          {
            role: "user",
            content: JSON.stringify(facts),
          },
        ],
        max_tokens: Number(process.env.REPORT_SUMMARY_MAX_TOKENS ?? 1200),
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
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model =
    process.env.AI_SUMMARY_MODEL ?? process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash-lite";
  const maxTokens = Number(process.env.AI_SUMMARY_MAX_TOKENS ?? 900);

  const { data: articles, error } = await supabase
    .from("news_articles")
    .select("id, original_title, original_description")
    .eq("status", "pending")
    .is("duplicate_of", null)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(Number(process.env.AI_MAX_ARTICLES_PER_RUN ?? 20));

  if (error) {
    throw error;
  }

  const races = await getRaceChoices();
  let itemsProcessed = 0;

  for (const article of articles ?? []) {
    const fallback = makeFallbackNewsPayload(article);
    let aiPayload = fallback;
    let title = article.original_title;
    let usage = null;
    let relatedRace = matchRaceByText(article, races);

    if (apiKey) {
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
                "Ты редактор RaceMate для русскоязычных фанатов Формулы-1. Верни только JSON: title_ru, summary_ru, details_ru, key_points_ru, race_round, race_confidence. summary_ru — короткий лид на 1-2 предложения. details_ru — 5-8 спокойных предложений, которые раскрывают контекст, последствия для пилотов/команд/этапа и не повторяют summary_ru другими словами. Не выдумывай факты. key_points_ru — массив из 3 коротких пунктов. race_round — номер этапа из списка или null.",
            },
            {
              role: "user",
              content: `Новость:\n${article.original_title}\n\n${article.original_description ?? ""}\n\nЭтапы сезона:\n${races
                .map((race) => `${race.round}: ${race.race_name} (${race.circuit_name}, ${race.country})`)
                .join("\n")}`,
            },
          ],
          response_format: { type: "json_object" },
          max_tokens: maxTokens,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(`OpenRouter failed for article ${article.id}: ${response.status} ${JSON.stringify(payload).slice(0, 220)}`);
      }
      const content = payload.choices?.[0]?.message?.content;
      const parsed = safeJson(content);
      title = normalizeString(parsed?.title_ru) ?? title;
      aiPayload = {
        summary: normalizeString(parsed?.summary_ru) ?? aiPayload.summary,
        details: normalizeString(parsed?.details_ru) ?? aiPayload.details,
        keyPoints: normalizeStringArray(parsed?.key_points_ru) ?? aiPayload.keyPoints,
      };
      const aiRace = races.find((race) => race.round === numberOrNull(parsed?.race_round));
      relatedRace = aiRace ?? relatedRace;
      usage = payload.usage ?? null;
    }

    await supabase
      .from("news_articles")
      .update({
        ai_title_ru: title,
        ai_summary_ru: aiPayload.summary,
        ai_summary_long_ru: aiPayload.details,
        ai_key_points_ru: aiPayload.keyPoints,
        related_race_id: relatedRace?.id ?? null,
        ai_model: model,
        ai_processed_at: new Date().toISOString(),
        status: "processed",
      })
      .eq("id", article.id);

    if (relatedRace) {
      await upsertRaceTagForArticle(article.id, relatedRace, 0.84, "ai");
    }

    await supabase.from("ai_usage_logs").insert({
      purpose: "news.summary",
      provider: "openrouter",
      model,
      input_tokens: usage?.prompt_tokens ?? null,
      output_tokens: usage?.completion_tokens ?? null,
      estimated_cost_usd: null,
      related_article_id: article.id,
    });

    itemsProcessed += 1;
  }

  return { itemsProcessed, metadata: { model, openrouter: Boolean(apiKey) } };
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

  const races = await getRaceChoices();
  let itemsProcessed = 0;

  for (const article of articles ?? []) {
    const race = matchRaceByText(article, races);

    if (!race) {
      continue;
    }

    await supabase
      .from("news_articles")
      .update({ related_race_id: race.id })
      .eq("id", article.id);
    await upsertRaceTagForArticle(article.id, race, 0.62, "rule");
    itemsProcessed += 1;
  }

  return { itemsProcessed, metadata: { method: "rule" } };
}

async function generateDailyDigest() {
  const model =
    process.env.AI_SUMMARY_MODEL ?? process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash-lite";
  const apiKey = process.env.OPENROUTER_API_KEY;
  const dateKey = new Date().toISOString().slice(0, 10);

  const { data: cached } = await supabase
    .from("digests")
    .select("id")
    .eq("digest_type", "daily_news")
    .eq("date_key", dateKey)
    .eq("ai_model", model)
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
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(12);

  if (error) {
    throw error;
  }

  const title = "Короткая сводка дня";
  let body = makeDigestFallback(articles ?? []);
  let usage = null;

  if (apiKey && articles?.length) {
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
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(`OpenRouter failed for daily digest: ${response.status} ${JSON.stringify(payload).slice(0, 220)}`);
    }
    const parsed = safeJson(payload.choices?.[0]?.message?.content);
    body = normalizeString(parsed?.body_md) ?? body;
    usage = payload.usage ?? null;
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

  if (digest?.id) {
    await supabase.from("ai_usage_logs").insert({
      purpose: "news.daily_digest",
      provider: "openrouter",
      model,
      input_tokens: usage?.prompt_tokens ?? null,
      output_tokens: usage?.completion_tokens ?? null,
      estimated_cost_usd: null,
      related_digest_id: digest.id,
    });
  }

  return { itemsProcessed: articles?.length ?? 0, metadata: { model, dateKey } };
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
  const raceRows = racePayload.MRData?.RaceTable?.Races ?? [];
  const qualifyingRows = qualifyingPayload.MRData?.RaceTable?.Races ?? [];
  const sprintRows = sprintPayload.MRData?.RaceTable?.Races ?? [];
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
    const isClassificationSession = ["race", "sprint"].includes(sessionType);

    if (isClassificationSession) {
      const { count } = await supabase
        .from("session_results")
        .select("id", { count: "exact", head: true })
        .eq("session_id", session.id);

      if ((count ?? 0) > 0) {
        continue;
      }
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
          status: isClassificationSession ? "Лучший круг" : "Лучшее время",
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

    if (!actual.winnerDriverId && !actual.poleDriverId) {
      continue;
    }

    const { data: predictions } = await supabase
      .from("predictions")
      .select("id, winner_driver_id, pole_driver_id, fastest_lap_driver_id, dnf_driver_id")
      .eq("race_id", race.id);

    for (const prediction of predictions ?? []) {
      const score =
        scoreExact(prediction.winner_driver_id, actual.winnerDriverId, 10) +
        scoreExact(prediction.pole_driver_id, actual.poleDriverId, 5) +
        scoreExact(prediction.fastest_lap_driver_id, actual.fastestLapDriverId, 3) +
        scoreExact(prediction.dnf_driver_id, actual.dnfDriverId, 2);

      await supabase
        .from("predictions")
        .update({ score, scored_at: new Date().toISOString() })
        .eq("id", prediction.id);
      itemsProcessed += 1;
    }
  }

  return { itemsProcessed };
}

async function getRaceActuals(raceId) {
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, session_type")
    .eq("race_id", raceId)
    .in("session_type", ["race", "qualifying"]);

  const raceSessionId = sessions?.find((session) => session.session_type === "race")?.id;
  const qualifyingSessionId = sessions?.find((session) => session.session_type === "qualifying")?.id;

  const [raceResults, qualifyingResults] = await Promise.all([
    raceSessionId
      ? supabase
          .from("session_results")
          .select("driver_id, position, status, raw_payload")
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
  ]);

  const winner = raceResults.data?.find((result) => result.position === 1);
  const pole = qualifyingResults.data?.find((result) => result.position === 1);
  const fastestLap = raceResults.data?.find(
    (result) => result.raw_payload?.FastestLap?.rank === "1",
  );
  const dnf = raceResults.data?.find(
    (result) =>
      result.status &&
      !["Finished", "+1 Lap", "+2 Laps", "+3 Laps", "+4 Laps", "+5 Laps"].includes(result.status),
  );

  return {
    winnerDriverId: winner?.driver_id ?? null,
    poleDriverId: pole?.driver_id ?? null,
    fastestLapDriverId: fastestLap?.driver_id ?? null,
    dnfDriverId: dnf?.driver_id ?? null,
  };
}

function scoreExact(predicted, actual, points) {
  return predicted && actual && predicted === actual ? points : 0;
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
    xml.match(/<enclosure\b[^>]*url=["']([^"']+)["'][^>]*(?:type=["']image\/[^"']+["'])[^>]*\/?>/i)?.[1] ??
    xml.match(/<img\b[^>]*src=["']([^"']+)["'][^>]*>/i)?.[1] ??
    decoded.match(/<img\b[^>]*src=["']([^"']+)["'][^>]*>/i)?.[1] ??
    extractFeedImageUrl(decoded);

  return media ? normalizeFeedImageUrl(decodeXml(media.trim())) : null;
}

function extractFeedImageUrl(value) {
  const imageUrls = [
    ...String(value ?? "").matchAll(/https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|gif|webp)(?:\?[^\s"'<>]+)?/gi),
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
      (host === "video.twimg.com" && /\.(jpe?g|png|webp)$/i.test(url.pathname)) ||
      /\.(jpe?g|png|gif|webp)$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
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

function makeFallbackNewsPayload(article) {
  const description =
    article.original_description ??
    "RaceMate получил новость из RSS, но источник не передал достаточно деталей для уверенной выжимки.";

  return {
    summary: description,
    details:
      description.length > 180
        ? description
        : `${description} Подробная выжимка станет точнее после повторной AI-обработки, когда источник отдаст больше контекста.`,
    keyPoints: [article.original_title, "Источник не передал дополнительных деталей.", "Факты не расширялись без подтверждения."],
  };
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
