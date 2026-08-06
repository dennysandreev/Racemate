import {
  ArrowRight,
  CalendarDays,
  ExternalLink,
  MapPin,
  Newspaper,
  Target,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ComponentType, ReactNode, SVGProps } from "react";

import { AppShell } from "@/components/racemate/app-shell";
import { JsonLd } from "@/components/racemate/json-ld";
import { PageTitle } from "@/components/racemate/page-title";
import { CircuitStatsSection } from "@/components/racemate/circuit-stats-section";
import { NavigationLoadingLink } from "@/components/racemate/navigation-loading-link";
import { NewsImage } from "@/components/racemate/news-image";
import { RaceFlag } from "@/components/racemate/race-flag";
import { TeamColorProgress } from "@/components/racemate/team-color";
import { TrackLocalTimeBadge } from "@/components/racemate/track-local-time-badge";
import { TrackMap } from "@/components/racemate/track-map";
import { WeekendSessionBoard } from "@/components/racemate/weekend-session-board";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getCircuitStatsForRace,
  getCurrentRaceReplaySummary,
  getNextSession,
  getCurrentRaceDetail,
  getDriverStandings,
  getPredictionState,
  getRaceNews,
  getSessionResultsBySessionIds,
  getRaceWinnerOdds,
  getWeekendSessions,
} from "@/data/racemate-repository";
import { getTeamAssetForMarketOutcome } from "@/data/f1-assets";
import { getSessionUser } from "@/lib/auth";
import { formatSessionName } from "@/lib/session-display";
import { CURRENT_F1_SEASON, getSearchParam } from "@/lib/season-navigation";
import { absoluteUrl, createPageMetadata, SITE_URL } from "@/lib/seo";
import { withServerTtlCache } from "@/lib/server-ttl-cache";
import { cn } from "@/lib/utils";
import type { PredictionState, RaceDetail, RaceWinnerOdds, StandingRow } from "@/types/racemate";

export const dynamic = "force-dynamic";

type WeekendSearchParams = {
  season?: string | string[];
  session?: string | string[];
};

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<WeekendSearchParams>;
}): Promise<Metadata> {
  const [query, nextSession] = await Promise.all([
    searchParams,
    getNextSession(),
  ]);
  const raceName = nextSession.race;

  return createPageMetadata({
    description: `${raceName}: расписание сессий, время старта, погода, новости, результаты и прогнозы на текущий гоночный уикенд.`,
    noIndex: Boolean(query.season || query.session),
    path: "/weekend",
    title: `${raceName}: гоночный уикенд`,
  });
}

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

