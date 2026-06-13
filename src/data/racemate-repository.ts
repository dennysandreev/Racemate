import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";
import {
  adminJobs,
  adminSignals,
  calendarEvents,
  leagues,
  nextSession,
  polls,
  predictionPicks,
  standings,
  weekendSessions,
} from "@/data/racemate-overview";
import { getTeamAsset, getTeamMatchNames } from "@/data/f1-assets";
import type {
  AdminJob,
  AdminSignal,
  AdminSource,
  AiUsageSummary,
  CalendarEvent,
  ConstructorChampionOdds,
  ConstructorChampionshipMatrix,
  ConstructorStandingRow,
  DailyDigest,
  DriverChampionshipMatrix,
  LeagueSummary,
  NextSession,
  NewsItem,
  NewsListResult,
  PollSummary,
  PredictionState,
  RaceDetail,
  RaceWinnerOdds,
  SeasonChampionOdds,
  SessionResult,
  SessionWeather,
  StandingsMeta,
  StandingRow,
  TrackLayout,
  WeekendWeather,
  WeekendSession,
} from "@/types/racemate";

type SourceRelation = { name: string } | { name: string }[] | null;
type TagRelation =
  | {
      tags:
        | { name: string; slug: string | null; type?: string | null }
        | { name: string; slug: string | null; type?: string | null }[]
        | null;
    }
  | {
      tags:
        | { name: string; slug: string | null; type?: string | null }
        | { name: string; slug: string | null; type?: string | null }[]
        | null;
    }[];

type ArticleRow = {
  id: string;
  canonical_url: string;
  original_title: string;
  original_description: string | null;
  published_at: string | null;
  ai_title_ru: string | null;
  ai_summary_ru: string | null;
  ai_summary_long_ru: string | null;
  ai_key_points_ru: string[] | null;
  related_race_id: string | null;
  news_sources: SourceRelation;
  news_article_tags: TagRelation | null;
  races: { race_name: string; season_year: number; round: number } | null;
};

type RaceRow = {
  id: string;
  season_year: number;
  round: number;
  race_name: string;
  race_start_at: string | null;
  status: string;
  circuits:
    | { id?: string | null; name: string; country?: string | null; locality?: string | null; external_id?: string | null }
    | { id?: string | null; name: string; country?: string | null; locality?: string | null; external_id?: string | null }[]
    | null;
};

type TeamRelationObject = {
  name: string;
  code?: string | null;
  color_hex?: string | null;
};

type StandingDbRow = {
  driver_id?: string;
  team_id?: string | null;
  round?: number | null;
  position: number | null;
  points: number | string;
  wins?: number | null;
  drivers: { full_name: string } | { full_name: string }[] | null;
  teams: TeamRelationObject | TeamRelationObject[] | null;
};

type ConstructorStandingDbRow = {
  team_id?: string | null;
  round?: number | null;
  position: number | null;
  points: number | string;
  wins: number | null;
  teams: TeamRelationObject | TeamRelationObject[] | null;
};

type SessionDbRow = {
  id: string;
  session_type: string;
  name: string;
  start_at: string | null;
  status: string;
};

type SessionResultDbRow = {
  position: number | null;
  time_text: string | null;
  status: string | null;
  grid: number | null;
  laps: number | null;
  points: number | string | null;
  drivers: { full_name: string } | { full_name: string }[] | null;
  teams: TeamRelationObject | TeamRelationObject[] | null;
};

type RaceWinnerDbRow = {
  drivers: { full_name: string } | { full_name: string }[] | null;
  sessions:
    | { race_id: string; session_type: string }
    | { race_id: string; session_type: string }[]
    | null;
};

type DigestDbRow = {
  id: string;
  title: string;
  body_md: string;
  generated_at: string;
  status: string;
};

type WeatherDbRow = {
  temperature_c: number | string | null;
  wind_speed_kmh: number | string | null;
  precipitation_mm: number | string | null;
  observed_at: string | null;
};

type SessionWeatherDbRow = WeatherDbRow & {
  session_id: string;
  forecast_at: string | null;
};

type CircuitLayoutDbRow = {
  svg_path: string;
  view_box: string;
  provider: string;
  source_session_key: number | null;
};

type StandingRoundRow = {
  season_year: number;
  round: number | null;
};

type RaceRoundVisualDbRow = {
  round: number;
  race_name: string;
  circuits:
    | { country?: string | null }
    | { country?: string | null }[]
    | null;
};

type JobDbRow = {
  job_name: string;
  status: string;
  items_processed: number;
  finished_at: string | null;
  started_at: string;
};

type SourceDbRow = {
  id: string;
  name: string;
  url: string;
  is_active: boolean;
  last_success_at: string | null;
  last_error: string | null;
};

type DriverOptionRow = {
  id: string;
  full_name: string;
  teams: { name: string } | { name: string }[] | null;
};

type DriverNameRow = {
  full_name: string;
  last_name: string;
};

type TeamNameRow = {
  name: string;
  short_name: string | null;
  code: string | null;
};

type PolymarketOutcomeKind = "race-winner" | "driver-champion" | "constructor-champion";

type PredictionDbRow = {
  pole_driver_id: string | null;
  winner_driver_id: string | null;
  fastest_lap_driver_id: string | null;
  dnf_driver_id: string | null;
  score: number | null;
};

type LeagueDbRow = {
  id: string;
  name: string;
  invite_code: string;
  prediction_league_members: { user_id: string }[] | null;
  profiles:
    | { display_name: string | null; email: string | null }
    | { display_name: string | null; email: string | null }[]
    | null;
};

type PollDbRow = {
  id: string;
  question: string;
  poll_options:
    | { id: string; label: string; poll_votes: { user_id: string }[] | null }[]
    | null;
  poll_votes: { option_id: string; user_id: string }[] | null;
};

type PolymarketMarket = {
  id?: string | number;
  question?: string;
  title?: string;
  slug?: string;
  groupItemTitle?: string;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  outcomes?: string[] | string;
  outcomePrices?: string[] | string;
  volumeNum?: number;
  volume?: number | string;
  volume24hr?: number | string;
  liquidityNum?: number;
  updatedAt?: string;
  events?: { title?: string; slug?: string }[];
};

type PolymarketEvent = {
  id?: string | number;
  title?: string;
  slug?: string;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  startDate?: string;
  endDate?: string;
  updatedAt?: string;
  volume?: number | string;
  volume24hr?: number | string;
  liquidity?: number | string;
  markets?: PolymarketMarket[];
};

const POLYMARKET_F1_TAG_ID = "435";

const NEWS_ARTICLE_SELECT =
  "id, canonical_url, original_title, original_description, published_at, ai_title_ru, ai_summary_ru, ai_summary_long_ru, ai_key_points_ru, related_race_id, news_sources(name), news_article_tags(tags(name, slug, type)), races:related_race_id(race_name, season_year, round)";

type NewsItemsOptions = {
  page?: number;
  pageSize?: number;
  tagSlug?: string;
  race?: string;
};

