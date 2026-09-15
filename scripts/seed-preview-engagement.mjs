import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { scoreFantasyPrediction } from "../worker/fantasy-scoring.mjs";

try {
  process.loadEnvFile?.(".env.local");
} catch {
  // Production and CI normally provide environment variables directly.
}

const BOT_COUNT = 55;
const ARTICLE_LIMIT = 120;
const BATCH_KEY = "preview-engagement-v1";
const CURRENT_SEASON = 2026;
const MANIFEST_PATH = resolve("scripts/test-data/synthetic-engagement-manifest.json");
const REACTIONS = ["🔥", "🏁", "👀", "🤔"];
const LEAGUE_SIZES = [10, 10, 10, 9, 8, 8];
const LEAGUE_NAMES = [
  "Позднее торможение",
  "Красный сектор",
  "Гонка до финиша",
  "Пит-уолл",
  "Фанаты паддока",
  "Точный прогноз",
];
const BOT_NICKNAMES = [
  "denis_92", "Катя", "ivan.p", "sergey1988", "Masha_M",
  "Димон", "kirill_777", "alex13", "Настя", "vlad_msk",
  "Лёша", "northside", "anya_spb", "roman_61", "Макс",
  "lera_k", "coffeeplease", "kostya27", "airwave", "Виктор",
  "artur_m", "sunnyday", "no_name", "Женя", "igor74",
  "dasha_s", "AndreyK", "никита", "stason", "mike_44",
  "Юля", "antonio", "pavel_p", "Саня", "vovan116",
  "Kira", "oleg_nn", "neonlight", "Марина", "stepan_23",
  "max_fan33", "boxbox", "papaya81", "forza_16", "late_braker",
  "Alina", "boris_b", "tanya88", "ruslan_kzn", "dreamer",
  "matvey", "eugene_5", "Валера", "just_roman", "polina_v",
];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const botDefinitions = Array.from({ length: BOT_COUNT }, (_, index) => ({
  displayName: BOT_NICKNAMES[index],
  email: `preview.bot.${String(index + 1).padStart(3, "0")}@raceside.test`,
  index,
}));

await assertBotMarkerIsAvailable();
const bots = await ensureBotUsers();
const sportingData = await loadSportingData();

await resetBotActivity(bots.map((bot) => bot.id));

const favoriteCounts = await seedFavorites(bots, sportingData);
const predictionRows = buildPredictions(bots, sportingData);
await insertInChunks("predictions", predictionRows, 250);

const leagues = await seedLeagues(bots);
const reactionSummary = await seedArticleReactions(bots);
const pollSummary = await seedPollVotes(bots);

const manifest = {
  batchKey: BATCH_KEY,
  generatedAt: new Date().toISOString(),
  botUsers: bots.map((bot) => ({
    displayName: bot.displayName,
    email: bot.email,
    id: bot.id,
  })),
  leagues,
  seeded: {
    articleCount: reactionSummary.articleCount,
    favoriteDrivers: favoriteCounts.drivers,
    favoriteTeams: favoriteCounts.teams,
    leagueMemberships: leagues.reduce((sum, league) => sum + league.memberIds.length, 0),
    pollCount: pollSummary.pollCount,
    predictions: predictionRows.length,
    reactions: reactionSummary.reactions,
    votes: pollSummary.votes,
  },
};

await mkdir(dirname(MANIFEST_PATH), { recursive: true });
await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  manifestPath: MANIFEST_PATH,
  ...manifest.seeded,
  bots: bots.length,
  leagues: leagues.length,
}, null, 2));

async function assertBotMarkerIsAvailable() {
  const { error } = await supabase.from("profiles").select("id, is_bot").limit(1);

  if (error) {
    throw new Error(`Apply the is_bot migration before seeding: ${error.message}`);
  }
}