export default async function WeekendPage({
  searchParams,
}: {
  searchParams: Promise<WeekendSearchParams>;
}) {
  const query = await searchParams;
  const requestedSeason = getSearchParam(query.season);
  const requestedSessionId = getSearchParam(query.session);

  if (requestedSeason && Number(requestedSeason) !== CURRENT_F1_SEASON) {
    notFound();
  }

  const userPromise = getSessionUser();
  const publicDataPromise = withServerTtlCache(
    "public:weekend",
    10_000,
    getWeekendPagePublicData,
    { staleWhileRevalidateMs: 5 * 60_000 },
  );
  const predictionStatePromise: Promise<PredictionState> = userPromise.then((user) =>
    user ? getPredictionState(user.id) : getEmptyWeekendPredictionState(),
  );
  const [user, publicData, predictionState] = await Promise.all([
    userPromise,
    publicDataPromise,
    predictionStatePromise,
  ]);
  const {
    circuitStats,
    currentRace,
    nextSession,
    raceNews,
    raceReplay,
    resultsBySession,
    standings,
    weekendSessions,
    winnerOdds,
  } = publicData;
  const sessionResults = weekendSessions.map((session) => ({
    results: session.id ? resultsBySession.get(session.id) ?? [] : [],
    session,
  }));
  const completedSessions = sessionResults.filter(
    (item) => item.results.length || item.session.status === "Завершена",
  ).length;
  const raceNewsTagSlug = raceNews
    .flatMap((item) => item.tags)
    .find((tag) => tag.type === "race")?.slug;
  const raceNewsHref =
    raceNewsTagSlug
      ? `/news?tag=${raceNewsTagSlug}`
      : currentRace
        ? `/news?race=${currentRace.season}-${currentRace.round}`
        : "/news";

  return (
    <AppShell>
      {currentRace ? (
        <JsonLd
          data={[
            {
              "@context": "https://schema.org",
              "@type": "BreadcrumbList",
              itemListElement: [
                {
                  "@type": "ListItem",
                  item: SITE_URL,
                  name: "Главная",
                  position: 1,
                },
                {
                  "@type": "ListItem",
                  item: `${SITE_URL}/weekend`,
                  name: currentRace.race,
                  position: 2,
                },
              ],
            },
            {
              "@context": "https://schema.org",
              "@type": "SportsEvent",
              description: `${currentRace.race}, текущий этап сезона Формулы-1 ${currentRace.season}.`,
              eventStatus: currentRace.status === "Завершен"
                ? "https://schema.org/EventCompleted"
                : "https://schema.org/EventScheduled",
              image: currentRace.trackMapUrl
                ? absoluteUrl(currentRace.trackMapUrl)
                : undefined,
              inLanguage: "ru-RU",
              location: {
                "@type": "Place",
                address: {
                  "@type": "PostalAddress",
                  addressCountry: currentRace.country,
                  addressLocality: currentRace.locality,
                },
                name: currentRace.circuit,
              },
              name: `${currentRace.race} ${currentRace.season}`,
              startDate: currentRace.startsAtIso,
              url: `${SITE_URL}/weekend`,
            },
          ]}
        />
      ) : null}
      <section className="grid gap-4 pb-5 sm:gap-5">
        <WeekendHero
          circuitStats={circuitStats}
          currentRace={currentRace}
          nextRace={nextSession.race}
          nextSession={nextSession}
          raceReplay={raceReplay}
          weekendStatus={nextSession.status}
        />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_23rem] xl:items-stretch">
          <section className="stitch-panel min-w-0 overflow-hidden p-0">
            <PanelHeader
              action={<WeekendProgressDots completed={completedSessions} total={sessionResults.length} />}
              icon={CalendarDays}
              meta={`${completedSessions} из ${sessionResults.length} сессий завершено`}
              title="Расписание уикенда"
            />
            <div className="p-3 sm:p-4">
              <WeekendSessionBoard
                activeSessionName={nextSession.session}
                initialSessionId={requestedSessionId}
                sessions={sessionResults}
              />
            </div>
          </section>

          <WinnerOddsCard odds={winnerOdds} teamLookupRows={standings} />
          <StageNewsPanel href={raceNewsHref} items={raceNews} />
          <FantasyPredictionCard predictionState={predictionState} userSignedIn={Boolean(user)} />
        </div>
      </section>
    </AppShell>
  );
}

async function getWeekendPagePublicData() {
  const raceReplayPromise = getCurrentRaceReplaySummary();
  const [nextSession, weekendSessions, currentRace, standings] = await Promise.all([
    getNextSession(),
    getWeekendSessions(),
    getCurrentRaceDetail(),
    getDriverStandings(CURRENT_F1_SEASON),
  ]);
  const sessionResultsPromise = getSessionResultsBySessionIds(
    weekendSessions.map((session) => session.id),
    CURRENT_F1_SEASON,
  );
  const [raceNews, winnerOdds, resultsBySession, circuitStats, raceReplay] = await Promise.all([
    currentRace ? getRaceNews(currentRace.id, 4) : [],
    getRaceWinnerOdds(currentRace),
    sessionResultsPromise,
    currentRace ? getCircuitStatsForRace(currentRace.season, currentRace.round) : null,
    raceReplayPromise,
  ]);

  return {
    circuitStats,
    currentRace,
    nextSession,
    raceNews,
    raceReplay,
    resultsBySession,
    standings,
    weekendSessions,
    winnerOdds,
  };
}