export async function getNewsItems(
  input: number | NewsItemsOptions = {},
): Promise<NewsListResult> {
  const supabase = await createSupabaseServerClient();
  const options = typeof input === "number" ? { pageSize: input } : input;
  const pageSize = Math.max(1, Math.min(options.pageSize ?? 20, 50));
  const page = Math.max(1, options.page ?? 1);

  if (!supabase) {
    return emptyNewsList(page);
  }

  let articleIds: string[] | null = null;

  if (options.tagSlug) {
    const { data: tag } = await supabase
      .from("tags")
      .select("id")
      .eq("slug", options.tagSlug)
      .maybeSingle();

    if (!tag?.id) {
      return emptyNewsList(page);
    }

    const { data: taggedArticles } = await supabase
      .from("news_article_tags")
      .select("article_id")
      .eq("tag_id", tag.id);

    articleIds = [...new Set((taggedArticles ?? []).map((row) => row.article_id))];

    if (!articleIds.length) {
      return emptyNewsList(page);
    }
  }

  let raceId: string | null = null;

  if (options.race) {
    const parsedRace = parseRaceFilter(options.race);

    if (!parsedRace) {
      return emptyNewsList(page);
    }

    const { data: race } = await supabase
      .from("races")
      .select("id")
      .eq("season_year", parsedRace.season)
      .eq("round", parsedRace.round)
      .maybeSingle();

    if (!race?.id) {
      return emptyNewsList(page);
    }

    raceId = race.id;
  }

  let query = supabase
    .from("news_articles")
    .select(NEWS_ARTICLE_SELECT, { count: "exact" })
    .eq("status", "processed")
    .is("duplicate_of", null)
    .order("published_at", { ascending: false, nullsFirst: false });

  if (articleIds) {
    query = query.in("id", articleIds);
  }

  if (raceId) {
    query = query.eq("related_race_id", raceId);
  }

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.range(from, from + pageSize - 1);

  if (error) {
    return emptyNewsList(page);
  }

  const totalCount = count ?? data?.length ?? 0;

  return {
    items: ((data ?? []) as unknown as ArticleRow[]).map(mapArticleRow),
    page,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    totalCount,
  };
}

export async function getNextSession(): Promise<NextSession> {
  const race = await getCurrentRace();
  const sessions = race ? await getWeekendSessions(race.id) : await getWeekendSessions();
  const first =
    sessions.find((session) => session.status === "Ожидается") ??
    sessions.find((session) => session.status !== "Завершена") ??
    sessions[0];

  if (!first) {
    return nextSession;
  }

  return {
    ...nextSession,
    race: race?.race_name ?? nextSession.race,
    circuit: getRelationName(race?.circuits ?? null, nextSession.circuit),
    session: first.name,
    startsAt: first.startsAt,
    status: first.status === "Ожидается" ? nextSession.status : first.status,
  };
}

export async function getCalendarEvents(): Promise<CalendarEvent[]> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return calendarEvents;
  }

  const { data, error } = await supabase
    .from("races")
    .select("id, season_year, round, race_name, race_start_at, status, circuits(id, name, country, locality, external_id)")
    .order("season_year", { ascending: false })
    .order("round", { ascending: true });

  if (error || !data?.length) {
    return calendarEvents;
  }

  const races = data as unknown as RaceRow[];
  const [currentRace, winners] = await Promise.all([
    getCurrentRace("id, season_year, round, race_name, race_start_at, status"),
    getRaceWinners(races.map((race) => race.id)),
  ]);

  return races.map((race) =>
    mapCalendarRace(race, race.id === currentRace?.id, winners.get(race.id)),
  );
}

export async function getWeekendSessions(raceId?: string): Promise<WeekendSession[]> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return weekendSessions;
  }

  const race = raceId ? null : await getCurrentRace();
  const selectedRaceId = raceId ?? race?.id;

  if (!selectedRaceId) {
    return weekendSessions;
  }

  const { data, error } = await supabase
    .from("sessions")
    .select("id, session_type, name, start_at, status")
    .eq("race_id", selectedRaceId)
    .order("start_at", { ascending: true, nullsFirst: false })
    .limit(10);

  if (error || !data?.length) {
    return weekendSessions;
  }

  const sessions = (data as SessionDbRow[]).map((session) => ({
    id: session.id,
    type: session.session_type,
    name: session.name,
    startsAt: formatDateTime(session.start_at),
    status: mapSessionStatus(session.status),
  }));
  const weatherBySession = await getSessionWeatherByIds(
    sessions.map((session) => session.id).filter(Boolean) as string[],
  );

  return sessions.map((session) => ({
    ...session,
    weather: session.id ? weatherBySession.get(session.id) : undefined,
  }));
}

export async function getWeekendWeather(): Promise<WeekendWeather> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return emptyWeather();
  }

  const race = await getCurrentRace();

  if (!race) {
    return emptyWeather();
  }

  const { data, error } = await supabase
    .from("circuit_weather")
    .select("temperature_c, wind_speed_kmh, precipitation_mm, observed_at")
    .eq("race_id", race.id)
    .order("observed_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return emptyWeather();
  }

  const weather = data as WeatherDbRow;

  return mapWeatherRow(weather, "Open-Meteo");
}

export async function getDriverStandings(): Promise<StandingRow[]> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return standings;
  }

  const latest = await getLatestCompleteStandingRound("driver_standings", 20);

  if (!latest) {
    return standings;
  }

  let standingsQuery = supabase
    .from("driver_standings")
    .select("position, points, drivers(full_name), teams(name, code, color_hex)")
    .eq("season_year", latest.season_year)
    .order("position", { ascending: true, nullsFirst: false })
    .limit(40);

  standingsQuery =
    latest.round === null ? standingsQuery.is("round", null) : standingsQuery.eq("round", latest.round);

  const { data, error } = await standingsQuery;

  if (error || !data?.length) {
    return standings;
  }

  return (data as unknown as StandingDbRow[]).map((row, index) => ({
    ...getTeamVisualFields(row.teams, "Команда уточняется"),
    position: row.position ?? index + 1,
    driver: getRelationName(row.drivers, "Пилот уточняется"),
    points: Number(row.points),
  }));
}

export async function getDriverChampionshipMatrix(): Promise<DriverChampionshipMatrix> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return {
      rounds: [],
      rows: standings.map((row) => ({
        ...getTeamVisualFields({ name: row.team }, row.team),
        position: row.position,
        driver: row.driver,
        total: row.points,
        pointsByRound: {},
      })),
    };
  }

  const latest = await getLatestCompleteStandingRound("driver_standings", 20);

  if (!latest?.round) {
    const rows = await getDriverStandings();

    return {
      rounds: [],
      rows: rows.map((row) => ({
        position: row.position,
        driver: row.driver,
        team: row.team,
        teamCode: row.teamCode,
        teamLogo: row.teamLogo,
        teamColor: row.teamColor,
        total: row.points,
        pointsByRound: {},
      })),
    };
  }

  const latestRound = latest.round;

  const { data, error } = await supabase
    .from("driver_standings")
    .select("driver_id, team_id, round, position, points, drivers(full_name), teams(name, code, color_hex)")
    .eq("season_year", latest.season_year)
    .lte("round", latestRound)
    .order("round", { ascending: true })
    .order("position", { ascending: true, nullsFirst: false });

  if (error || !data?.length) {
    return { rounds: [], rows: [] };
  }

  const rowsByDriver = new Map<
    string,
    {
      driver: string;
      team: string;
      teamCode?: string;
      teamLogo?: string;
      teamColor?: string;
      latestPosition: number;
      total: number;
      cumulative: Map<number, number>;
    }
  >();

  (data as unknown as StandingDbRow[]).forEach((row) => {
    if (!row.driver_id || !row.round) {
      return;
    }

    const teamVisual = getTeamVisualFields(row.teams, "Команда уточняется");
    const existing = rowsByDriver.get(row.driver_id) ?? {
      driver: getRelationName(row.drivers, "Пилот уточняется"),
      team: teamVisual.team,
      teamCode: teamVisual.teamCode,
      teamLogo: teamVisual.teamLogo,
      teamColor: teamVisual.teamColor,
      latestPosition: row.position ?? 999,
      total: Number(row.points),
      cumulative: new Map<number, number>(),
    };

    existing.cumulative.set(row.round, Number(row.points));

    if (row.round === latestRound) {
      existing.latestPosition = row.position ?? existing.latestPosition;
      existing.total = Number(row.points);
      existing.team = teamVisual.team;
      existing.teamCode = teamVisual.teamCode;
      existing.teamLogo = teamVisual.teamLogo;
      existing.teamColor = teamVisual.teamColor;
    }

    rowsByDriver.set(row.driver_id, existing);
  });

  const rounds = await getRaceRoundVisuals(latest.season_year, latestRound);
  const roundNumbers = rounds.map((round) => round.round);
  const rows = [...rowsByDriver.values()]
    .filter((row) => row.cumulative.has(latestRound))
    .sort((a, b) => a.latestPosition - b.latestPosition)
    .map((row) => {
      const pointsByRound: Record<number, number> = {};
      let previous = 0;

      roundNumbers.forEach((round) => {
        const current = row.cumulative.get(round) ?? previous;
        pointsByRound[round] = Math.max(0, current - previous);
        previous = current;
      });

      return {
        position: row.latestPosition,
        driver: row.driver,
        team: row.team,
        teamCode: row.teamCode,
        teamLogo: row.teamLogo,
        teamColor: row.teamColor,
        total: row.total,
        pointsByRound,
      };
    });

  return { rounds, rows };
}

