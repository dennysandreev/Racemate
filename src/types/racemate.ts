export type NewsItem = {
  slug: string;
  href?: string;
  source: string;
  title: string;
  summary: string;
  details?: string;
  keyPoints?: string[];
  highlights?: string[];
  imageUrl?: string;
  sourceImageUrl?: string;
  tags: { name: string; slug: string; type?: string }[];
  raceTag?: string;
  raceTagSlug?: string;
  raceFilter?: string;
  time: string;
};

export type NewsListResult = {
  items: NewsItem[];
  page: number;
  totalPages: number;
  totalCount: number;
};

export type NextSession = {
  race: string;
  circuit: string;
  session: string;
  startsAt: string;
  startsAtIso?: string;
  status: string;
};

export type StandingRow = {
  position: number;
  driver: string;
  team: string;
  teamCode?: string;
  teamLogo?: string;
  teamColor?: string;
  points: number;
};

export type ConstructorStandingRow = {
  position: number;
  team: string;
  teamCode?: string;
  teamLogo?: string;
  teamColor?: string;
  points: number;
  wins: number;
  pointsByRound?: Record<number, number>;
};

export type StandingsMeta = {
  season: number;
  round: number | null;
  label: string;
};

export type DriverChampionshipRow = {
  position: number;
  driver: string;
  team: string;
  teamCode?: string;
  teamLogo?: string;
  teamColor?: string;
  total: number;
  pointsByRound: Record<number, number>;
  podiumByRound: Record<number, "winner" | "second" | "third">;
};

export type ChampionshipRound = {
  round: number;
  flag: string;
  countryCode?: string;
  raceName: string;
};

export type DriverChampionshipMatrix = {
  rounds: ChampionshipRound[];
  rows: DriverChampionshipRow[];
};

export type ConstructorChampionshipMatrix = {
  rounds: ChampionshipRound[];
  rows: ConstructorStandingRow[];
};

export type TeamVisual = {
  name: string;
  code?: string;
  logo?: string;
  color?: string;
};

export type PredictionPick = {
  label: string;
  value: string;
};

export type AdminSignal = {
  label: string;
  value: string;
  status: string;
};

export type CalendarEvent = {
  season: number;
  round: number;
  race: string;
  circuit: string;
  country: string;
  countryFlag: string;
  countryCode?: string;
  date: string;
  status: string;
  winner?: string;
  href: string;
};

export type RaceDetail = {
  id: string;
  season: number;
  round: number;
  race: string;
  circuit: string;
  circuitId?: string | null;
  country: string;
  countryFlag: string;
  countryCode?: string;
  locality: string;
  startsAt: string;
  status: string;
  layout?: TrackLayout | null;
};

export type MarketOdds = {
  marketTitle: string;
  marketUrl: string;
  source: string;
  updatedAt: string;
  outcomes: {
    name: string;
    probability: number;
    label: string;
  }[];
};

export type RaceWinnerOdds = MarketOdds;

export type SeasonChampionOdds = MarketOdds;

export type ConstructorChampionOdds = MarketOdds;

export type WeekendSession = {
  id?: string;
  type?: string;
  name: string;
  startsAt: string;
  startsAtIso?: string;
  status: string;
  href?: string;
  weather?: SessionWeather;
};

export type SessionWeather = {
  temperature: string;
  temperatureC: number | null;
  wind: string;
  precipitation: string;
  precipitationMm: number | null;
  observedAt: string;
  status: string;
};

export type TrackLayout = {
  svgPath: string;
  viewBox: string;
  provider: string;
  sourceSessionKey: number | null;
};

export type SessionResult = {
  position: number | null;
  driver: string;
  team: string;
  teamCode?: string;
  teamLogo?: string;
  teamColor?: string;
  time: string;
  status: string;
  grid: number | null;
  laps: number | null;
  points: number | null;
};

export type GrandPrixReportStatus = "ready" | "partial";

export type GrandPrixReportResult = {
  position: number | null;
  driver: string;
  team: string;
  grid: number | null;
  positionDelta: number | null;
  points: number | null;
  status: string;
  bestLap?: string | null;
  tyres?: TyreStint[];
  isWinner?: boolean;
  isPodium?: boolean;
  isFastestLap?: boolean;
  isBestGain?: boolean;
  isBiggestDrop?: boolean;
};

export type TyreStint = {
  compound: string;
  startLap?: number | null;
  endLap?: number | null;
};

export type GrandPrixReportEvent = {
  lap: number | null;
  type: string;
  title: string;
  detail?: string | null;
};

