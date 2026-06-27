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
  driverSlug?: string;
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
  driverSlug?: string;
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

export type DriverProfileTeam = {
  id?: string;
  name: string;
  code?: string;
  logo?: string;
  color?: string;
};

export type DriverSeasonStats = {
  points: number | null;
  championshipPosition: number | null;
  wins: number | null;
  podiums: number | null;
  poles: number | null;
  fastestLaps: number | null;
  dnfs: number | null;
  pointsFinishes: number | null;
  averageStart: number | null;
  averageFinish: number | null;
  bestResult: number | null;
  worstResult: number | null;
  q3Appearances: number | null;
};

export type DriverRaceResultRow = {
  round: number;
  raceName: string;
  raceDate: string | null;
  circuit: string;
  country: string;
  countryCode?: string;
  qualifyingPosition: number | null;
  startPosition: number | null;
  finishPosition: number | null;
  positionDelta: number | null;
  points: number | null;
  status: string;
  isWin: boolean;
  isPodium: boolean;
  isDnf: boolean;
  scoredPoints: boolean;
};

export type DriverChartPoint = {
  round: number;
  raceName: string;
  value: number | null;
};

export type DriverCumulativePointsSeries = {
  driverId: string;
  driver: string;
  driverSlug?: string;
  teamColor?: string;
  points: DriverChartPoint[];
};

export type DriverFormStats = {
  labels: string[];
  points: number;
  podiums: number;
  dnfs: number;
  bestResult: number | null;
  averageQualifyingPosition: number | null;
  averageFinishPosition: number | null;
};

export type DriverTeammateComparison = {
  teammateNames: string[];
  qualifying: { driver: number; teammate: number };
  races: { driver: number; teammate: number };
  points: { driver: number; teammate: number };
  podiums: { driver: number; teammate: number };
  wins: { driver: number; teammate: number };
  averageStart: { driver: number | null; teammate: number | null };
  averageFinish: { driver: number | null; teammate: number | null };
  dnfs: { driver: number; teammate: number };
};

export type DriverPositionDeltaStats = {
  totalDelta: number | null;
  averageDelta: number | null;
  bestGain: { value: number; raceName: string } | null;
  biggestDrop: { value: number; raceName: string } | null;
};

export type DriverProfileNewsItem = {
  title: string;
  summary: string;
  href: string;
  source: string;
  time: string;
  imageUrl?: string;
};

export type DriverProfileSocialPost = {
  platform: "x" | "reddit";
  author: string;
  title: string;
  href: string;
  publishedAt: string;
};

export type DriverProfile = {
  id: string;
  slug: string;
  firstName: string;
  lastName: string;
  fullName: string;
  code?: string;
  number: number | null;
  country: string | null;
  countryCode?: string | null;
  aiAvatarUrl?: string | null;
  avatarPlaceholderStyle?: string | null;
  team: DriverProfileTeam;
  season: number;
  stats: DriverSeasonStats;
  results: DriverRaceResultRow[];
  charts: {
    racePoints: DriverChartPoint[];
    cumulativePoints: DriverChartPoint[];
    championshipPosition: DriverChartPoint[];
    topTenCumulativePoints: DriverCumulativePointsSeries[];
  };
  form: DriverFormStats;
  teammateComparison: DriverTeammateComparison;
  positionDelta: DriverPositionDeltaStats;
  news: DriverProfileNewsItem[];
  socialPosts: DriverProfileSocialPost[];
  isFavorite: boolean;
  favoriteLimitReached: boolean;
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
  driverSlug?: string;
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

export type FantasyScoreBreakdown = {
  total: number;
  top10Points: number;
  top10Bonus: number;
  specialPoints: number;
  top10?: Array<{
    predictedPosition: number;
    driverId: string;
    actualPosition: number | null;
    points: number;
  }>;
  bonuses?: {
    perfectTop10?: number;
    allTop10?: number;
    podiumAnyOrder?: number;
  };
  specials?: {
    pole?: number;
    fastestLap?: number;
    firstDnf?: number;
    topScoringTeam?: number;
    fastestPitStopTeam?: number;
  };
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
  scoreBreakdown?: FantasyScoreBreakdown | null;
};

export type LeagueHistoryEntry = {
  raceName: string;
  round: number;
  predictions: {
    userId: string;
    name: string;
    score: number | null;
    scoreBreakdown?: FantasyScoreBreakdown | null;
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

export type AdminDriver = {
  id: string;
  slug: string;
  fullName: string;
  code?: string;
  number: number | null;
  country?: string;
  countryCode?: string;
  aiAvatarUrl?: string;
  teamId?: string;
  team: string;
  teamCode?: string;
  teamLogo?: string;
  teamColor?: string;
};

export type AdminTeamOption = {
  id: string;
  name: string;
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
  kind?: "sport" | "strategy" | "fan";
  status?: "published" | "closed";
  closesAt?: string | null;
  race?: {
    id: string;
    season: number;
    round: number;
    name: string;
    circuit: string;
    country: string;
  };
};

export type DriverOption = {
  id: string;
  name: string;
  team: string;
};

export type TeamOption = {
  id: string;
  name: string;
  code?: string | null;
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
  teams: TeamOption[];
  current: {
    top10DriverIds: string[];
    poleDriverId: string | null;
    winnerDriverId: string | null;
    fastestLapDriverId: string | null;
    dnfDriverId: string | null;
    dnfPickKind: "driver" | "none";
    topScoringTeamId: string | null;
    fastestPitStopTeamId: string | null;
    score: number | null;
    scoreBreakdown?: FantasyScoreBreakdown | null;
    isPublic?: boolean;
    shareImageVersion?: number;
    shareSlug?: string | null;
  } | null;
};

export type PredictionShareScope = "qualification" | "race";

export type PredictionShareDriverPick = {
  avatarUrl?: string | null;
  code?: string | null;
  id: string;
  name: string;
  number?: number | null;
  position?: number;
  team?: {
    code?: string | null;
    color?: string | null;
    name: string;
  } | null;
};

export type PredictionShareTeamPick = {
  code?: string | null;
  color?: string | null;
  id: string;
  name: string;
};

export type PublicPredictionShare = {
  id: string;
  displayName: string;
  leagueName: string | null;
  ogImageUrl: string;
  publicUrl: string;
  race: {
    name: string;
    round: number | null;
    season: number;
    startsAt: string | null;
  };
  scope: PredictionShareScope;
  shareImageUrl: string;
  shareImageVersion: number;
  shareSlug: string;
  picks: {
    dnfKind: "driver" | "none";
    dnf: PredictionShareDriverPick | null;
    fastestLap: PredictionShareDriverPick | null;
    fastestPitStopTeam: PredictionShareTeamPick | null;
    pole: PredictionShareDriverPick | null;
    topScoringTeam: PredictionShareTeamPick | null;
    top10: PredictionShareDriverPick[];
  };
};

export type GlobalFantasyLeaderboardRow = {
  rank: number;
  displayName: string;
  totalScore: number;
  predictionCount: number;
  scoredPredictionCount: number;
  averageScore: number;
  bestScore: number | null;
  bestBreakdown?: FantasyScoreBreakdown | null;
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