export async function getConstructorStandings(): Promise<ConstructorStandingRow[]> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return [];
  }

  const latest = await getLatestCompleteStandingRound("constructor_standings", 10);

  if (!latest) {
    return [];
  }

  let standingsQuery = supabase
    .from("constructor_standings")
    .select("position, points, wins, teams(name, code, color_hex)")
    .eq("season_year", latest.season_year)
    .order("position", { ascending: true, nullsFirst: false })
    .limit(20);

  standingsQuery =
    latest.round === null ? standingsQuery.is("round", null) : standingsQuery.eq("round", latest.round);

  const { data, error } = await standingsQuery;

  if (error || !data?.length) {
    return [];
  }

  return (data as unknown as ConstructorStandingDbRow[]).map((row, index) => ({
    ...getTeamVisualFields(row.teams, "Команда уточняется"),
    position: row.position ?? index + 1,
    points: Number(row.points),
    wins: row.wins ?? 0,
  }));
}

export async function getConstructorChampionshipMatrix(): Promise<ConstructorChampionshipMatrix> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return { rounds: [], rows: [] };
  }

  const latest = await getLatestCompleteStandingRound("constructor_standings", 10);

  if (!latest?.round) {
    const rows = await getConstructorStandings();

    return { rounds: [], rows };
  }

  const latestRound = latest.round;

  const { data, error } = await supabase
    .from("constructor_standings")
    .select("team_id, round, position, points, wins, teams(name, code, color_hex)")
    .eq("season_year", latest.season_year)
    .lte("round", latestRound)
    .order("round", { ascending: true })
    .order("position", { ascending: true, nullsFirst: false });

  if (error || !data?.length) {
    return { rounds: [], rows: [] };
  }

  const rowsByTeam = new Map<
    string,
    {
      team: string;
      teamCode?: string;
      teamLogo?: string;
      teamColor?: string;
      latestPosition: number;
      total: number;
      wins: number;
      cumulative: Map<number, number>;
    }
  >();

  (data as unknown as ConstructorStandingDbRow[]).forEach((row) => {
    if (!row.team_id || !row.round) {
      return;
    }

    const teamVisual = getTeamVisualFields(row.teams, "Команда уточняется");
    const existing = rowsByTeam.get(row.team_id) ?? {
      team: teamVisual.team,
      teamCode: teamVisual.teamCode,
      teamLogo: teamVisual.teamLogo,
      teamColor: teamVisual.teamColor,
      latestPosition: row.position ?? 999,
      total: Number(row.points),
      wins: row.wins ?? 0,
      cumulative: new Map<number, number>(),
    };

    existing.cumulative.set(row.round, Number(row.points));

    if (row.round === latestRound) {
      existing.latestPosition = row.position ?? existing.latestPosition;
      existing.total = Number(row.points);
      existing.wins = row.wins ?? existing.wins;
      existing.team = teamVisual.team;
      existing.teamCode = teamVisual.teamCode;
      existing.teamLogo = teamVisual.teamLogo;
      existing.teamColor = teamVisual.teamColor;
    }

    rowsByTeam.set(row.team_id, existing);
  });

  const rounds = await getRaceRoundVisuals(latest.season_year, latestRound);
  const roundNumbers = rounds.map((round) => round.round);
  const rows = [...rowsByTeam.values()]
    .filter((row) => row.cumulative.has(latestRound))
    .sort((a, b) => a.latestPosition - b.latestPosition)
    .map((row) => {
      const pointsByRound: Record<number, number> = {};
      let previous = 0;

      roundNumbers.forEach((round) => {
        const current = row.cumulative.get(round) ?? previous;
        pointsByRound[round] = Math.max(0, current - previous);
        previous = current;
      });

      return {
        position: row.latestPosition,
        team: row.team,
        teamCode: row.teamCode,
        teamLogo: row.teamLogo,
        teamColor: row.teamColor,
        points: row.total,
        wins: row.wins,
        pointsByRound,
      };
    });

  return { rounds, rows };
}

export async function getStandingsMeta(
  type: "driver_standings" | "constructor_standings",
): Promise<StandingsMeta | null> {
  const latest = await getLatestCompleteStandingRound(
    type,
    type === "driver_standings" ? 20 : 10,
  );

  if (!latest) {
    return null;
  }

  return {
    season: latest.season_year,
    round: latest.round,
    label: latest.round === null ? `Сезон ${latest.season_year}` : `Сезон ${latest.season_year}, раунд ${latest.round}`,
  };
}

export async function getRaceRoundVisuals(season: number, latestRound: number) {
  const supabase = await createSupabaseServerClient();

  if (!supabase || latestRound <= 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("races")
    .select("round, race_name, circuits(country)")
    .eq("season_year", season)
    .lte("round", latestRound)
    .order("round", { ascending: true });

  if (error || !data?.length) {
    return Array.from({ length: latestRound }, (_, index) => ({
      round: index + 1,
      flag: "🏁",
      raceName: `Раунд ${index + 1}`,
    }));
  }

  return (data as unknown as RaceRoundVisualDbRow[]).map((race) => {
    const circuit = getRelationObject(race.circuits);
    const country = circuit?.country ?? "";

    return {
      round: race.round,
      flag: getCountryFlag(country),
      raceName: race.race_name,
    };
  });
}

export async function getPredictionPicks() {
  return predictionPicks;
}

export async function getPredictionState(
  userId?: string | null,
): Promise<PredictionState> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return { race: null, drivers: [], current: null };
  }

  const [currentRace, driversResult] = await Promise.all([
    getCurrentRace("id, race_name, race_start_at"),
    supabase
      .from("drivers")
      .select("id, full_name, teams:current_team_id(name)")
      .eq("is_active", true)
      .order("full_name"),
  ]);

  const race = currentRace
    ? {
        id: currentRace.id,
        name: currentRace.race_name,
        startsAt: formatDateTime(currentRace.race_start_at),
      }
    : null;

  let current: PredictionState["current"] = null;

  if (race && userId) {
    const { data } = await supabase
      .from("predictions")
      .select(
        "pole_driver_id, winner_driver_id, fastest_lap_driver_id, dnf_driver_id, score",
      )
      .eq("user_id", userId)
      .eq("race_id", race.id)
      .is("league_id", null)
      .maybeSingle();

    if (data) {
      const prediction = data as PredictionDbRow;
      current = {
        poleDriverId: prediction.pole_driver_id,
        winnerDriverId: prediction.winner_driver_id,
        fastestLapDriverId: prediction.fastest_lap_driver_id,
        dnfDriverId: prediction.dnf_driver_id,
        score: prediction.score,
      };
    }
  }

  return {
    race,
    drivers: ((driversResult.data ?? []) as unknown as DriverOptionRow[]).map((driver) => ({
      id: driver.id,
      name: driver.full_name,
      team: getRelationName(driver.teams, "Команда уточняется"),
    })),
    current,
  };
}