function getEmptyWeekendPredictionState(): PredictionState {
  return {
    current: null,
    drivers: [],
    previousResult: null,
    qualifyingResults: null,
    race: null,
    seasonSummary: {
      predictionCount: 0,
      scoredPredictionCount: 0,
      totalScore: null,
    },
    teams: [],
  };
}

function WeekendHero({
  circuitStats,
  currentRace,
  nextRace,
  nextSession,
  raceReplay,
  weekendStatus,
}: {
  circuitStats: Awaited<ReturnType<typeof getCircuitStatsForRace>>;
  currentRace: RaceDetail | null;
  nextRace: string;
  nextSession: Awaited<ReturnType<typeof getNextSession>>;
  raceReplay: Awaited<ReturnType<typeof getCurrentRaceReplaySummary>>;
  weekendStatus: string;
}) {
  const isWeekendDone = weekendStatus === "Завершен";

  return (
    <section className="stitch-panel relative overflow-hidden p-0">
      <div className="weekend-hero-glow pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgb(225_6_0_/_0.28),transparent_24rem),linear-gradient(125deg,rgb(255_255_255_/_0.08),transparent_38%),linear-gradient(180deg,transparent,rgb(0_0_0_/_0.28))]" />
      <div className="relative grid gap-3 px-5 pb-4 pt-3 sm:px-6 sm:pb-5 sm:pt-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="grid min-w-0 gap-2">
            <div className="flex min-w-0 items-center gap-2">
              {currentRace ? (
                <span className="inline-flex shrink-0 items-center">
                  <RaceFlag
                    className="text-xl"
                    countryCode={currentRace.countryCode}
                    label={currentRace.country}
                    value={currentRace.countryFlag}
                  />
                </span>
              ) : null}
              <Badge variant="outline">Раунд {currentRace?.round ?? "—"}</Badge>
            </div>
            <p className="font-telemetry flex min-w-0 items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-primary">
              <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="truncate">{currentRace?.circuit ?? "Трасса этапа"}</span>
            </p>
          </div>
          <div className="ml-auto flex flex-col items-end gap-1.5">
            <Badge className="shrink-0" variant={weekendStatus === "Live" ? "success" : "warning"}>
              {weekendStatus}
            </Badge>
          </div>
        </div>

        <div className="min-w-0">
          <PageTitle className="max-w-4xl">
            {nextRace}
          </PageTitle>
          {isWeekendDone ? (
            <p className="mt-2 text-sm font-semibold text-muted-foreground">
              Этап завершен — смотри результаты сессий и повтор гонки.
            </p>
          ) : (
            <p className="mt-2 flex flex-col text-sm font-semibold text-muted-foreground sm:flex-row sm:items-baseline sm:gap-1.5">
              <span>Ближайшая сессия</span>
              <span className="text-foreground sm:text-muted-foreground">
                {formatSessionName(nextSession.session)} · {nextSession.startsAt}
              </span>
            </p>
          )}
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-end">
          <div className="h-[14rem] min-w-0 sm:h-[15.5rem] xl:h-[18rem]">
            <TrackMap
              circuit={currentRace?.circuit ?? nextRace}
              fill
              label={nextRace}
              layout={currentRace?.layout}
              unframed
            />
          </div>
          <div className="grid content-end gap-2.5 border-t border-border/70 pt-4 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
            <CircuitStatsSection
              circuitName={currentRace?.circuit ?? nextRace}
              embedded
              footerAction={(
                <Button asChild className="w-full justify-center" size="sm">
                  <Link href="https://vkvideo.ru/@versportaa" rel="noreferrer" target="_blank">
                    Смотреть онлайн
                    <ExternalLink aria-hidden="true" data-icon="inline-end" />
                  </Link>
                </Button>
              )}
              headerAction={<TrackLocalTimeBadge timezone={currentRace?.timezone} />}
              showCircuitName={false}
              stats={circuitStats}
            />
            {raceReplay ? (
              <Button asChild className="w-full justify-center" size="sm" variant="secondary">
                <NavigationLoadingLink
                  href={raceReplay.href}
                  loadingLabel="Готовим повтор Гран-при"
                  prefetch={false}
                >
                  Повтор Гран-при · {raceReplay.sourceSeason}
                </NavigationLoadingLink>
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function PanelHeader({
  action,
  icon: Icon,
  meta,
  title,
}: {
  action?: ReactNode;
  icon: IconComponent;
  meta: string;
  title: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b stitch-divider p-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border/70 bg-secondary/40">
          <Icon aria-hidden="true" className="size-4.5 text-primary" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold leading-tight">{title}</h2>
          <p className="mt-0.5 truncate text-xs font-semibold text-muted-foreground">{meta}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

/*
 * Прогресс уикенда: точка на каждую сессию — закрашенные уже прошли.
 */
function WeekendProgressDots({ completed, total }: { completed: number; total: number }) {
  return (
    <span aria-label={`Завершено сессий: ${completed} из ${total}`} className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, index) => (
        <span
          aria-hidden="true"
          className={cn(
            "size-2 rounded-full",
            index < completed ? "bg-primary" : "border border-border/80 bg-secondary/50",
          )}
          key={index}
        />
      ))}
    </span>
  );
}

function StageNewsPanel({
  href,
  items,
}: {
  href: string;
  items: Awaited<ReturnType<typeof getRaceNews>>;
}) {
  return (
    <section className="order-4 stitch-panel overflow-hidden p-0 xl:order-3">
      <PanelHeader
        action={
          <Link
            className="group/action inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href={href}
          >
            Все новости
            <ArrowRight
              aria-hidden="true"
              className="size-3.5 transition-transform group-hover/action:translate-x-0.5"
            />
          </Link>
        }
        icon={Newspaper}
        meta="Главное вокруг этого Гран-при"
        title="Новости этапа"
      />
      <div className="divide-y divide-border/70">
        {items.length ? (
          items.map((item, index) => (
            <Link
              className={cn(
                "group grid min-w-0 items-center gap-3 p-4 transition-colors hover:bg-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:gap-5 sm:p-5",
                index === 0
                  ? "grid-cols-[minmax(0,1fr)_7.5rem] sm:grid-cols-[minmax(0,1fr)_13rem]"
                  : "grid-cols-[minmax(0,1fr)_5.5rem] sm:grid-cols-[minmax(0,1fr)_8rem]",
              )}
              href={`/news/${item.slug}`}
              key={item.slug}
              prefetch={false}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-xs font-semibold text-foreground">{item.source}</span>
                  <span aria-hidden="true" className="size-1 rounded-full bg-primary" />
                  <span className="font-telemetry text-[0.68rem] font-bold uppercase text-muted-foreground">
                    {item.time}
                  </span>
                </div>
                <div className="mt-2 flex min-w-0 items-start gap-2 sm:mt-2.5">
                  <h3
                    className={cn(
                      "min-w-0 flex-1 font-semibold transition-colors group-hover:text-primary",
                      index === 0 ? "text-base leading-6 sm:text-xl sm:leading-7" : "text-sm leading-5 sm:text-base sm:leading-6",
                    )}
                  >
                    {item.title}
                  </h3>
                  <ArrowRight
                    aria-hidden="true"
                    className="mt-1 hidden size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary sm:block"
                  />
                </div>
                <p
                  className={cn(
                    "mt-1.5 text-muted-foreground",
                    index === 0
                      ? "line-clamp-2 text-sm leading-6"
                      : "line-clamp-1 text-xs leading-5 sm:line-clamp-2",
                  )}
                >
                  {item.summary}
                </p>
              </div>
              {item.imageUrl ? (
                <NewsImage
                  alt={item.title}
                  className={cn(
                    "relative overflow-hidden rounded-md bg-muted",
                    index === 0 ? "aspect-[4/3]" : "aspect-[3/2]",
                  )}
                  src={item.imageUrl}
                />
              ) : (
                <span className="grid h-full min-h-16 place-items-center border-l border-border/70 text-muted-foreground transition-colors group-hover:text-primary">
                  <ArrowRight aria-hidden="true" className="size-5 transition-transform group-hover:translate-x-1" />
                </span>
              )}
            </Link>
          ))
        ) : (
          <p className="px-4 py-7 text-sm leading-6 text-muted-foreground sm:px-5">
            Пока нет новостей, привязанных к этому этапу.
          </p>
        )}
      </div>
    </section>
  );
}

function WinnerOddsCard({
  odds,
  teamLookupRows,
}: {
  odds: RaceWinnerOdds | null;
  teamLookupRows: StandingRow[];
}) {
  return (
    <section className="stitch-panel overflow-hidden p-0">
      <PanelHeader
        action={
          odds ? (
            <Link
              className="inline-flex items-center gap-1 rounded-md text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href={odds.marketUrl}
              rel="noreferrer"
              target="_blank"
            >
              Рынок
              <ExternalLink aria-hidden="true" className="size-3" />
            </Link>
          ) : undefined
        }
        icon={TrendingUp}
        meta={odds ? `${odds.source} · обновлено ${odds.updatedAt}` : "Букмекерские вероятности"}
        title="Вероятность победы"
      />
      <div className="p-4">
        {odds ? (
          <div className="grid gap-3">
            {odds.outcomes.map((outcome) => {
              const teamVisual = getTeamAssetForMarketOutcome(outcome.name, teamLookupRows);

              return (
                <div className="grid gap-1.5" key={outcome.name}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-semibold">{outcome.name}</span>
                    <span className="font-telemetry whitespace-nowrap font-bold text-muted-foreground">
                      {outcome.label}
                    </span>
                  </div>
                  <TeamColorProgress
                    color={teamVisual?.color}
                    value={outcome.probability * 100}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">
            На Polymarket пока нет рынка победителя этого этапа.
          </p>
        )}
      </div>
    </section>
  );
}

function FantasyPredictionCard({
  predictionState,
  userSignedIn,
}: {
  predictionState: PredictionState;
  userSignedIn: boolean;
}) {
  const current = predictionState.current;
  const driversById = new Map(
    predictionState.drivers.map((driver) => [driver.id, driver.name]),
  );
  const picks = [
    { label: "Победитель", value: current?.winnerDriverId },
    { label: "Поул", value: current?.poleDriverId },
    { label: "Лучший круг", value: current?.fastestLapDriverId },
    { label: "Первый сход", value: current?.dnfDriverId },
  ].map((pick) => ({
    label: pick.label,
    value: pick.value ? driversById.get(pick.value) ?? "Пилот выбран" : "—",
  }));

  return (
    <section className="order-3 stitch-panel overflow-hidden p-0 xl:order-4">
      <PanelHeader
        action={
          <span
            className={cn(
              "font-telemetry shrink-0 rounded border px-2 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.08em]",
              current
                ? "border-[rgba(57,255,20,0.4)] bg-[rgba(57,255,20,0.1)] text-[rgb(97,255,75)]"
                : "border-amber-300/50 bg-amber-400/10 text-amber-300",
            )}
          >
            {current ? "Сделан" : "Нет"}
          </span>
        }
        icon={Target}
        meta="Фэнтези-пики на этот гран-при"
        title="Прогноз на этап"
      />
      <div className="grid gap-4 p-4">
        {current ? (
          <div className="grid gap-1.5">
            {picks.map((pick) => (
              <div
                className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-background/30 px-3 py-2 text-sm"
                key={pick.label}
              >
                <span className="font-semibold text-muted-foreground">{pick.label}</span>
                <span className="min-w-0 truncate text-right font-bold">{pick.value}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">
            Собери прогноз до блокировки и сравни его с друзьями после финиша.
          </p>
        )}
        <Button asChild className="w-full" variant={current ? "secondary" : "default"}>
          <Link href={userSignedIn ? "/fantasy" : "/auth"}>
            {userSignedIn
              ? current
                ? "Изменить прогноз"
                : "Сделать прогноз"
              : "Войти, чтобы сохранить"}
          </Link>
        </Button>
      </div>
    </section>
  );
}
