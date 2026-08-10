import type { createSupabaseAdminClient } from "@/lib/supabase/server";
import { adminJobCatalog, getAdminJobDefinition } from "@/lib/admin-job-catalog";
import { adminAiPromptCatalog } from "@/lib/admin-ai-prompts";
import type {
  AdminAiPromptVersion,
  AdminAiPromptVersionSummary,
  AdminAiUsageSummaryRow,
  AdminAuditEntry,
  AdminFinding,
  AdminFindingEvent,
  AdminJobRun,
  AdminSchedule,
  AdminSystemSignal,
  AdminSystemStatus,
  AdminTableQuery,
} from "@/types/admin";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
type SearchParams = Record<string, string | string[] | undefined>;

export function parseAdminTableQuery(
  searchParams: SearchParams,
  options: { pageSize?: number; maxPageSize?: number } = {},
): AdminTableQuery {
  const maxPageSize = options.maxPageSize ?? 100;
  const requestedPageSize = Number(readParam(searchParams.pageSize));

  return {
    page: clampInteger(readParam(searchParams.page), 1, 10_000, 1),
    pageSize: Number.isInteger(requestedPageSize)
      ? Math.max(10, Math.min(requestedPageSize, maxPageSize))
      : options.pageSize ?? 25,
    search: normalizeSearch(readParam(searchParams.search)),
    status: normalizeStatus(readParam(searchParams.status)),
    sort: normalizeStatus(readParam(searchParams.sort)),
  };
}

export async function loadAdminOverview(admin: AdminClient) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000).toISOString();
  const [
    jobsResult,
    newsSourcesResult,
    socialSourcesResult,
    schedulesResult,
    duplicateResult,
    socialReviewResult,
    notificationFailedResult,
    notificationQueuedResult,
    aiResult,
    findingsResult,
  ] = await Promise.all([
    admin
      .from("job_runs")
      .select("id, job_name, status, started_at, finished_at, error_message, items_processed, queue_version, requested_by, available_at, claimed_at, worker_id, attempt_count, max_attempts, retry_of, request_key, metadata")
      .order("started_at", { ascending: false })
      .limit(120),
    admin.from("news_sources").select("id, name, last_fetched_at, last_success_at, last_error, fetch_interval_minutes, is_active"),
    admin.from("social_sources").select("id, name, last_fetched_at, last_success_at, last_error, fetch_interval_minutes, is_active"),
    admin.from("admin_job_schedules").select("id, schedule_key, job_name, schedule_kind, interval_minutes, daily_time_utc, args, max_attempts, is_enabled, next_run_at, last_enqueued_at, last_job_run_id, updated_at").order("next_run_at"),
    admin.from("news_articles").select("id", { count: "exact", head: true }).eq("publication_status", "duplicate"),
    admin.from("social_posts").select("id", { count: "exact", head: true }).eq("status", "review"),
    admin.from("notification_queue").select("id", { count: "exact", head: true }).eq("status", "failed"),
    admin.from("notification_queue").select("id", { count: "exact", head: true }).eq("status", "queued"),
    admin.rpc("get_admin_ai_usage_summary", { p_since: thirtyDaysAgo }),
    admin
      .from("admin_findings")
      .select("id, severity, status", { count: "exact" })
      .in("status", ["open", "acknowledged", "action_pending", "fixing", "monitoring"]),
  ]);
  throwFirstError([
    jobsResult.error,
    newsSourcesResult.error,
    socialSourcesResult.error,
    schedulesResult.error,
    duplicateResult.error,
    socialReviewResult.error,
    notificationFailedResult.error,
    notificationQueuedResult.error,
    aiResult.error,
    findingsResult.error,
  ]);

  const jobs = (jobsResult.data ?? []).map(mapAdminJobRun);
  const latestByName = getLatestJobsByName(jobs);
  const scheduleSignals = (schedulesResult.data ?? []).map((schedule) =>
    makeScheduleStatus(schedule, latestByName.get(schedule.job_name) ?? null),
  );
  const sourceSignals = [
    ...(newsSourcesResult.data ?? []).map((source) => makeSourceStatus(source, "news")),
    ...(socialSourcesResult.data ?? []).map((source) => makeSourceStatus(source, "social")),
  ];
  const aiTotal = (aiResult.data ?? []).find((row) => row.dimension === "total");
  const aiCost = Number(aiTotal?.cost_usd ?? 0);

  return {
    signals: [...sourceSignals, ...scheduleSignals]
      .filter((signal) => signal.status !== "healthy")
      .sort((left, right) => signalWeight(right.status) - signalWeight(left.status))
      .slice(0, 8),
    jobs: jobs.slice(0, 12),
    metrics: {
      duplicateNews: duplicateResult.count ?? 0,
      socialReview: socialReviewResult.count ?? 0,
      notificationFailed: notificationFailedResult.count ?? 0,
      notificationQueued: notificationQueuedResult.count ?? 0,
      failedJobs: jobs.filter((job) => job.status === "failed").length,
      queuedJobs: jobs.filter((job) => job.status === "queued").length,
      aiCost,
      aiRuns: Number(aiTotal?.request_count ?? 0),
      activeFindings: findingsResult.count ?? 0,
      urgentFindings: (findingsResult.data ?? []).filter(
        (finding) => finding.severity === "P0" || finding.severity === "P1",
      ).length,
    },
  };
}