export async function getAdminSignals(): Promise<AdminSignal[]> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return adminSignals;
  }

  const [sources, pendingArticles, latestJob] = await Promise.all([
    supabase.from("news_sources").select("id", { count: "exact", head: true }),
    supabase
      .from("news_articles")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("job_runs")
      .select("job_name, status, finished_at, started_at")
      .order("started_at", { ascending: false })
      .limit(1),
  ]);

  if (sources.error || pendingArticles.error || latestJob.error) {
    return adminSignals;
  }

  const latest = latestJob.data?.[0] as
    | Pick<JobDbRow, "job_name" | "status" | "finished_at" | "started_at">
    | undefined;

  return [
    {
      label: "RSS источники",
      value: String(sources.count ?? 0),
      status: "Подключены в БД",
    },
    {
      label: "AI очередь",
      value: String(pendingArticles.count ?? 0),
      status: "Ожидают обработки",
    },
    {
      label: "Последняя задача",
      value: latest ? formatRelativeTime(latest.finished_at ?? latest.started_at) : "Нет",
      status: latest?.job_name ?? "Запусков пока не было",
    },
  ];
}

export async function getAdminJobs(): Promise<AdminJob[]> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return adminJobs;
  }

  const { data, error } = await supabase
    .from("job_runs")
    .select("job_name, status, items_processed, finished_at, started_at")
    .order("started_at", { ascending: false })
    .limit(8);

  if (error || !data?.length) {
    return adminJobs;
  }

  return (data as JobDbRow[]).map((job) => ({
    name: job.job_name,
    status: mapJobStatus(job.status),
    processed: job.items_processed,
    finishedAt: formatRelativeTime(job.finished_at ?? job.started_at),
  }));
}

export async function getAdminSources(): Promise<AdminSource[]> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("news_sources")
    .select("id, name, url, is_active, last_success_at, last_error")
    .order("name");

  if (error || !data) {
    return [];
  }

  return (data as SourceDbRow[]).map((source) => ({
    id: source.id,
    name: source.name,
    url: source.url,
    isActive: source.is_active,
    lastStatus: source.last_error
      ? "Есть ошибка"
      : source.last_success_at
        ? formatRelativeTime(source.last_success_at)
        : "Еще не запускался",
  }));
}

export async function getAiUsageSummary(): Promise<AiUsageSummary> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return { totalRuns: 0, estimatedCostUsd: 0, lastModel: "Нет данных" };
  }

  const { data, count, error } = await supabase
    .from("ai_usage_logs")
    .select("model, estimated_cost_usd", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !data) {
    return { totalRuns: 0, estimatedCostUsd: 0, lastModel: "Нет данных" };
  }

  return {
    totalRuns: count ?? data.length,
    estimatedCostUsd: data.reduce(
      (sum, row) => sum + Number(row.estimated_cost_usd ?? 0),
      0,
    ),
    lastModel: data[0]?.model ?? "Нет данных",
  };
}

export async function getLeagues(): Promise<LeagueSummary[]> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return leagues;
  }

  const { data, error } = await supabase
    .from("prediction_leagues")
    .select(
      "id, name, invite_code, prediction_league_members(user_id), profiles:owner_user_id(display_name, email)",
    )
    .order("created_at", { ascending: false })
    .limit(20);

  if (error || !data?.length) {
    return leagues;
  }

  return (data as unknown as LeagueDbRow[]).map((league) => ({
    id: league.id,
    name: league.name,
    members: league.prediction_league_members?.length ?? 1,
    leader: getProfileName(league.profiles),
    score: 0,
    inviteCode: league.invite_code,
  }));
}

export async function getPolls(): Promise<PollSummary[]> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return polls;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("polls")
    .select(
      "id, question, poll_options(id, label, poll_votes(user_id)), poll_votes(option_id, user_id)",
    )
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error || !data?.length) {
    return polls;
  }

  const admin = createSupabaseAdminClient();
  const optionIds = (data as unknown as PollDbRow[]).flatMap((poll) =>
    (poll.poll_options ?? []).map((option) => option.id),
  );
  const voteCounts = new Map<string, number>();

  if (admin && optionIds.length) {
    const { data: votes } = await admin
      .from("poll_votes")
      .select("option_id")
      .in("option_id", optionIds);

    votes?.forEach((vote) => {
      voteCounts.set(vote.option_id, (voteCounts.get(vote.option_id) ?? 0) + 1);
    });
  }

  return (data as unknown as PollDbRow[]).map((poll) => {
    const options = poll.poll_options ?? [];
    const userVote = poll.poll_votes?.find((vote) => vote.user_id === user?.id)?.option_id;

    return {
      id: poll.id,
      question: poll.question,
      votes: options.reduce((sum, option) => sum + (voteCounts.get(option.id) ?? 0), 0),
      options: options.map((option) => ({
        id: option.id,
        label: option.label,
        votes: voteCounts.get(option.id) ?? 0,
      })),
      userVote,
    };
  });
}

export async function getRaceDetail(
  season: number,
  round: number,
): Promise<RaceDetail | null> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("races")
    .select("id, season_year, round, race_name, race_start_at, status, circuits(id, name, country, locality, external_id)")
    .eq("season_year", season)
    .eq("round", round)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const race = data as unknown as RaceRow;
  const circuit = getRelationObject(race.circuits);
  const layout = circuit?.id ? await getCircuitLayout(circuit.id) : null;

  return {
    id: race.id,
    season: race.season_year,
    round: race.round,
    race: race.race_name,
    circuit: circuit?.name ?? "Трасса уточняется",
    circuitId: circuit?.id ?? null,
    country: circuit?.country ?? "Страна уточняется",
    countryFlag: getCountryFlag(circuit?.country ?? ""),
    locality: circuit?.locality ?? "Город уточняется",
    startsAt: formatDateTime(race.race_start_at),
    status: mapRaceStatus(race.status, race.race_start_at, 0),
    layout,
  };
}

export async function getCurrentRaceDetail(): Promise<RaceDetail | null> {
  const race = await getCurrentRace();

  if (!race) {
    return null;
  }

  return getRaceDetail(race.season_year, race.round);
}

export async function getRaceWinnerOdds(race: RaceDetail | null): Promise<RaceWinnerOdds | null> {
  if (!race) {
    return null;
  }

  const driverNames = await getActiveDriverNames();
  const events = await fetchPolymarketRaceEvents();
  const scoredEvents = events
    .map((event) => ({
      event,
      outcomes: parsePolymarketEventOutcomes(event, driverNames, "race-winner"),
      score: scorePolymarketEvent(event, race),
    }))
    .filter((entry) => entry.score >= 9 && entry.outcomes.length >= 2)
    .sort(
      (a, b) =>
        b.score - a.score ||
        getEventVolume(b.event) - getEventVolume(a.event) ||
        b.outcomes[0].probability - a.outcomes[0].probability,
    );
  const selected = scoredEvents[0];

  if (!selected) {
    return null;
  }

  return {
    marketTitle: selected.event.title ?? `${race.race}: победитель`,
    marketUrl: getPolymarketEventUrl(selected.event),
    source: "Polymarket",
    updatedAt: formatRelativeTime(getPolymarketUpdatedAt(selected.event)),
    outcomes: selected.outcomes.slice(0, 6),
  };
}