async function ensureBotUsers() {
  const emails = botDefinitions.map((bot) => bot.email);
  const { data: existingProfiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, display_name")
    .in("email", emails);

  throwIfError(profileError, "load preview profiles");
  const existingByEmail = new Map((existingProfiles ?? []).map((profile) => [profile.email, profile]));
  const bots = [];

  for (const definition of botDefinitions) {
    let profile = existingByEmail.get(definition.email);

    if (!profile) {
      const { data, error } = await supabase.auth.admin.createUser({
        app_metadata: { is_bot: true, seed_batch: BATCH_KEY },
        email: definition.email,
        email_confirm: true,
        password: randomBytes(32).toString("base64url"),
        user_metadata: { display_name: definition.displayName },
      });

      throwIfError(error, `create ${definition.email}`);
      profile = {
        display_name: definition.displayName,
        email: definition.email,
        id: data.user.id,
      };
    } else {
      const { error } = await supabase.auth.admin.updateUserById(profile.id, {
        app_metadata: { is_bot: true, seed_batch: BATCH_KEY },
        user_metadata: { display_name: definition.displayName },
      });
      throwIfError(error, `mark ${definition.email} as preview bot`);
    }

    bots.push({
      displayName: definition.displayName,
      email: definition.email,
      id: profile.id,
      index: definition.index,
    });
  }

  const { error } = await supabase.from("profiles").upsert(
    bots.map((bot) => ({
      display_name: bot.displayName,
      email: bot.email,
      id: bot.id,
      is_bot: true,
      language: "ru",
      onboarding_completed: true,
      timezone: "Europe/Moscow",
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "id" },
  );
  throwIfError(error, "update preview profiles");

  return bots;
}

async function loadSportingData() {
  const [racesResult, driversResult, teamsResult, standingsResult] = await Promise.all([
    supabase
      .from("races")
      .select("id, round, race_name, race_start_at, status")
      .eq("season_year", CURRENT_SEASON)
      .order("round"),
    supabase
      .from("drivers")
      .select("id, code, full_name, current_team_id")
      .eq("is_active", true),
    supabase
      .from("teams")
      .select("id, code, name")
      .eq("is_active", true),
    supabase
      .from("driver_standings")
      .select("driver_id, team_id, position, points, round")
      .eq("season_year", CURRENT_SEASON)
      .order("round", { ascending: false })
      .order("position"),
  ]);

  [racesResult, driversResult, teamsResult, standingsResult].forEach((result) => throwIfError(result.error, "load sporting data"));

  const races = racesResult.data ?? [];
  const completed = races.filter((race) => race.status === "completed" || Date.parse(race.race_start_at ?? "") < Date.now()).slice(-5);
  const upcoming = races.find((race) => Date.parse(race.race_start_at ?? "") > Date.now()) ?? null;
  const latestRound = Math.max(...(standingsResult.data ?? []).map((row) => Number(row.round ?? 0)));
  const standings = (standingsResult.data ?? [])
    .filter((row) => Number(row.round ?? 0) === latestRound)
    .sort((left, right) => Number(left.position ?? 99) - Number(right.position ?? 99));
  const driverById = new Map((driversResult.data ?? []).map((driver) => [driver.id, driver]));
  const teams = teamsResult.data ?? [];

  if (completed.length < 3 || !upcoming || standings.length < 10) {
    throw new Error("Not enough current-season races or standings to build realistic predictions");
  }

  const raceIds = completed.map((race) => race.id);
  const { data: sessions, error: sessionsError } = await supabase
    .from("sessions")
    .select("id, race_id, session_type")
    .in("race_id", raceIds)
    .in("session_type", ["qualifying", "race", "sprint"]);
  throwIfError(sessionsError, "load sessions");

  const sessionIds = (sessions ?? []).map((session) => session.id);
  const [{ data: results, error: resultsError }, { data: reports, error: reportsError }] = await Promise.all([
    supabase
      .from("session_results")
      .select("session_id, driver_id, team_id, position, status, laps, points, raw_payload")
      .in("session_id", sessionIds)
      .order("position", { ascending: true, nullsFirst: false }),
    supabase
      .from("grand_prix_reports")
      .select("round, highlights, pit_stops, results")
      .eq("season", CURRENT_SEASON)
      .in("round", completed.map((race) => race.round)),
  ]);
  throwIfError(resultsError, "load session results");
  throwIfError(reportsError, "load race reports");

  const resultsBySession = groupBy(results ?? [], (result) => result.session_id);
  const sessionsByRace = groupBy(sessions ?? [], (session) => session.race_id);
  const reportByRound = new Map((reports ?? []).map((report) => [report.round, report]));
  const teamByDriverId = new Map((driversResult.data ?? []).map((driver) => [driver.id, driver.current_team_id]));
  const actuals = new Map();

  for (const race of completed) {
    const raceSessions = sessionsByRace.get(race.id) ?? [];
    const raceSession = raceSessions.find((session) => session.session_type === "race");
    const qualifyingSession = raceSessions.find((session) => session.session_type === "qualifying");
    const pointsSessions = raceSessions.filter((session) => session.session_type === "race" || session.session_type === "sprint");
    const raceResults = (raceSession ? resultsBySession.get(raceSession.id) ?? [] : [])
      .filter((result) => result.driver_id && Number(result.position) > 0)
      .sort((left, right) => Number(left.position) - Number(right.position));
    const qualifyingResults = (qualifyingSession ? resultsBySession.get(qualifyingSession.id) ?? [] : [])
      .filter((result) => result.driver_id && Number(result.position) > 0)
      .sort((left, right) => Number(left.position) - Number(right.position));

    if (raceResults.length < 10) continue;

    const teamPoints = new Map();
    for (const session of pointsSessions) {
      for (const result of resultsBySession.get(session.id) ?? []) {
        if (result.team_id && Number(result.points ?? 0) > 0) {
          teamPoints.set(result.team_id, (teamPoints.get(result.team_id) ?? 0) + Number(result.points));
        }
      }
    }

    const nonFinishers = raceResults.filter((result) => isNonFinishStatus(result.status));
    const report = reportByRound.get(race.round);

    actuals.set(race.id, {
      fastestLapDriverId: raceResults.find((result) => String(result.raw_payload?.FastestLap?.rank ?? "") === "1")?.driver_id ?? null,
      fastestPitStopTeamId: resolveFastestPitStopTeam(report, teams, raceResults),
      firstDnfDriverIds: nonFinishers.length ? [nonFinishers.at(-1)?.driver_id].filter(Boolean) : [],
      poleDriverId: qualifyingResults[0]?.driver_id ?? null,
      raceCompleted: true,
      top10DriverIds: raceResults.slice(0, 10).map((result) => result.driver_id),
      topScoringTeamId: [...teamPoints.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null,
      winnerDriverId: raceResults[0]?.driver_id ?? null,
    });
  }

  return {
    actuals,
    completed: completed.filter((race) => actuals.has(race.id)),
    driverById,
    standings,
    standingsDriverIds: standings.map((row) => row.driver_id).filter(Boolean),
    teamByDriverId,
    teams,
    upcoming,
  };
}

async function resetBotActivity(botIds) {
  const ownedLeagues = await supabase
    .from("prediction_leagues")
    .select("id")
    .in("owner_user_id", botIds);
  throwIfError(ownedLeagues.error, "load preview leagues");

  const deletions = [
    supabase.from("article_reactions").delete().in("user_id", botIds),
    supabase.from("poll_votes").delete().in("user_id", botIds),
    supabase.from("predictions").delete().in("user_id", botIds),
    supabase.from("prediction_league_members").delete().in("user_id", botIds),
    supabase.from("user_favorite_drivers").delete().in("user_id", botIds),
    supabase.from("user_favorite_teams").delete().in("user_id", botIds),
  ];

  if (ownedLeagues.data?.length) {
    deletions.push(supabase.from("prediction_leagues").delete().in("id", ownedLeagues.data.map((league) => league.id)));
  }

  const results = await Promise.all(deletions);
  results.forEach((result) => throwIfError(result.error, "reset preview activity"));
}

async function seedFavorites(bots, sportingData) {
  const driverRows = [];
  const teamRows = [];

  for (const bot of bots) {
    const random = mulberry32(hashSeed(`favorite:${bot.index}`));
    const favoriteDrivers = sampleUnique(sportingData.standingsDriverIds, 2, random);
    const favoriteTeamId = sportingData.teamByDriverId.get(favoriteDrivers[0]) ?? pick(sportingData.teams, random)?.id;

    favoriteDrivers.forEach((driverId) => driverRows.push({ driver_id: driverId, user_id: bot.id }));
    if (favoriteTeamId) teamRows.push({ team_id: favoriteTeamId, user_id: bot.id });
  }

  await insertInChunks("user_favorite_drivers", driverRows, 250);
  await insertInChunks("user_favorite_teams", teamRows, 250);
  return { drivers: driverRows.length, teams: teamRows.length };
}

function buildPredictions(bots, sportingData) {
  const rows = [];

  for (const bot of bots) {
    const completedCount = 3 + (bot.index % 3);
    const races = [...sportingData.completed.slice(-completedCount), sportingData.upcoming];

    for (const race of races) {
      const random = mulberry32(hashSeed(`prediction:${bot.index}:${race.round}`));
      const actual = sportingData.actuals.get(race.id) ?? null;
      const baseOrder = actual?.top10DriverIds?.length >= 10
        ? actual.top10DriverIds
        : sportingData.standingsDriverIds.slice(0, 10);
      const top10DriverIds = buildPlausibleTop10(baseOrder, sportingData.standingsDriverIds, random);
      const lowerDrivers = sportingData.standingsDriverIds.slice(10);
      const poleDriverId = actual?.poleDriverId && random() < 0.58
        ? actual.poleDriverId
        : pick(top10DriverIds.slice(0, 5), random);
      const fastestLapDriverId = actual?.fastestLapDriverId && random() < 0.4
        ? actual.fastestLapDriverId
        : pick(top10DriverIds.slice(0, 8), random);
      const dnfDriverId = actual?.firstDnfDriverIds?.length && random() < 0.22
        ? pick(actual.firstDnfDriverIds, random)
        : pick(lowerDrivers.length ? lowerDrivers : sportingData.standingsDriverIds.slice(-8), random);
      const predictedWinnerTeamId = sportingData.teamByDriverId.get(top10DriverIds[0]) ?? null;
      const topScoringTeamId = actual?.topScoringTeamId && random() < 0.55
        ? actual.topScoringTeamId
        : predictedWinnerTeamId ?? pick(sportingData.teams, random)?.id ?? null;
      const fastestPitStopTeamId = actual?.fastestPitStopTeamId && random() < 0.35
        ? actual.fastestPitStopTeamId
        : pick(sportingData.teams.slice(0, 6), random)?.id ?? null;
      const prediction = {
        dnf_driver_id: dnfDriverId,
        dnf_pick_kind: "driver",
        fastest_lap_driver_id: fastestLapDriverId,
        fastest_pit_stop_team_id: fastestPitStopTeamId,
        pole_driver_id: poleDriverId,
        top10_driver_ids: top10DriverIds,
        top_scoring_team_id: topScoringTeamId,
        winner_driver_id: top10DriverIds[0],
      };
      const scoreBreakdown = actual ? scoreFantasyPrediction(prediction, actual) : null;
      const submittedAt = new Date(Date.parse(race.race_start_at) - (6 + Math.floor(random() * 84)) * 60 * 60 * 1_000).toISOString();

      rows.push({
        ...prediction,
        is_public: false,
        league_id: null,
        locked_at: actual ? race.race_start_at : null,
        race_id: race.id,
        score: scoreBreakdown?.total ?? null,
        score_breakdown: scoreBreakdown,
        scored_at: actual ? new Date(Date.parse(race.race_start_at) + 3 * 60 * 60 * 1_000).toISOString() : null,
        share_image_version: 1,
        submitted_at: submittedAt,
        top3_driver_ids: top10DriverIds.slice(0, 3),
        user_id: bot.id,
      });
    }
  }

  return rows;
}

function buildPlausibleTop10(baseOrder, standingsDriverIds, random) {
  const order = [...new Set(baseOrder)].slice(0, 10);
  const replacements = standingsDriverIds.filter((driverId) => !order.includes(driverId)).slice(0, 8);
  const replacementCount = random() < 0.28 ? 2 : random() < 0.62 ? 1 : 0;

  for (let index = 0; index < replacementCount && replacements.length; index += 1) {
    const slot = 7 + Math.floor(random() * 3);
    const replacement = replacements.splice(Math.floor(random() * replacements.length), 1)[0];
    order[slot] = replacement;
  }

  const swaps = 2 + Math.floor(random() * 5);
  for (let index = 0; index < swaps; index += 1) {
    const left = Math.floor(random() * 9);
    [order[left], order[left + 1]] = [order[left + 1], order[left]];
  }

  return order;
}

async function seedLeagues(bots) {
  const leagues = [];
  let offset = 0;

  for (let index = 0; index < LEAGUE_NAMES.length; index += 1) {
    const members = bots.slice(offset, offset + LEAGUE_SIZES[index]);
    offset += LEAGUE_SIZES[index];
    const owner = members[0];
    const { data: league, error } = await supabase
      .from("prediction_leagues")
      .insert({
        invite_code: `BOT${String(index + 1).padStart(2, "0")}${randomBytes(3).toString("hex").toUpperCase()}`,
        is_public: true,
        name: LEAGUE_NAMES[index],
        owner_user_id: owner.id,
      })
      .select("id, name, invite_code")
      .single();
    throwIfError(error, `create league ${LEAGUE_NAMES[index]}`);

    const { error: memberError } = await supabase.from("prediction_league_members").insert(
      members.map((member) => ({
        league_id: league.id,
        role: member.id === owner.id ? "owner" : "member",
        user_id: member.id,
      })),
    );
    throwIfError(memberError, `fill league ${LEAGUE_NAMES[index]}`);

    leagues.push({
      id: league.id,
      inviteCode: league.invite_code,
      memberIds: members.map((member) => member.id),
      name: league.name,
      ownerUserId: owner.id,
    });
  }

  return leagues;
}

async function seedArticleReactions(bots) {
  const { data: articles, error: articleError } = await supabase
    .from("news_articles")
    .select("id")
    .eq("status", "processed")
    .eq("publication_status", "published")
    .is("duplicate_of", null)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(ARTICLE_LIMIT);
  throwIfError(articleError, "load articles for preview reactions");

  const articleIds = (articles ?? []).map((article) => article.id);
  const { data: existing, error: reactionError } = articleIds.length
    ? await supabase.from("article_reactions").select("article_id").in("article_id", articleIds)
    : { data: [], error: null };
  throwIfError(reactionError, "load existing reactions");
  const existingCounts = countBy(existing ?? [], (row) => row.article_id);
  const rows = [];

  for (const articleId of articleIds) {
    const random = mulberry32(hashSeed(`reaction:${articleId}`));
    const targetTotal = 2 + Math.floor(random() * 19);
    const required = Math.max(0, targetTotal - (existingCounts.get(articleId) ?? 0));
    const candidates = shuffle(
      bots.flatMap((bot) => REACTIONS.map((reaction) => ({ article_id: articleId, reaction, user_id: bot.id }))),
      random,
    );
    rows.push(...candidates.slice(0, required));
  }

  await insertInChunks("article_reactions", rows, 500);
  return { articleCount: articleIds.length, reactions: rows.length };
}

async function seedPollVotes(bots) {
  const { data: polls, error: pollError } = await supabase
    .from("polls")
    .select("id, poll_options(id, sort_order)")
    .in("status", ["published", "closed"])
    .order("created_at", { ascending: false });
  throwIfError(pollError, "load polls");

  const pollIds = (polls ?? []).map((poll) => poll.id);
  const { data: existing, error: voteError } = pollIds.length
    ? await supabase.from("poll_votes").select("poll_id").in("poll_id", pollIds)
    : { data: [], error: null };
  throwIfError(voteError, "load existing poll votes");
  const existingCounts = countBy(existing ?? [], (row) => row.poll_id);
  const rows = [];

  for (const poll of polls ?? []) {
    const options = [...(poll.poll_options ?? [])].sort((left, right) => left.sort_order - right.sort_order);
    if (!options.length) continue;
    const random = mulberry32(hashSeed(`poll:${poll.id}`));
    const targetTotal = 5 + Math.floor(random() * 11);
    const required = Math.max(0, targetTotal - (existingCounts.get(poll.id) ?? 0));
    const voters = shuffle([...bots], random).slice(0, required);

    voters.forEach((bot) => {
      const weightedIndex = Math.min(options.length - 1, Math.floor(Math.pow(random(), 1.45) * options.length));
      rows.push({ option_id: options[weightedIndex].id, poll_id: poll.id, user_id: bot.id });
    });
  }

  await insertInChunks("poll_votes", rows, 250);
  return { pollCount: polls?.length ?? 0, votes: rows.length };
}

async function insertInChunks(table, rows, chunkSize) {
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const { error } = await supabase.from(table).insert(rows.slice(offset, offset + chunkSize));
    throwIfError(error, `insert ${table}`);
  }
}

function resolveFastestPitStopTeam(report, teams, raceResults) {
  const teamName = report?.highlights?.fastestPitStop?.team;
  if (teamName) {
    const normalized = normalizeKey(teamName);
    const team = teams.find((candidate) => [candidate.name, candidate.code].some((value) => normalizeKey(value) === normalized));
    if (team) return team.id;
  }

  const fastestPit = Array.isArray(report?.pit_stops)
    ? report.pit_stops.filter((pit) => Number.isFinite(Number(pit?.duration))).sort((left, right) => Number(left.duration) - Number(right.duration))[0]
    : null;
  if (!fastestPit) return null;
  const reportResult = Array.isArray(report?.results)
    ? report.results.find((result) => normalizeKey(result?.driver) === normalizeKey(fastestPit.driver))
    : null;
  const team = teams.find((candidate) => [candidate.name, candidate.code].some((value) => normalizeKey(value) === normalizeKey(reportResult?.team)));
  if (team) return team.id;

  return raceResults.find((result) => result.driver_id && normalizeKey(reportResult?.driver).includes(normalizeKey(result.driver_id)))?.team_id ?? null;
}

function isNonFinishStatus(status) {
  const normalized = String(status ?? "").toLowerCase();
  return Boolean(normalized) && !normalized.includes("finished") && !normalized.includes("lap") && normalized !== "classified";
}

function normalizeKey(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "");
}

function countBy(rows, getKey) {
  const counts = new Map();
  for (const row of rows) {
    const key = getKey(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function groupBy(rows, getKey) {
  const groups = new Map();
  for (const row of rows) {
    const key = getKey(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return groups;
}

function pick(values, random) {
  return values.length ? values[Math.floor(random() * values.length)] : null;
}

function sampleUnique(values, count, random) {
  return shuffle([...values], random).slice(0, count);
}

function shuffle(values, random) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [values[index], values[target]] = [values[target], values[index]];
  }
  return values;
}

function hashSeed(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  return function random() {
    let value = seed += 0x6d2b79f5;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function throwIfError(error, context) {
  if (error) throw new Error(`${context}: ${error.message}`);
}