export async function loadAdminFindings(admin: AdminClient, query: AdminTableQuery) {
  const from = (query.page - 1) * query.pageSize;
  let findingsRequest = admin
    .from("admin_findings")
    .select("id, fingerprint, category, severity, status, title, description, evidence, route, entity_type, entity_id, job_run_id, release_sha, owner_kind, owner_user_id, github_issue_url, github_pr_url, resolution, first_seen_at, last_seen_at, occurrence_count, last_alerted_at, alert_count, resolved_at, created_at, updated_at", { count: "exact" })
    .order("last_seen_at", { ascending: false })
    .range(from, from + query.pageSize - 1);

  if (query.search) {
    findingsRequest = findingsRequest.or(
      `title.ilike.%${query.search}%,description.ilike.%${query.search}%`,
    );
  }
  if (
    query.status &&
    query.status !== "all" &&
    ["open", "acknowledged", "action_pending", "fixing", "monitoring", "resolved", "ignored"].includes(query.status)
  ) {
    findingsRequest = findingsRequest.eq("status", query.status as AdminFinding["status"]);
  }

  const [findingsResult, settingsResult, runsResult, heartbeatsResult] = await Promise.all([
    findingsRequest,
    admin
      .from("admin_agent_settings")
      .select("is_enabled, mode, telegram_alerts_enabled, r2_actions_enabled, shadow_started_at, updated_at")
      .eq("singleton", true)
      .single(),
    admin
      .from("admin_agent_runs")
      .select("id, status, counters, started_at, finished_at, duration_ms, error_code")
      .eq("run_kind", "watcher")
      .order("started_at", { ascending: false })
      .limit(12),
    admin
      .from("ops_service_heartbeats")
      .select("service_name, status, summary, checked_at")
      .order("checked_at", { ascending: false })
      .limit(30),
  ]);
  throwFirstError([
    findingsResult.error,
    settingsResult.error,
    runsResult.error,
    heartbeatsResult.error,
  ]);
  if (!settingsResult.data) throw new Error("Настройки наблюдения недоступны");

  const findingIds = (findingsResult.data ?? []).map((finding) => finding.id);
  const eventsResult = findingIds.length
    ? await admin
      .from("admin_finding_events")
      .select("id, finding_id, event_type, actor_kind, actor_user_id, payload, created_at")
      .in("finding_id", findingIds)
      .order("created_at", { ascending: false })
      .limit(500)
    : { data: [], error: null };
  throwFirstError([eventsResult.error]);

  const eventsByFinding = new Map<string, AdminFindingEvent[]>();
  for (const event of eventsResult.data ?? []) {
    const mapped: AdminFindingEvent = {
      id: event.id,
      findingId: event.finding_id,
      eventType: event.event_type,
      actorKind: event.actor_kind,
      actorUserId: event.actor_user_id,
      payload: event.payload,
      createdAt: event.created_at,
    };
    eventsByFinding.set(event.finding_id, [
      ...(eventsByFinding.get(event.finding_id) ?? []),
      mapped,
    ]);
  }

  const settings = settingsResult.data;
  return {
    items: (findingsResult.data ?? []).map((row) => ({
      finding: {
        id: row.id,
        fingerprint: row.fingerprint,
        category: row.category,
        severity: row.severity,
        status: row.status,
        title: row.title,
        description: row.description,
        evidence: row.evidence,
        route: row.route,
        entityType: row.entity_type,
        entityId: row.entity_id,
        jobRunId: row.job_run_id,
        releaseSha: row.release_sha,
        ownerKind: row.owner_kind,
        ownerUserId: row.owner_user_id,
        githubIssueUrl: row.github_issue_url,
        githubPrUrl: row.github_pr_url,
        resolution: row.resolution,
        firstSeenAt: row.first_seen_at,
        lastSeenAt: row.last_seen_at,
        occurrenceCount: row.occurrence_count,
        lastAlertedAt: row.last_alerted_at,
        alertCount: row.alert_count,
        resolvedAt: row.resolved_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      } satisfies AdminFinding,
      events: eventsByFinding.get(row.id) ?? [],
    })),
    total: findingsResult.count ?? 0,
    query,
    settings: {
      isEnabled: settings.is_enabled,
      mode: settings.mode,
      telegramAlertsEnabled: settings.telegram_alerts_enabled,
      r2ActionsEnabled: settings.r2_actions_enabled,
      shadowStartedAt: settings.shadow_started_at,
      updatedAt: settings.updated_at,
    },
    runs: runsResult.data ?? [],
    heartbeats: heartbeatsResult.data ?? [],
  };
}