export async function getSeasonChampionOdds(): Promise<SeasonChampionOdds | null> {
  const driverNames = await getActiveDriverNames();
  const events = await fetchPolymarketRaceEvents();
  const selected = events
    .filter((event) => event.active && !event.closed && !event.archived)
    .map((event) => ({
      event,
      outcomes: parsePolymarketEventOutcomes(event, driverNames, "driver-champion"),
      score: scoreSeasonChampionEvent(event),
    }))
    .filter((entry) => entry.score >= 8 && entry.outcomes.length >= 2)
    .sort(
      (a, b) =>
        b.score - a.score ||
        getEventVolume(b.event) - getEventVolume(a.event) ||
        b.outcomes[0].probability - a.outcomes[0].probability,
    )[0];

  if (!selected) {
    return null;
  }

  return {
    marketTitle: selected.event.title ?? "F1 Drivers' Champion",
    marketUrl: getPolymarketEventUrl(selected.event),
    source: "Polymarket",
    updatedAt: formatRelativeTime(getPolymarketUpdatedAt(selected.event)),
    outcomes: selected.outcomes.slice(0, 6),
  };
}

export async function getConstructorChampionOdds(): Promise<ConstructorChampionOdds | null> {
  const teamNames = await getActiveTeamNames();
  const events = await fetchPolymarketRaceEvents();
  const selected = events
    .filter((event) => event.active && !event.closed && !event.archived)
    .map((event) => ({
      event,
      outcomes: parsePolymarketEventOutcomes(event, teamNames, "constructor-champion"),
      score: scoreConstructorChampionEvent(event),
    }))
    .filter((entry) => entry.score >= 8 && entry.outcomes.length >= 2)
    .sort(
      (a, b) =>
        b.score - a.score ||
        getEventVolume(b.event) - getEventVolume(a.event) ||
        b.outcomes[0].probability - a.outcomes[0].probability,
    )[0];

  if (!selected) {
    return null;
  }

  return {
    marketTitle: selected.event.title ?? "F1 Constructors' Champion",
    marketUrl: getPolymarketEventUrl(selected.event),
    source: "Polymarket",
    updatedAt: formatRelativeTime(getPolymarketUpdatedAt(selected.event)),
    outcomes: selected.outcomes.slice(0, 6),
  };
}

export async function getRaceSessions(
  season: number,
  round: number,
): Promise<WeekendSession[]> {
  const race = await getRaceDetail(season, round);

  if (!race) {
    return [];
  }

  const sessions = await getWeekendSessions(race.id);

  return sessions.map((session) => ({
    ...session,
    href: `/calendar/${season}/${round}?session=${session.id}`,
  }));
}

export async function getSessionResults(sessionId?: string | null): Promise<SessionResult[]> {
  if (!sessionId) {
    return [];
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("session_results")
    .select("position, time_text, status, grid, laps, points, drivers(full_name), teams(name, code, color_hex)")
    .eq("session_id", sessionId)
    .order("position", { ascending: true, nullsFirst: false });

  if (error || !data?.length) {
    return [];
  }

  return (data as unknown as SessionResultDbRow[]).map((row) => ({
    ...getTeamVisualFields(row.teams, "Команда уточняется"),
    position: row.position,
    driver: getRelationName(row.drivers, "Пилот уточняется"),
    time: row.time_text ?? "Без времени",
    status: row.status ?? "Классифицирован",
    grid: row.grid,
    laps: row.laps,
    points: row.points === null ? null : Number(row.points),
  }));
}

export async function getRaceNews(raceId: string, limit = 5): Promise<NewsItem[]> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("news_articles")
    .select(NEWS_ARTICLE_SELECT)
    .eq("status", "processed")
    .eq("related_race_id", raceId)
    .is("duplicate_of", null)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error || !data?.length) {
    return [];
  }

  return (data as unknown as ArticleRow[]).map(mapArticleRow);
}

export async function getLatestDailyDigest(): Promise<DailyDigest | null> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("digests")
    .select("id, title, body_md, generated_at, status")
    .eq("digest_type", "daily_news")
    .eq("status", "published")
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const digest = data as DigestDbRow;

  return {
    id: digest.id,
    title: digest.title,
    body: digest.body_md,
    generatedAt: formatRelativeTime(digest.generated_at),
    status: digest.status,
  };
}

export async function getNewsArticle(id: string) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("news_articles")
    .select(NEWS_ARTICLE_SELECT)
    .eq("id", id)
    .eq("status", "processed")
    .is("duplicate_of", null)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapArticleRow(data as unknown as ArticleRow);
}

export async function getArticleReactionCounts(articleId: string) {
  const admin = createSupabaseAdminClient();

  if (!admin) {
    return { "🔥": 0, "🏁": 0, "👀": 0 };
  }

  const { data } = await admin
    .from("article_reactions")
    .select("reaction")
    .eq("article_id", articleId);

  return (data ?? []).reduce<Record<string, number>>(
    (counts, row) => {
      counts[row.reaction] = (counts[row.reaction] ?? 0) + 1;
      return counts;
    },
    { "🔥": 0, "🏁": 0, "👀": 0 },
  );
}

function mapArticleRow(row: ArticleRow): NewsItem {
  const title = row.ai_title_ru ?? row.original_title;
  const summary =
    row.ai_summary_ru ??
    row.original_description ??
    "Короткое саммари появится после обработки новости.";
  const race = row.races;
  const raceTag = race ? `${race.race_name}, ${race.season_year}` : undefined;
  const tags = getArticleTags(row.news_article_tags);
  const raceTagSlug = tags.find((tag) => tag.type === "race")?.slug;
  const raceFilter = race ? `${race.season_year}-${race.round}` : undefined;

  return {
    slug: row.id,
    href: row.canonical_url,
    source: getRelationName(row.news_sources, "Источник"),
    title,
    summary,
    details: row.ai_summary_long_ru ?? summary,
    keyPoints: row.ai_key_points_ru ?? [],
    tags,
    raceTag,
    raceTagSlug,
    raceFilter,
    time: formatRelativeTime(row.published_at),
  };
}

async function getCircuitLayout(circuitId: string): Promise<TrackLayout | null> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("circuit_layouts")
    .select("svg_path, view_box, provider, source_session_key")
    .eq("circuit_id", circuitId)
    .eq("provider", "openf1")
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const layout = data as CircuitLayoutDbRow;

  return {
    svgPath: layout.svg_path,
    viewBox: layout.view_box,
    provider: layout.provider,
    sourceSessionKey: layout.source_session_key,
  };
}

async function getSessionWeatherByIds(sessionIds: string[]) {
  const weatherBySession = new Map<string, SessionWeather>();

  if (!sessionIds.length) {
    return weatherBySession;
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return weatherBySession;
  }

  const { data, error } = await supabase
    .from("session_weather")
    .select("session_id, temperature_c, wind_speed_kmh, precipitation_mm, observed_at:forecast_at, forecast_at")
    .in("session_id", sessionIds);

  if (error || !data) {
    return weatherBySession;
  }

  (data as unknown as SessionWeatherDbRow[]).forEach((weather) => {
    weatherBySession.set(weather.session_id, mapWeatherRow(weather, "Open-Meteo"));
  });

  return weatherBySession;
}