export type GrandPrixReport = {
  id: string;
  season: number;
  round: number;
  raceSlug: string;
  raceName: string;
  circuitName: string;
  country: string;
  raceDate: string;
  status: GrandPrixReportStatus;
  summaryStatus: string;
  aiSummary?: string | null;
  weather: Record<string, unknown>;
  raceStatistics: Record<string, unknown>;
  results: GrandPrixReportResult[];
  keyEvents: GrandPrixReportEvent[];
  pitStops: unknown[];
  strategies: unknown[];
  teammateComparisons: unknown[];
  highlights: Record<string, unknown>;
  championshipImpact: Record<string, unknown>;
  newsSummary: Record<string, unknown>;
  sourceErrors: Record<string, unknown>;
  generatedAt: string;
};

export type DailyDigest = {
  id?: string;
  title: string;
  body: string;
  generatedAt: string;
  status: string;
};

export type WeekendWeather = {
  temperature: string;
  temperatureC: number | null;
  wind: string;
  precipitation: string;
  precipitationMm: number | null;
  observedAt: string;
  status: string;
};

export type LeagueSummary = {
  id?: string;
  name: string;
  members: number;
  leader: string;
  score: number;
  inviteCode?: string;
};

export type NewsTagFilter = {
  name: string;
  slug: string;
};

export type FavoriteNewsFilters = {
  drivers: NewsTagFilter[];
  teams: NewsTagFilter[];
};

export type LeaguePredictionPick = {
  label: string;
  value: string;
};

export type LeagueMemberPrediction = {
  userId: string;
  name: string;
  role: string;
  joinedAt: string;
  currentScore: number | null;
  totalScore: number;
  scoredCount: number;
  averageScore: number;
  bestScore: number | null;
  picks: LeaguePredictionPick[];
};

export type LeagueHistoryEntry = {
  raceName: string;
  round: number;
  predictions: {
    userId: string;
    name: string;
    score: number | null;
    picks: LeaguePredictionPick[];
  }[];
};

export type LeagueDetail = {
  id: string;
  name: string;
  inviteCode?: string;
  members: LeagueMemberPrediction[];
  history: LeagueHistoryEntry[];
};

export type AdminJob = {
  name: string;
  status: string;
  processed: number;
  finishedAt: string;
};

export type AdminSource = {
  id: string;
  name: string;
  url: string;
  isActive: boolean;
  lastStatus: string;
};

export type SocialPlatform = "all" | "x" | "reddit";

export type SocialSort = "new" | "popular";

export type SocialPost = {
  id: string;
  platform: "x" | "reddit";
  author: string;
  title: string;
  body?: string;
  originalUrl: string;
  imageUrl?: string;
  publishedAt: string;
  reactionCount?: number;
  popularityScore: number;
};

export type SocialFeedResult = {
  items: SocialPost[];
  nextCursor: string | null;
};

export type AdminSocialSource = AdminSource & {
  platform: "x" | "reddit";
  adapter: string;
  feedKind?: string;
};

export type AdminGrandPrixReport = {
  id: string;
  season: number;
  round: number;
  raceName: string;
  raceSlug: string;
  status: string;
  summaryStatus: string;
  isHidden: boolean;
  generatedAt: string;
  nextRefreshAt: string;
  lastError?: string;
  aiSummary?: string;
};

export type AiUsageSummary = {
  totalRuns: number;
  estimatedCostUsd: number;
  lastModel: string;
};

export type PollSummary = {
  id?: string;
  question: string;
  options: { id: string; label: string; votes?: number }[] | string[];
  votes: number;
  userVote?: string;
};

export type DriverOption = {
  id: string;
  name: string;
  team: string;
};

export type RaceOption = {
  id: string;
  name: string;
  startsAt: string;
  qualifyingStartsAtIso?: string | null;
  raceStartsAtIso?: string | null;
  poleLocked: boolean;
  raceLocked: boolean;
};

export type PredictionState = {
  race: RaceOption | null;
  drivers: DriverOption[];
  current: {
    poleDriverId: string | null;
    winnerDriverId: string | null;
    fastestLapDriverId: string | null;
    dnfDriverId: string | null;
    score: number | null;
  } | null;
};

export type GlobalFantasyLeaderboardRow = {
  rank: number;
  displayName: string;
  totalScore: number;
  predictionCount: number;
  scoredPredictionCount: number;
  averageScore: number;
  bestScore: number | null;
};

export type GlobalFantasyLeaderboard = {
  rows: GlobalFantasyLeaderboardRow[];
  updatedAt: string;
};

export type HomeOverview = {
  news: NewsItem[];
  standings: StandingRow[];
  adminSignals: AdminSignal[];
};