export async function loadAdminNews(admin: AdminClient, query: AdminTableQuery) {
  const from = (query.page - 1) * query.pageSize;
  let request = admin
    .from("news_articles")
    .select("id, slug, source_id, original_title, ai_title_ru, ai_summary_ru, ai_summary_long_ru, publication_status, dedup_status, duplicate_of, published_at, source_published_at, ai_processed_at, updated_at", { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(from, from + query.pageSize - 1);

  if (query.search) {
    request = request.or(`original_title.ilike.%${query.search}%,ai_title_ru.ilike.%${query.search}%`);
  }
  if (query.status && query.status !== "all") {
    request = request.eq("publication_status", query.status);
  }

  const [articlesResult, sourcesResult, digestsResult] = await Promise.all([
    request,
    admin.from("news_sources").select("id, name, url, is_active, fetch_interval_minutes, last_fetched_at, last_success_at, last_error").order("name"),
    admin.from("digests").select("id, date_key, title, body_md, status, ai_model, generated_at").order("generated_at", { ascending: false }).limit(20),
  ]);
  throwFirstError([articlesResult.error, sourcesResult.error, digestsResult.error]);
  const sourceNames = new Map((sourcesResult.data ?? []).map((source) => [source.id, source.name]));
  const articleIds = (articlesResult.data ?? []).map((article) => article.id);
  const relationsResult = articleIds.length
    ? await admin.from("news_article_tags").select("article_id, tag_id").in("article_id", articleIds)
    : { data: [], error: null };
  throwFirstError([relationsResult.error]);
  const tagIds = [...new Set((relationsResult.data ?? []).map((relation) => relation.tag_id))];
  const tagsResult = tagIds.length
    ? await admin.from("tags").select("id, type, name").in("id", tagIds)
    : { data: [], error: null };
  throwFirstError([tagsResult.error]);
  const managedTags = new Map(
    (tagsResult.data ?? [])
      .filter((tag) => tag.type === "admin_topic")
      .map((tag) => [tag.id, tag.name]),
  );
  const tagNamesByArticle = new Map<string, string[]>();
  for (const relation of relationsResult.data ?? []) {
    const name = managedTags.get(relation.tag_id);
    if (name) tagNamesByArticle.set(relation.article_id, [...(tagNamesByArticle.get(relation.article_id) ?? []), name]);
  }

  return {
    items: (articlesResult.data ?? []).map((article) => ({
      ...article,
      sourceName: article.source_id ? sourceNames.get(article.source_id) ?? "Источник уточняется" : "Источник уточняется",
      tagNames: tagNamesByArticle.get(article.id) ?? [],
    })),
    total: articlesResult.count ?? 0,
    sources: sourcesResult.data ?? [],
    digests: digestsResult.data ?? [],
    query,
  };
}

export async function loadAdminSocial(admin: AdminClient, query: AdminTableQuery) {
  const from = (query.page - 1) * query.pageSize;
  let postsRequest = admin
    .from("social_posts")
    .select("id, platform, source_id, author, title, body, ai_title_ru, ai_summary_ru, original_url, image_url, published_at, status, content_kind, importance_score, processing_attempts, next_retry_at, last_processing_error, created_at, updated_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + query.pageSize - 1);

  if (query.search) {
    postsRequest = postsRequest.or(`title.ilike.%${query.search}%,body.ilike.%${query.search}%,ai_title_ru.ilike.%${query.search}%`);
  }
  if (query.status && query.status !== "all") {
    postsRequest = postsRequest.eq("status", query.status);
  }

  const [postsResult, sourcesResult] = await Promise.all([
    postsRequest,
    admin.from("social_sources").select("id, platform, name, url, adapter, feed_kind, is_active, publication_mode, fetch_interval_minutes, last_success_at, last_error, rate_limited_until").order("platform").order("name"),
  ]);
  throwFirstError([postsResult.error, sourcesResult.error]);
  const postIds = (postsResult.data ?? []).map((post) => post.id);
  const mediaResult = postIds.length
    ? await admin
      .from("social_post_media")
      .select("id, post_id, media_type, url, preview_url, alt_text, width, height, sort_order")
      .in("post_id", postIds)
      .order("sort_order")
    : { data: [], error: null };
  throwFirstError([mediaResult.error]);
  const mediaByPost = new Map<string, typeof mediaResult.data>();

  for (const media of mediaResult.data ?? []) {
    mediaByPost.set(media.post_id, [...(mediaByPost.get(media.post_id) ?? []), media]);
  }

  return {
    items: (postsResult.data ?? []).map((post) => ({
      ...post,
      media: mediaByPost.get(post.id) ?? [],
    })),
    sources: sourcesResult.data ?? [],
    total: postsResult.count ?? 0,
    query,
  };
}

export async function loadAdminReports(admin: AdminClient, query: AdminTableQuery) {
  const from = (query.page - 1) * query.pageSize;
  let reportsRequest = admin
    .from("grand_prix_reports")
    .select("id, season, round, race_slug, race_name, circuit_name, race_date, status, is_hidden, source_updated_at, generated_at, summary_status, ai_summary, source_errors, last_error, refresh_stage, next_refresh_at, updated_at", { count: "exact" })
    .order("season", { ascending: false })
    .order("round", { ascending: false })
    .range(from, from + query.pageSize - 1);

  if (query.search) {
    reportsRequest = reportsRequest.or(`race_name.ilike.%${query.search}%,circuit_name.ilike.%${query.search}%`);
  }
  if (query.status && query.status !== "all") {
    reportsRequest = reportsRequest.eq("status", query.status);
  }

  const [reportsResult, digestsResult] = await Promise.all([
    reportsRequest,
    admin.from("digests").select("id, digest_type, date_key, title, body_md, ai_model, generated_at, status").order("generated_at", { ascending: false }).limit(30),
  ]);
  throwFirstError([reportsResult.error, digestsResult.error]);

  return {
    items: reportsResult.data ?? [],
    total: reportsResult.count ?? 0,
    digests: digestsResult.data ?? [],
    query,
  };
}

export async function loadAdminSport(admin: AdminClient) {
  const currentSeason = new Date().getUTCFullYear();
  const [
    seasonsResult,
    racesResult,
    sessionsResult,
    resultsResult,
    driverStandingsResult,
    constructorStandingsResult,
    teamsResult,
    driversResult,
    trackAssetsResult,
    replaysResult,
    currentDriversResult,
    currentTeamsResult,
  ] = await Promise.all([
    admin.from("seasons").select("year, is_published, published_at").order("year", { ascending: false }),
    admin.from("races").select("id, season_year, round, race_name, status, race_start_at, updated_at").gte("season_year", 2020).order("season_year", { ascending: false }).order("round", { ascending: false }).limit(200),
    admin.from("sessions").select("id, race_id, session_type, status, start_at, updated_at", { count: "exact" }),
    admin.from("session_results").select("id", { count: "exact", head: true }),
    admin.from("driver_standings").select("id", { count: "exact", head: true }),
    admin.from("constructor_standings").select("id", { count: "exact", head: true }),
    admin.from("team_season_profiles").select("id, season_year, display_name, code, logo_image_url, car_image_url, source_urls, assets_verified_at").gte("season_year", 2020).order("season_year", { ascending: false }),
    admin.from("driver_season_profiles").select("id, season_year, code, permanent_number, avatar_image_url, avatar_review_status, source_urls, assets_verified_at").gte("season_year", 2020).order("season_year", { ascending: false }),
    admin.from("race_track_assets").select("id, race_id, layout_slug, image_url, source_url, source_manifest, checksum_sha256, is_verified, verified_at").order("updated_at", { ascending: false }).limit(160),
    admin.from("race_replay_sessions").select("id, title, status, source_season, source_session_key, source_race_name, prepared_at, updated_at").order("updated_at", { ascending: false }).limit(30),
    admin.from("drivers").select("id, slug, code, permanent_number, full_name, country, country_code, current_team_id, ai_avatar_url, avatar_placeholder_style, is_active").eq("is_active", true).order("full_name"),
    admin.from("teams").select("id, name, short_name, code").eq("is_active", true).order("name"),
  ]);
  throwFirstError([
    seasonsResult.error,
    racesResult.error,
    sessionsResult.error,
    resultsResult.error,
    driverStandingsResult.error,
    constructorStandingsResult.error,
    teamsResult.error,
    driversResult.error,
    trackAssetsResult.error,
    replaysResult.error,
    currentDriversResult.error,
    currentTeamsResult.error,
  ]);

  const seasons = seasonsResult.data ?? [];
  const archiveYears = seasons.filter((season) => season.year >= 2020 && season.year <= 2025);
  const archiveReady =
    archiveYears.length === 6 &&
    (teamsResult.data ?? [])
      .filter((profile) => profile.season_year <= 2025)
      .every((profile) => profile.assets_verified_at && profile.logo_image_url && profile.car_image_url) &&
    (trackAssetsResult.data ?? []).every((asset) => asset.is_verified && asset.checksum_sha256);

  return {
    currentSeason,
    seasons,
    races: racesResult.data ?? [],
    sessions: sessionsResult.data ?? [],
    counts: {
      sessions: sessionsResult.count ?? sessionsResult.data?.length ?? 0,
      results: resultsResult.count ?? 0,
      driverStandings: driverStandingsResult.count ?? 0,
      constructorStandings: constructorStandingsResult.count ?? 0,
    },
    archiveReady,
    archivePublished: archiveYears.length === 6 && archiveYears.every((season) => season.is_published),
    teamAssets: teamsResult.data ?? [],
    driverAssets: driversResult.data ?? [],
    trackAssets: trackAssetsResult.data ?? [],
    replays: replaysResult.data ?? [],
    currentDrivers: currentDriversResult.data ?? [],
    currentTeams: currentTeamsResult.data ?? [],
  };
}

export async function loadAdminCommunity(admin: AdminClient, query: AdminTableQuery) {
  const [pollsResult, optionsResult, votesResult, leaguesResult, predictionsResult] = await Promise.all([
    admin.from("polls").select("id, race_id, question, status, closes_at, poll_kind, generated_by_ai, created_at, updated_at").order("created_at", { ascending: false }).limit(100),
    admin.from("poll_options").select("id, poll_id, label, sort_order").order("sort_order"),
    admin.from("poll_votes").select("poll_id, option_id"),
    admin.from("prediction_leagues").select("id, name, invite_code, is_public, created_at, updated_at", { count: "exact" }).order("updated_at", { ascending: false }).limit(100),
    admin.from("predictions").select("id, submitted_at, locked_at, score, scored_at", { count: "exact" }).order("submitted_at", { ascending: false }).limit(30),
  ]);
  throwFirstError([pollsResult.error, optionsResult.error, votesResult.error, leaguesResult.error, predictionsResult.error]);
  const votesByPoll = countBy(votesResult.data ?? [], (vote) => vote.poll_id);
  const optionsByPoll = groupBy(optionsResult.data ?? [], (option) => option.poll_id);

  return {
    polls: (pollsResult.data ?? []).map((poll) => ({
      ...poll,
      options: optionsByPoll.get(poll.id) ?? [],
      votesCount: votesByPoll.get(poll.id) ?? 0,
    })),
    leagues: leaguesResult.data ?? [],
    leaguesCount: leaguesResult.count ?? 0,
    predictions: predictionsResult.data ?? [],
    predictionsCount: predictionsResult.count ?? 0,
    query,
  };
}

export async function loadAdminUsers(admin: AdminClient, query: AdminTableQuery) {
  const from = (query.page - 1) * query.pageSize;
  let request = admin
    .from("profiles")
    .select("id, email, display_name, language, timezone, onboarding_completed, created_at, updated_at", { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(from, from + query.pageSize - 1);

  if (query.search) {
    request = request.or(`email.ilike.%${query.search}%,display_name.ilike.%${query.search}%`);
  }

  const profilesResult = await request;
  throwFirstError([profilesResult.error]);
  const userIds = (profilesResult.data ?? []).map((profile) => profile.id);
  const empty = { data: [], error: null };
  const [teamsResult, driversResult, predictionsResult, membershipsResult, telegramResult] = await Promise.all([
    userIds.length ? admin.from("user_favorite_teams").select("user_id").in("user_id", userIds) : empty,
    userIds.length ? admin.from("user_favorite_drivers").select("user_id").in("user_id", userIds) : empty,
    userIds.length ? admin.from("predictions").select("user_id").in("user_id", userIds) : empty,
    userIds.length ? admin.from("prediction_league_members").select("user_id").in("user_id", userIds) : empty,
    userIds.length
      ? admin.from("telegram_accounts").select("user_id, username, is_active, connected_at, disconnected_at, last_delivery_at, last_error, updated_at").in("user_id", userIds)
      : empty,
  ]);
  throwFirstError([teamsResult.error, driversResult.error, predictionsResult.error, membershipsResult.error, telegramResult.error]);
  const favoriteTeams = countBy(teamsResult.data ?? [], (row) => row.user_id);
  const favoriteDrivers = countBy(driversResult.data ?? [], (row) => row.user_id);
  const predictions = countBy(predictionsResult.data ?? [], (row) => row.user_id);
  const leagues = countBy(membershipsResult.data ?? [], (row) => row.user_id);
  const telegram = new Map((telegramResult.data ?? []).map((row) => [row.user_id, row]));

  return {
    items: (profilesResult.data ?? []).map((profile) => ({
      ...profile,
      favoriteTeams: favoriteTeams.get(profile.id) ?? 0,
      favoriteDrivers: favoriteDrivers.get(profile.id) ?? 0,
      predictions: predictions.get(profile.id) ?? 0,
      leagues: leagues.get(profile.id) ?? 0,
      telegram: telegram.get(profile.id) ?? null,
    })),
    total: profilesResult.count ?? 0,
    query,
  };
}

export async function loadAdminNotifications(admin: AdminClient, query: AdminTableQuery) {
  const from = (query.page - 1) * query.pageSize;
  let queueRequest = admin
    .from("notification_queue")
    .select("id, user_id, event_type, entity_type, entity_id, available_at, status, attempts, last_error, created_at, sent_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + query.pageSize - 1);

  if (query.search) {
    queueRequest = queueRequest.ilike("event_type", `%${query.search}%`);
  }
  if (query.status && query.status !== "all") {
    queueRequest = queueRequest.eq("status", query.status);
  }

  const [queueResult, logsResult, accountsResult] = await Promise.all([
    queueRequest,
    admin.from("notification_logs").select("id, queue_id, user_id, channel, event_type, status, error_message, created_at").order("created_at", { ascending: false }).limit(100),
    admin.from("telegram_accounts").select("user_id, username, is_active, connected_at, disconnected_at, last_delivery_at, last_error, updated_at").order("updated_at", { ascending: false }).limit(100),
  ]);
  throwFirstError([queueResult.error, logsResult.error, accountsResult.error]);

  return {
    queue: queueResult.data ?? [],
    total: queueResult.count ?? 0,
    logs: logsResult.data ?? [],
    accounts: accountsResult.data ?? [],
    query,
  };
}

export async function loadAdminJobs(admin: AdminClient, query: AdminTableQuery) {
  const from = (query.page - 1) * query.pageSize;
  let request = admin
    .from("job_runs")
    .select("id, job_name, status, started_at, finished_at, items_processed, error_message, metadata, queue_version, requested_by, available_at, claimed_at, worker_id, attempt_count, max_attempts, retry_of, request_key", { count: "exact" })
    .order("started_at", { ascending: false })
    .range(from, from + query.pageSize - 1);

  if (query.search) {
    request = request.ilike("job_name", `%${query.search}%`);
  }
  if (query.status && query.status !== "all") {
    request = request.eq("status", query.status);
  }
  const result = await request;
  throwFirstError([result.error]);

  return {
    catalog: adminJobCatalog,
    items: (result.data ?? []).map(mapAdminJobRun),
    total: result.count ?? 0,
    query,
  };
}

export async function loadAdminSchedules(admin: AdminClient) {
  const [schedulesResult, jobsResult] = await Promise.all([
    admin
      .from("admin_job_schedules")
      .select("id, schedule_key, job_name, schedule_kind, interval_minutes, daily_time_utc, args, max_attempts, is_enabled, next_run_at, last_enqueued_at, last_job_run_id, updated_at")
      .order("next_run_at"),
    admin
      .from("job_runs")
      .select("id, job_name, status, started_at, finished_at, items_processed, error_message, metadata, queue_version, requested_by, available_at, claimed_at, worker_id, attempt_count, max_attempts, retry_of, request_key")
      .order("started_at", { ascending: false })
      .limit(300),
  ]);
  throwFirstError([schedulesResult.error, jobsResult.error]);
  const latestByName = getLatestJobsByName((jobsResult.data ?? []).map(mapAdminJobRun));
  const schedules = (schedulesResult.data ?? []).map((row) =>
    mapAdminSchedule(row, latestByName.get(row.job_name) ?? null),
  );

  return {
    schedules,
    metrics: {
      enabled: schedules.filter((schedule) => schedule.isEnabled).length,
      paused: schedules.filter((schedule) => !schedule.isEnabled).length,
      failed: schedules.filter((schedule) => schedule.lastRun?.status === "failed").length,
      due: schedules.filter(
        (schedule) => schedule.isEnabled && Date.parse(schedule.nextRunAt) <= Date.now(),
      ).length,
    },
  };
}

export async function loadAdminSystems(admin: AdminClient) {
  const [newsSourcesResult, socialSourcesResult, schedulesResult, jobsResult] =
    await Promise.all([
      admin
        .from("news_sources")
        .select("id, name, last_fetched_at, last_success_at, last_error, fetch_interval_minutes, is_active"),
      admin
        .from("social_sources")
        .select("id, name, last_fetched_at, last_success_at, last_error, fetch_interval_minutes, is_active"),
      admin
        .from("admin_job_schedules")
        .select("id, schedule_key, job_name, schedule_kind, interval_minutes, daily_time_utc, args, max_attempts, is_enabled, next_run_at, last_enqueued_at, last_job_run_id, updated_at")
        .order("next_run_at"),
      admin
        .from("job_runs")
        .select("id, job_name, status, started_at, finished_at, items_processed, error_message, metadata, queue_version, requested_by, available_at, claimed_at, worker_id, attempt_count, max_attempts, retry_of, request_key")
        .order("started_at", { ascending: false })
        .limit(300),
    ]);
  throwFirstError([
    newsSourcesResult.error,
    socialSourcesResult.error,
    schedulesResult.error,
    jobsResult.error,
  ]);
  const latestByName = getLatestJobsByName((jobsResult.data ?? []).map(mapAdminJobRun));
  const items: AdminSystemStatus[] = [
    ...(newsSourcesResult.data ?? []).map((source) => makeSourceStatus(source, "news")),
    ...(socialSourcesResult.data ?? []).map((source) => makeSourceStatus(source, "social")),
    ...(schedulesResult.data ?? []).map((schedule) =>
      makeScheduleStatus(schedule, latestByName.get(schedule.job_name) ?? null),
    ),
  ].sort((left, right) => {
    const weight = signalWeight(right.status) - signalWeight(left.status);
    return weight || left.group.localeCompare(right.group, "ru") || left.label.localeCompare(right.label, "ru");
  });

  return {
    items,
    metrics: {
      healthy: items.filter((item) => item.status === "healthy").length,
      attention: items.filter((item) => item.status === "stale" || item.status === "warning").length,
      failed: items.filter((item) => item.status === "failed").length,
      paused: items.filter((item) => !item.isEnabled).length,
    },
  };
}

export async function loadAdminAi(admin: AdminClient) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000).toISOString();
  const [
    summaryResult,
    usageResult,
    articlesResult,
    postsResult,
    budgetsResult,
    publishedPromptsResult,
    draftPromptsResult,
    promptHistoryResult,
    xBudgetUsageResult,
  ] = await Promise.all([
    admin.rpc("get_admin_ai_usage_summary", { p_since: thirtyDaysAgo }),
    admin.from("ai_usage_logs").select("id, purpose, provider, model, input_tokens, output_tokens, estimated_cost_usd, related_article_id, related_digest_id, prompt_key, prompt_version_id, created_at").gte("created_at", thirtyDaysAgo).order("created_at", { ascending: false }).limit(100),
    admin.from("news_articles").select("id, slug, original_title, ai_title_ru, publication_status, image_status, ai_model, ai_processed_at, updated_at").or("ai_model.eq.fallback,publication_status.eq.ai_failed").order("updated_at", { ascending: false }).limit(100),
    admin.from("social_posts").select("id, platform, title, ai_title_ru, status, last_processing_error, processing_attempts, updated_at").not("last_processing_error", "is", null).order("updated_at", { ascending: false }).limit(100),
    admin.from("admin_ai_budgets").select("scope, daily_limit_usd, monthly_limit_usd, updated_at").in("scope", ["default", "social_x"]),
    admin.from("ai_prompt_versions").select("id, prompt_key, version, status, system_prompt, user_template, model, max_tokens, change_note, checksum, created_at, published_at").eq("status", "published"),
    admin.from("ai_prompt_versions").select("id, prompt_key, version, status, system_prompt, user_template, model, max_tokens, change_note, checksum, created_at, published_at").eq("status", "draft").order("version", { ascending: false }).limit(50),
    admin.from("ai_prompt_versions").select("id, prompt_key, version, status, model, max_tokens, change_note, checksum, created_at, published_at").order("created_at", { ascending: false }).limit(100),
    admin.rpc("get_ai_budget_guard", { p_purpose: "social.x" }),
  ]);
  throwFirstError([
    summaryResult.error,
    usageResult.error,
    articlesResult.error,
    postsResult.error,
    budgetsResult.error,
    publishedPromptsResult.error,
    draftPromptsResult.error,
    promptHistoryResult.error,
    xBudgetUsageResult.error,
  ]);
  const summaryRows = (summaryResult.data ?? []).map(normalizeAdminAiUsageSummary);
  const total = summaryRows.find((row) => row.dimension === "total");
  const publishedPrompts = new Map(
    (publishedPromptsResult.data ?? [])
      .map(mapAdminAiPromptVersion)
      .map((version) => [version.promptKey, version]),
  );
  const latestDrafts = new Map<string, AdminAiPromptVersion>();
  for (const row of draftPromptsResult.data ?? []) {
    const version = mapAdminAiPromptVersion(row);
    if (!latestDrafts.has(version.promptKey)) {
      latestDrafts.set(version.promptKey, version);
    }
  }
  const promptHistory = (promptHistoryResult.data ?? []).map(mapAdminAiPromptVersionSummary);
  const xBudgetUsage = (xBudgetUsageResult.data ?? []).find(
    (row) => row.scope === "social_x",
  );

  return {
    totalCost: total?.cost_usd ?? 0,
    totalRuns: total?.request_count ?? 0,
    totalInputTokens: total?.input_tokens ?? 0,
    totalOutputTokens: total?.output_tokens ?? 0,
    unpricedRuns: total?.unpriced_count ?? 0,
    byDay: summaryRows.filter((row) => row.dimension === "day").sort((left, right) => right.bucket.localeCompare(left.bucket)),
    byModel: summaryRows.filter((row) => row.dimension === "model").sort((left, right) => right.cost_usd - left.cost_usd),
    byPurpose: summaryRows.filter((row) => row.dimension === "purpose").sort((left, right) => right.cost_usd - left.cost_usd),
    recent: usageResult.data ?? [],
    prompts: adminAiPromptCatalog.map((definition) => ({
      definition,
      published: publishedPrompts.get(definition.key) ?? null,
      latestDraft: latestDrafts.get(definition.key) ?? null,
      history: promptHistory.filter((version) => version.promptKey === definition.key),
    })),
    problemArticles: articlesResult.data ?? [],
    problemPosts: postsResult.data ?? [],
    budget: budgetsResult.data?.find((budget) => budget.scope === "default") ?? {
      scope: "default" as const,
      daily_limit_usd: 5,
      monthly_limit_usd: 100,
      updated_at: null,
    },
    xBudget: budgetsResult.data?.find((budget) => budget.scope === "social_x") ?? {
      scope: "social_x" as const,
      daily_limit_usd: 1,
      monthly_limit_usd: 20,
      updated_at: null,
    },
    xSpendToday: Number(xBudgetUsage?.daily_spend_usd ?? 0),
    xSpend30Days: Number(xBudgetUsage?.monthly_spend_usd ?? 0),
  };
}

function mapAdminAiPromptVersion(row: {
  id: string;
  prompt_key: string;
  version: number;
  status: string;
  system_prompt: string;
  user_template: string;
  model: string | null;
  max_tokens: number | null;
  change_note: string | null;
  checksum: string;
  created_at: string;
  published_at: string | null;
}): AdminAiPromptVersion {
  return {
    id: row.id,
    promptKey: row.prompt_key,
    version: row.version,
    status: normalizePromptStatus(row.status),
    systemPrompt: row.system_prompt,
    userTemplate: row.user_template,
    model: row.model,
    maxTokens: row.max_tokens,
    changeNote: row.change_note,
    checksum: row.checksum,
    createdAt: row.created_at,
    publishedAt: row.published_at,
  };
}

function mapAdminAiPromptVersionSummary(row: {
  id: string;
  prompt_key: string;
  version: number;
  status: string;
  model: string | null;
  max_tokens: number | null;
  change_note: string | null;
  checksum: string;
  created_at: string;
  published_at: string | null;
}): AdminAiPromptVersionSummary {
  return {
    id: row.id,
    promptKey: row.prompt_key,
    version: row.version,
    status: normalizePromptStatus(row.status),
    model: row.model,
    maxTokens: row.max_tokens,
    changeNote: row.change_note,
    checksum: row.checksum,
    createdAt: row.created_at,
    publishedAt: row.published_at,
  };
}

function normalizePromptStatus(status: string): AdminAiPromptVersion["status"] {
  return status === "published" || status === "archived" ? status : "draft";
}

function normalizeAdminAiUsageSummary(row: AdminAiUsageSummaryRow): AdminAiUsageSummaryRow {
  return {
    dimension: row.dimension,
    bucket: row.bucket,
    request_count: Number(row.request_count ?? 0),
    input_tokens: Number(row.input_tokens ?? 0),
    output_tokens: Number(row.output_tokens ?? 0),
    cost_usd: Number(row.cost_usd ?? 0),
    unpriced_count: Number(row.unpriced_count ?? 0),
  };
}

export async function loadAdminAudit(admin: AdminClient, query: AdminTableQuery) {
  const from = (query.page - 1) * query.pageSize;
  let request = admin
    .from("admin_audit_log")
    .select("id, actor_user_id, action, entity_type, entity_id, outcome, before_data, after_data, metadata, created_at, finished_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + query.pageSize - 1);

  if (query.search) {
    request = request.or(`action.ilike.%${query.search}%,entity_type.ilike.%${query.search}%,entity_id.ilike.%${query.search}%`);
  }
  if (query.status && query.status !== "all") {
    const outcome = ["started", "succeeded", "failed"].includes(query.status)
      ? query.status as AdminAuditEntry["outcome"]
      : null;
    if (outcome) request = request.eq("outcome", outcome);
  }
  const result = await request;
  throwFirstError([result.error]);

  return {
    items: (result.data ?? []).map<AdminAuditEntry>((entry) => ({
      id: entry.id,
      actorUserId: entry.actor_user_id,
      action: entry.action,
      entityType: entry.entity_type,
      entityId: entry.entity_id,
      outcome: entry.outcome,
      beforeData: entry.before_data,
      afterData: entry.after_data,
      metadata: entry.metadata,
      createdAt: entry.created_at,
      finishedAt: entry.finished_at,
    })),
    total: result.count ?? 0,
    query,
  };
}

function mapAdminJobRun(job: {
  id: string;
  job_name: string;
  status: string;
  requested_by: string | null;
  available_at: string | null;
  claimed_at: string | null;
  started_at: string;
  finished_at: string | null;
  items_processed: number;
  attempt_count: number;
  max_attempts: number;
  retry_of: string | null;
  request_key: string | null;
  queue_version: number | null;
  worker_id: string | null;
  metadata: AdminJobRun["metadata"];
  error_message: string | null;
}): AdminJobRun {
  return {
    id: job.id,
    jobName: job.job_name,
    status: job.status,
    requestedBy: job.requested_by,
    availableAt: job.available_at,
    claimedAt: job.claimed_at,
    startedAt: job.started_at,
    finishedAt: job.finished_at,
    itemsProcessed: job.items_processed,
    attemptCount: job.attempt_count,
    maxAttempts: job.max_attempts,
    retryOf: job.retry_of,
    requestKey: job.request_key,
    queueVersion: job.queue_version,
    workerId: job.worker_id,
    metadata: job.metadata,
    errorMessage: job.error_message,
  };
}

function makeSourceStatus(
  source: {
    id: string;
    name: string;
    last_fetched_at: string | null;
    last_success_at: string | null;
    last_error: string | null;
    fetch_interval_minutes: number;
    is_active: boolean;
  },
  kind: "news" | "social",
): AdminSystemStatus {
  const ageMinutes = source.last_success_at
    ? (Date.now() - Date.parse(source.last_success_at)) / 60_000
    : Number.POSITIVE_INFINITY;
  const stale = source.is_active && ageMinutes > source.fetch_interval_minutes * 2;

  return {
    id: `source:${source.id}`,
    label: source.name,
    kind: "source",
    group: kind === "news" ? "RSS и новости" : "Социальные источники",
    description: kind === "news"
      ? "Загрузка материалов из RSS-ленты."
      : "Загрузка публикаций из подключённого источника.",
    status: source.last_error ? "failed" : stale ? "stale" : source.is_active ? "healthy" : "warning",
    detail: source.last_error
      ? source.last_error.slice(0, 180)
      : source.is_active
        ? source.last_success_at
          ? `Последний успех ${formatRelativeTime(source.last_success_at)}`
          : "Успешных загрузок пока нет"
        : "Источник на паузе",
    checkedAt: source.last_fetched_at ?? source.last_success_at,
    lastSuccessAt: source.last_success_at,
    nextCheckAt: source.is_active && (source.last_fetched_at ?? source.last_success_at)
      ? new Date(
        Date.parse(source.last_fetched_at ?? source.last_success_at!) +
          source.fetch_interval_minutes * 60_000,
      ).toISOString()
      : null,
    isEnabled: source.is_active,
    href: `/admin/systems#source-${source.id}`,
  };
}

function makeScheduleStatus(
  schedule: {
    id: string;
    schedule_key: string;
    job_name: string;
    schedule_kind: "interval" | "daily" | "adaptive";
    interval_minutes: number | null;
    daily_time_utc: string | null;
    is_enabled: boolean;
    next_run_at: string;
  },
  latest: AdminJobRun | null,
): AdminSystemStatus {
  const definition = getAdminJobDefinition(schedule.job_name);
  const checkedAt = latest?.finishedAt ?? latest?.startedAt ?? null;
  const expectedMinutes = schedule.schedule_kind === "interval"
    ? schedule.interval_minutes ?? 30
    : 1_440;
  const stale = schedule.is_enabled && (
    Date.now() > Date.parse(schedule.next_run_at) + Math.max(5, expectedMinutes) * 60_000
    || (checkedAt !== null && Date.now() - Date.parse(checkedAt) > expectedMinutes * 2 * 60_000)
  );
  const failed = latest?.status === "failed";

  return {
    id: `schedule:${schedule.schedule_key}`,
    label: definition?.title ?? "Фоновая проверка",
    kind: "schedule",
    group: getSystemGroup(schedule.job_name),
    description: definition?.description ?? "Плановая фоновая проверка RaceSide.",
    status: !schedule.is_enabled
      ? "warning"
      : failed
        ? "failed"
        : stale
          ? "stale"
          : latest
            ? "healthy"
            : "unknown",
    detail: !schedule.is_enabled
      ? "Плановая проверка на паузе"
      : failed
        ? latest.errorMessage ?? "Последняя проверка завершилась с ошибкой"
        : latest
          ? `Последняя проверка ${formatRelativeTime(checkedAt ?? latest.startedAt)}`
          : "Проверка ещё не запускалась",
    checkedAt,
    lastSuccessAt: latest?.status === "success" ? checkedAt : null,
    nextCheckAt: schedule.is_enabled ? schedule.next_run_at : null,
    isEnabled: schedule.is_enabled,
    href: `/admin/systems#schedule-${schedule.schedule_key}`,
  };
}

function getSystemGroup(jobName: string) {
  if (jobName.startsWith("openf1.")) return "OpenF1";
  if (jobName.startsWith("jolpica.")) return "Jolpica";
  if (jobName.startsWith("weather.")) return "Погода";
  if (jobName.startsWith("social.")) return "Социальные источники";
  if (jobName.startsWith("rss.") || jobName.startsWith("news.")) return "RSS и новости";
  if (jobName.startsWith("ai.")) return "OpenRouter";
  if (jobName.startsWith("notifications.")) return "Telegram";
  return "Внутренние процессы";
}

function getLatestJobsByName(jobs: AdminJobRun[]) {
  const latestByName = new Map<string, AdminJobRun>();

  for (const job of jobs) {
    if (!latestByName.has(job.jobName)) {
      latestByName.set(job.jobName, job);
    }
  }

  return latestByName;
}

function mapAdminSchedule(
  row: {
    id: string;
    schedule_key: string;
    job_name: string;
    schedule_kind: "interval" | "daily" | "adaptive";
    interval_minutes: number | null;
    daily_time_utc: string | null;
    args: AdminSchedule["args"];
    max_attempts: number;
    is_enabled: boolean;
    next_run_at: string;
    last_enqueued_at: string | null;
    last_job_run_id: string | null;
    updated_at: string;
  },
  lastRun: AdminJobRun | null,
): AdminSchedule {
  return {
    id: row.id,
    scheduleKey: row.schedule_key,
    jobName: row.job_name,
    scheduleKind: row.schedule_kind,
    intervalMinutes: row.interval_minutes,
    dailyTimeUtc: row.daily_time_utc,
    args: row.args,
    maxAttempts: row.max_attempts,
    isEnabled: row.is_enabled,
    nextRunAt: row.next_run_at,
    lastEnqueuedAt: row.last_enqueued_at,
    lastJobRunId: row.last_job_run_id,
    lastRun,
    updatedAt: row.updated_at,
  };
}

function formatRelativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60_000));

  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин назад`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)} ч назад`;
  return `${Math.floor(minutes / 1_440)} дн назад`;
}

function signalWeight(status: AdminSystemSignal["status"]) {
  return { failed: 5, stale: 4, warning: 3, unknown: 2, healthy: 1 }[status];
}

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function normalizeSearch(value: string) {
  return value.trim().replace(/[%_,()]/g, " ").replace(/\s+/g, " ").slice(0, 80);
}

function normalizeStatus(value: string) {
  return value.trim().replace(/[^a-z0-9_.-]/gi, "").slice(0, 40) || undefined;
}

function clampInteger(value: string, min: number, max: number, fallback: number) {
  const number = Number(value);
  return Number.isInteger(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function throwFirstError(errors: Array<{ message: string } | null | undefined>) {
  const error = errors.find(Boolean);
  if (error) throw new Error(error.message);
}

function countBy<T>(items: T[], getKey: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = getKey(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = getKey(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

export function getAdminJobTitle(jobName: string) {
  return getAdminJobDefinition(jobName)?.title ?? jobName;
}