async function getLatestCompleteStandingRound(
  table: "driver_standings" | "constructor_standings",
  minimumRows: number,
): Promise<StandingRoundRow | null> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from(table)
    .select("season_year, round")
    .order("season_year", { ascending: false })
    .order("round", { ascending: false, nullsFirst: false })
    .limit(500);

  if (error || !data?.length) {
    return null;
  }

  const rounds = new Map<string, StandingRoundRow & { count: number }>();

  (data as StandingRoundRow[]).forEach((row) => {
    const key = `${row.season_year}:${row.round ?? "season"}`;
    const existing = rounds.get(key);

    if (existing) {
      existing.count += 1;
      return;
    }

    rounds.set(key, { ...row, count: 1 });
  });

  const ordered = [...rounds.values()].sort((a, b) => {
    if (a.season_year !== b.season_year) {
      return b.season_year - a.season_year;
    }

    return (b.round ?? -1) - (a.round ?? -1);
  });

  return ordered.find((round) => round.count >= minimumRows) ?? ordered[0] ?? null;
}

function emptyNewsList(page = 1): NewsListResult {
  return {
    items: [],
    page,
    totalPages: 1,
    totalCount: 0,
  };
}

async function getActiveDriverNames() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return new Set<string>();
  }

  const { data } = await supabase
    .from("drivers")
    .select("full_name, last_name")
    .eq("is_active", true);

  const names = new Set<string>();

  (data as DriverNameRow[] | null)?.forEach((driver) => {
    names.add(normalizeText(driver.full_name));
    names.add(normalizeText(driver.last_name));
  });

  return names;
}

async function getActiveTeamNames() {
  const names = new Set(getTeamMatchNames().map(normalizeText));
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return names;
  }

  const { data } = await supabase
    .from("teams")
    .select("name, short_name, code")
    .eq("is_active", true);

  (data as TeamNameRow[] | null)?.forEach((team) => {
    names.add(normalizeText(team.name));

    if (team.short_name) {
      names.add(normalizeText(team.short_name));
    }

    if (team.code) {
      names.add(normalizeText(team.code));
    }

    const asset = getTeamAsset(team.code ?? team.name);

    if (asset?.name) {
      names.add(normalizeText(asset.name));
    }

    if (asset?.code) {
      names.add(normalizeText(asset.code));
    }
  });

  return names;
}

async function fetchPolymarketRaceEvents() {
  const responses = await Promise.all([
    fetchPolymarketEvents({
      tag_id: POLYMARKET_F1_TAG_ID,
      related_tags: "true",
      active: "true",
      closed: "false",
      limit: "100",
      order: "volume_24hr",
      ascending: "false",
    }),
  ]);
  const eventsById = new Map<string, PolymarketEvent>();

  responses.flat().forEach((event) => {
    const key = String(event.id ?? event.slug ?? event.title ?? "");

    if (key) {
      eventsById.set(key, event);
    }
  });

  return [...eventsById.values()];
}

async function fetchPolymarketEvents(params: Record<string, string>) {
  try {
    const searchParams = new URLSearchParams(params);
    const response = await fetch(`https://gamma-api.polymarket.com/events?${searchParams}`, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();

    return Array.isArray(data) ? (data as PolymarketEvent[]) : [];
  } catch {
    return [];
  }
}

function scorePolymarketEvent(event: PolymarketEvent, race: RaceDetail) {
  if (!event.active || event.closed || event.archived) {
    return 0;
  }

  const title = `${event.title ?? ""} ${event.slug ?? ""} ${(event.markets ?? [])
    .slice(0, 8)
    .map((market) => `${market.question ?? ""} ${market.groupItemTitle ?? ""}`)
    .join(" ")}`;
  const normalizedTitle = normalizeText(title);
  let score = 0;

  if (
    normalizedTitle.includes("formula 1") ||
    normalizedTitle.includes("formula one") ||
    normalizedTitle.includes("f1")
  ) {
    score += 4;
  }

  if (normalizedTitle.includes("grand prix")) {
    score += 2;
  }

  if (normalizedTitle.includes("driver winner") || normalizedTitle.includes("driver win")) {
    score += 5;
  } else if (normalizedTitle.includes("winner") || normalizedTitle.includes(" win ")) {
    score += 3;
  }

  if (
    /constructor|constructors|pole|champion|championship|action of the year|retire|score/.test(
      normalizedTitle,
    )
  ) {
    score -= 8;
  }

  getRaceMatchTerms(race).forEach((candidate) => {
    if (normalizedTitle.includes(candidate)) {
      score += candidate.length > 8 ? 3 : 2;
    }
  });

  const markets = event.markets ?? [];
  const driverWinnerMarkets = markets.filter((market) =>
    isDriverWinnerMarket(market),
  ).length;

  if (driverWinnerMarkets >= 4) {
    score += 5;
  } else if (driverWinnerMarkets >= 2) {
    score += 3;
  } else {
    score -= 5;
  }

  return score;
}

function scoreSeasonChampionEvent(event: PolymarketEvent) {
  if (!event.active || event.closed || event.archived) {
    return 0;
  }

  const normalizedTitle = normalizeText(`${event.title ?? ""} ${event.slug ?? ""}`);
  let score = 0;

  if (normalizedTitle.includes("f1") || normalizedTitle.includes("formula 1")) {
    score += 3;
  }

  if (normalizedTitle.includes("drivers champion") || normalizedTitle.includes("driver champion")) {
    score += 6;
  }

  if (normalizedTitle.includes("2026")) {
    score += 2;
  }

  if (/constructor|constructors|grand prix|pole|action of the year|retire/.test(normalizedTitle)) {
    score -= 8;
  }

  const championMarkets = (event.markets ?? []).filter((market) =>
    isDriverChampionMarket(market),
  ).length;

  if (championMarkets >= 4) {
    score += 5;
  } else if (championMarkets >= 2) {
    score += 3;
  }

  return score;
}

function scoreConstructorChampionEvent(event: PolymarketEvent) {
  if (!event.active || event.closed || event.archived) {
    return 0;
  }

  const normalizedTitle = normalizeText(`${event.title ?? ""} ${event.slug ?? ""}`);
  let score = 0;

  if (normalizedTitle.includes("f1") || normalizedTitle.includes("formula 1")) {
    score += 3;
  }

  if (
    normalizedTitle.includes("constructors champion") ||
    normalizedTitle.includes("constructor champion") ||
    normalizedTitle.includes("constructors championship") ||
    normalizedTitle.includes("constructor championship")
  ) {
    score += 7;
  }

  if (normalizedTitle.includes("2026")) {
    score += 2;
  }

  if (/driver|drivers|grand prix|pole|action of the year|retire|race winner/.test(normalizedTitle)) {
    score -= 8;
  }

  const championMarkets = (event.markets ?? []).filter((market) =>
    isConstructorChampionMarket(market),
  ).length;

  if (championMarkets >= 4) {
    score += 5;
  } else if (championMarkets >= 2) {
    score += 3;
  }

  return score;
}

function getRaceMatchTerms(race: RaceDetail) {
  const values = [race.race, race.country, race.locality, race.circuit];
  const stopWords = new Set([
    "circuit",
    "grand",
    "prix",
    "formula",
    "one",
    "the",
    "de",
    "del",
    "autodromo",
    "international",
  ]);
  const terms = new Set<string>();

  values
    .map(normalizeText)
    .filter(Boolean)
    .forEach((value) => {
      const withoutGrandPrix = value.replace(/\bgrand prix\b/g, "").trim();

      if (withoutGrandPrix.length >= 4) {
        terms.add(withoutGrandPrix);
      }

      withoutGrandPrix
        .split(" ")
        .filter((part) => part.length >= 4 && !stopWords.has(part))
        .forEach((part) => {
          terms.add(part);

          if (part === "barcelona") {
            terms.add("catalunya");
          }
        });

      if (withoutGrandPrix.includes("catalunya")) {
        terms.add("catalunya");
      }

      if (withoutGrandPrix.includes("spanish") || withoutGrandPrix.includes("spain")) {
        terms.add("catalunya");
      }
    });

  return [...terms];
}

function parsePolymarketEventOutcomes(
  event: PolymarketEvent,
  matchNames: Set<string>,
  kind: PolymarketOutcomeKind,
): RaceWinnerOdds["outcomes"] {
  const outcomesByName = new Map<string, RaceWinnerOdds["outcomes"][number]>();

  (event.markets ?? []).forEach((market) => {
    if (!market.active || market.closed || market.archived) {
      return;
    }

    const yesNoOutcome = parsePolymarketYesNoOutcome(market, matchNames, kind);

    if (yesNoOutcome) {
      const key = normalizeText(yesNoOutcome.name);
      const existing = outcomesByName.get(key);

      if (!existing || yesNoOutcome.probability > existing.probability) {
        outcomesByName.set(key, yesNoOutcome);
      }

      return;
    }

    parsePolymarketOutcomes(market, matchNames).forEach((outcome) => {
      const key = normalizeText(outcome.name);
      const existing = outcomesByName.get(key);

      if (!existing || outcome.probability > existing.probability) {
        outcomesByName.set(key, outcome);
      }
    });
  });

  return [...outcomesByName.values()].sort((a, b) => b.probability - a.probability);
}

function parsePolymarketYesNoOutcome(
  market: PolymarketMarket,
  matchNames: Set<string>,
  kind: PolymarketOutcomeKind,
): RaceWinnerOdds["outcomes"][number] | null {
  const isValidMarket = isPolymarketOutcomeMarket(market, kind);

  if (!isValidMarket) {
    return null;
  }

  const outcomes = parseStringArray(market.outcomes).map(normalizeText);
  const prices = parseStringArray(market.outcomePrices)
    .map((price) => Number(price))
    .map((price) => (Number.isFinite(price) ? price : 0));
  const yesIndex = outcomes.findIndex((outcome) => outcome === "yes");

  if (yesIndex === -1) {
    return null;
  }

  const name = getPolymarketEntityName(market);

  if (!name || !isLikelyNamedOutcome(name, matchNames)) {
    return null;
  }

  const probability = Math.max(0, Math.min(1, prices[yesIndex] ?? 0));

  if (probability <= 0) {
    return null;
  }

  return {
    name,
    probability,
    label: `${Math.round(probability * 100)}%`,
  };
}

function isPolymarketOutcomeMarket(
  market: PolymarketMarket,
  kind: PolymarketOutcomeKind,
) {
  if (kind === "race-winner") {
    return isDriverWinnerMarket(market);
  }

  if (kind === "driver-champion") {
    return isDriverChampionMarket(market);
  }

  return isConstructorChampionMarket(market);
}

function isDriverChampionMarket(market: PolymarketMarket) {
  const normalized = normalizeText(`${market.question ?? ""} ${market.slug ?? ""}`);
  const outcomes = parseStringArray(market.outcomes).map(normalizeText);
  const hasYesNo =
    outcomes.length === 2 && outcomes.includes("yes") && outcomes.includes("no");

  return (
    hasYesNo &&
    (normalized.includes("f1 drivers champion") ||
      normalized.includes("f1 driver champion") ||
      normalized.includes("drivers champion")) &&
    !/constructor|constructors|grand prix|pole|retire/.test(normalized)
  );
}

function isDriverWinnerMarket(market: PolymarketMarket) {
  const normalized = normalizeText(`${market.question ?? ""} ${market.slug ?? ""}`);
  const outcomes = parseStringArray(market.outcomes).map(normalizeText);
  const hasYesNo =
    outcomes.length === 2 && outcomes.includes("yes") && outcomes.includes("no");

  return (
    hasYesNo &&
    (normalized.includes("driver winner") ||
      normalized.includes("grand prix winner") ||
      (normalized.includes("win") && normalized.includes("grand prix"))) &&
    !/constructor|constructors|pole|champion|championship|score/.test(normalized)
  );
}

function isConstructorChampionMarket(market: PolymarketMarket) {
  const normalized = normalizeText(`${market.question ?? ""} ${market.slug ?? ""}`);
  const outcomes = parseStringArray(market.outcomes).map(normalizeText);
  const hasYesNo =
    outcomes.length === 2 && outcomes.includes("yes") && outcomes.includes("no");

  return (
    hasYesNo &&
    (normalized.includes("f1 constructors champion") ||
      normalized.includes("f1 constructor champion") ||
      normalized.includes("constructors champion") ||
      normalized.includes("constructor champion") ||
      normalized.includes("constructors championship") ||
      normalized.includes("constructor championship")) &&
    !/driver|drivers|grand prix|pole|retire|race winner/.test(normalized)
  );
}

function getPolymarketEntityName(market: PolymarketMarket) {
  const groupTitle = market.groupItemTitle?.trim();

  if (groupTitle) {
    return groupTitle;
  }

  const question = market.question ?? "";
  const match = question.match(/^will\s+(.+?)\s+(?:win|get|be)\b/i);

  return match?.[1]?.trim() ?? "";
}

function getEventVolume(event: PolymarketEvent) {
  return Number(event.volume24hr ?? event.volume ?? event.liquidity ?? 0) || 0;
}

function getPolymarketUpdatedAt(event: PolymarketEvent) {
  const dates = [
    event.updatedAt,
    ...(event.markets ?? []).map((market) => market.updatedAt),
    event.startDate,
  ]
    .filter(Boolean)
    .map((value) => new Date(value as string))
    .filter((date) => Number.isFinite(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime());

  return dates[0]?.toISOString() ?? null;
}

function getPolymarketEventUrl(event: PolymarketEvent) {
  return `https://polymarket.com/event/${event.slug ?? event.id ?? ""}`;
}

function parsePolymarketOutcomes(
  market: PolymarketMarket,
  matchNames: Set<string>,
): RaceWinnerOdds["outcomes"] {
  const outcomes = parseStringArray(market.outcomes);
  const prices = parseStringArray(market.outcomePrices)
    .map((price) => Number(price))
    .map((price) => (Number.isFinite(price) ? price : 0));

  return outcomes
    .map((outcome, index) => ({
      name: outcome,
      probability: Math.max(0, Math.min(1, prices[index] ?? 0)),
      label: `${Math.round(Math.max(0, Math.min(1, prices[index] ?? 0)) * 100)}%`,
    }))
    .filter((outcome) => outcome.probability > 0 && isLikelyNamedOutcome(outcome.name, matchNames))
    .sort((a, b) => b.probability - a.probability);
}

function parseStringArray(value: string[] | string | undefined) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map(String);
  }

  try {
    const parsed = JSON.parse(value);

    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function isLikelyNamedOutcome(value: string, matchNames: Set<string>) {
  const normalized = normalizeText(value);

  if (!normalized || ["yes", "no", "other"].includes(normalized)) {
    return false;
  }

  if (matchNames.size === 0) {
    return normalized.split(" ").length >= 2;
  }

  return [...matchNames].some((name) => name && normalized.includes(name));
}

function parseRaceFilter(value: string) {
  const match = value.match(/^(\d{4})-(\d{1,2})$/);

  if (!match) {
    return null;
  }

  return {
    season: Number(match[1]),
    round: Number(match[2]),
  };
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function getCurrentRace(select?: string): Promise<RaceRow | null> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const fields =
    select ??
    "id, season_year, round, race_name, race_start_at, status, circuits(name, country, locality, external_id)";
  const weekendWindowIso = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();

  const { data: upcoming } = await supabase
    .from("races")
    .select(fields)
    .gte("race_start_at", weekendWindowIso)
    .order("race_start_at", { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (upcoming) {
    return upcoming as unknown as RaceRow;
  }

  const { data: latest } = await supabase
    .from("races")
    .select(fields)
    .order("race_start_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  return (latest as unknown as RaceRow | null) ?? null;
}

async function getRaceWinners(raceIds: string[]) {
  const winners = new Map<string, string>();

  if (!raceIds.length) {
    return winners;
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return winners;
  }

  const { data } = await supabase
    .from("session_results")
    .select("drivers(full_name), sessions!inner(race_id, session_type)")
    .eq("position", 1)
    .eq("sessions.session_type", "race")
    .in("sessions.race_id", raceIds);

  (data as unknown as RaceWinnerDbRow[] | null)?.forEach((row) => {
    const session = getRelationObject(row.sessions);

    if (session?.race_id && !winners.has(session.race_id)) {
      winners.set(session.race_id, getRelationName(row.drivers, "Победитель уточняется"));
    }
  });

  return winners;
}

function mapCalendarRace(race: RaceRow, isCurrent: boolean, winner?: string): CalendarEvent {
  const circuit = getRelationObject(race.circuits);
  const country = circuit?.country ?? "Страна уточняется";

  return {
    season: race.season_year,
    round: race.round,
    race: race.race_name,
    circuit: circuit?.name ?? "Трасса уточняется",
    country,
    countryFlag: getCountryFlag(country),
    date: formatDateRange(race.race_start_at),
    status: mapRaceStatus(race.status, race.race_start_at, isCurrent ? 0 : 1),
    winner,
    href: `/calendar/${race.season_year}/${race.round}`,
  };
}

function getCountryFlag(country: string) {
  const normalized = country.toLowerCase();
  const flags: Record<string, string> = {
    australia: "🇦🇺",
    austria: "🇦🇹",
    azerbaijan: "🇦🇿",
    bahrain: "🇧🇭",
    belgium: "🇧🇪",
    brazil: "🇧🇷",
    canada: "🇨🇦",
    china: "🇨🇳",
    hungary: "🇭🇺",
    italy: "🇮🇹",
    japan: "🇯🇵",
    mexico: "🇲🇽",
    monaco: "🇲🇨",
    netherlands: "🇳🇱",
    qatar: "🇶🇦",
    "saudi arabia": "🇸🇦",
    singapore: "🇸🇬",
    spain: "🇪🇸",
    "united arab emirates": "🇦🇪",
    "united kingdom": "🇬🇧",
    uk: "🇬🇧",
    "united states": "🇺🇸",
    usa: "🇺🇸",
  };

  return flags[normalized] ?? "🏁";
}

function getProfileName(
  profile:
    | { display_name: string | null; email: string | null }
    | { display_name: string | null; email: string | null }[]
    | null,
) {
  const value = Array.isArray(profile) ? profile[0] : profile;

  return value?.display_name ?? value?.email?.split("@")[0] ?? "Участник";
}

function getArticleTags(tags: TagRelation | null) {
  if (!tags) {
    return [{ name: "F1", slug: "f1" }];
  }

  const list = Array.isArray(tags) ? tags : [tags];
  const seen = new Set<string>();
  const result: { name: string; slug: string; type?: string }[] = [];

  list.forEach((item) => {
    const rawTags = Array.isArray(item.tags) ? item.tags : item.tags ? [item.tags] : [];

    rawTags.forEach((tag) => {
      const name = tag.name.trim();

      if (!name) {
        return;
      }

      const slug = tag.slug ?? slugify(name);
      const canonical = normalizeTagKey(name);
      const type = tag.type ?? undefined;

      if (seen.has(slug) || seen.has(canonical)) {
        return;
      }

      seen.add(slug);
      seen.add(canonical);
      result.push({ name, slug, type });
    });
  });

  return result.length ? result : [{ name: "F1", slug: "f1" }];
}

function normalizeTagKey(value: string) {
  return slugify(value.replace(/,\s*\d{4}/, ""));
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getRelationName(
  relation: { name?: string; full_name?: string } | { name?: string; full_name?: string }[] | null,
  fallback: string,
) {
  const value = Array.isArray(relation) ? relation[0] : relation;

  return value?.name ?? value?.full_name ?? fallback;
}

function getTeamVisualFields(
  relation: TeamRelationObject | TeamRelationObject[] | null,
  fallback: string,
) {
  const team = getRelationObject(relation);
  const teamName = team?.name ?? fallback;
  const asset = getTeamAsset(teamName) ?? getTeamAsset(team?.code);

  return {
    team: teamName,
    teamCode: team?.code ?? asset?.code,
    teamLogo: asset?.logo,
    teamColor: team?.color_hex ?? asset?.color,
  };
}

function getRelationObject<T>(relation: T | T[] | null): T | null {
  return (Array.isArray(relation) ? relation[0] : relation) ?? null;
}

function mapWeatherRow(weather: WeatherDbRow & { forecast_at?: string | null }, status: string): SessionWeather {
  const temperatureC =
    weather.temperature_c === null || weather.temperature_c === undefined
      ? null
      : Math.round(Number(weather.temperature_c));
  const precipitationMm =
    weather.precipitation_mm === null || weather.precipitation_mm === undefined
      ? null
      : Number(weather.precipitation_mm);

  return {
    temperature: temperatureC === null ? "Нет данных" : `${temperatureC}\u00A0°C`,
    temperatureC,
    wind:
      weather.wind_speed_kmh === null || weather.wind_speed_kmh === undefined
        ? "Нет данных"
        : `${Math.round(Number(weather.wind_speed_kmh))} км/ч`,
    precipitation: precipitationMm === null ? "Нет данных" : `${precipitationMm.toFixed(1)} мм`,
    precipitationMm,
    observedAt: formatRelativeTime(weather.observed_at ?? weather.forecast_at ?? null),
    status,
  };
}

function mapRaceStatus(status: string, startsAt: string | null, index: number) {
  if (index === 0 && !isPast(startsAt)) {
    return "Текущий этап";
  }

  if (status === "completed" || isPast(startsAt)) {
    return "Завершен";
  }

  if (status === "scheduled") {
    return "Ожидается";
  }

  return status;
}

function mapSessionStatus(status: string) {
  if (status === "completed") {
    return "Завершена";
  }

  if (status === "scheduled") {
    return "Ожидается";
  }

  return status;
}

function isPast(value: string | null) {
  if (!value) {
    return false;
  }

  return new Date(value).getTime() < Date.now() - 36 * 60 * 60 * 1000;
}

function formatDateRange(value: string | null) {
  if (!value) {
    return "Дата уточняется";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: "Europe/Moscow",
  }).format(new Date(value));
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Время уточняется";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(new Date(value));
}

function formatRelativeTime(value: string | null) {
  if (!value) {
    return "Недавно";
  }

  const diffMs = Date.now() - new Date(value).getTime();
  const diffMinutes = Math.max(1, Math.round(diffMs / 60_000));

  if (diffMinutes < 60) {
    return `${diffMinutes} мин назад`;
  }

  const diffHours = Math.round(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours} ч назад`;
  }

  const diffDays = Math.round(diffHours / 24);

  return `${diffDays} дн назад`;
}

function emptyWeather(): WeekendWeather {
  return {
    temperature: "Нет данных",
    temperatureC: null,
    wind: "Нет данных",
    precipitation: "Нет данных",
    precipitationMm: null,
    observedAt: "Синхронизация не запускалась",
    status: "Ожидает worker",
  };
}

function mapJobStatus(status: string) {
  if (status === "succeeded" || status === "success") {
    return "Успешно";
  }

  if (status === "failed" || status === "error") {
    return "Ошибка";
  }

  if (status === "running") {
    return "В работе";
  }

  return status;
}
