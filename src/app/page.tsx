import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Gauge,
  Newspaper,
  Trophy,
  ArrowRight,
  MapPin,
} from "lucide-react";

import { AppShell } from "@/components/racemate/app-shell";
import { GrandPrixReportDialog } from "@/components/racemate/grand-prix-report-dialog";
import { GrandPrixPodiumPreview } from "@/components/racemate/grand-prix-podium-preview";
import {
  HomeSidebarCarousels,
  HomeStandingsCarousel,
  type HomeMarketSlide,
  type HomeStandingSlide,
} from "@/components/racemate/home-sidebar-carousels";
import { HomeSessionStrip } from "@/components/racemate/home-session-strip";
import { NewsImage } from "@/components/racemate/news-image";
import { NewsTagBadge } from "@/components/racemate/news-tag-badge";
import { RaceFlag } from "@/components/racemate/race-flag";
import type { SessionWithResults } from "@/components/racemate/session-results-dialog";
import { TrackMap } from "@/components/racemate/track-map";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getTeamAssetForMarketOutcome, getTeamProfileAsset } from "@/data/f1-assets";
import {
  getConstructorStandings,
  getConstructorChampionOdds,
  getCurrentRaceDetail,
  getDriverStandings,
  getDriverSlugMap,
  getGrandPrixReportBySlug,
  getLatestGrandPrixReport,
  getNewsItems,
  getNextSession,
  getPolls,
  getSessionResultsBySessionIds,
  getSeasonChampionOdds,
  getWeekendSessions,
} from "@/data/racemate-repository";
import type {
  GrandPrixReport,
  NextSession,
  NewsItem,
  RaceDetail,
  StandingRow,
} from "@/types/racemate";
import { normalizeAuthNext } from "@/lib/auth-redirect";
import { getSessionUser } from "@/lib/auth";
import { CURRENT_F1_SEASON } from "@/lib/season-navigation";
import { withServerTtlCache } from "@/lib/server-ttl-cache";
import { formatSessionName } from "@/lib/session-display";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; next?: string; raceReport?: string }>;
}) {
  const query = await searchParams;

  if (query.code) {
    const callbackParams = new URLSearchParams({
      code: query.code,
      next: normalizeAuthNext(query.next),
    });

    redirect(`/auth/callback?${callbackParams.toString()}`);
  }

  const pollsPromise = getSessionUser().then((user) => getPolls({ userId: user?.id }));
  const [publicData, polls, queryReport] = await Promise.all([
    withServerTtlCache(
      "public:home",
      15_000,
      getHomePagePublicData,
      { staleWhileRevalidateMs: 5 * 60_000 },
    ),
    pollsPromise,
    getGrandPrixReportBySlug(query.raceReport),
  ]);
  const {
    championOdds,
    constructorOdds,
    constructorStandings,
    currentRace,
    driverSlugByName,
    latestReport,
    newsResult,
    nextSession,
    sessionResults,
    standings,
  } = publicData;
  const newsItems = newsResult.items;
  const dialogReport = queryReport;
  const isReportOpen = Boolean(query.raceReport && dialogReport?.raceSlug === query.raceReport);
  const marketSlides: HomeMarketSlide[] = [
    buildMarketSlide({
      emptyText: "На Polymarket пока нет рынка чемпионства сезона.",
      id: "drivers",
      odds: championOdds,
      standings,
      title: "Шансы на титул",
    }),
    buildMarketSlide({
      emptyText: "На Polymarket пока нет рынка Кубка конструкторов.",
      id: "constructors",
      odds: constructorOdds,
      standings,
      title: "Шансы на Кубок конструкторов",
    }),
  ];
  const standingSlides: HomeStandingSlide[] = [
    {
      actionHref: "/leaderboard",
      actionLabel: "Подробнее",
      id: "drivers",
      rows: standings.slice(0, 6).map((row) => ({
        color: row.teamColor,
        href: row.driverSlug ? `/drivers/${row.driverSlug}` : undefined,
        meta: row.team,
        name: row.driver,
        points: row.points,
        position: row.position,
      })),
      title: "Личный зачет",
    },
    {
      actionHref: "/leaderboard?table=constructors",
      actionLabel: "Подробнее",
      id: "constructors",
      rows: constructorStandings.slice(0, 6).map((row) => {
        const profile = getTeamProfileAsset(row.teamCode) ?? getTeamProfileAsset(row.team);

        return {
          color: row.teamColor,
          href: profile ? `/teams/${profile.slug}` : undefined,
          meta: row.wins ? `${row.wins} побед` : "Побед пока нет",
          name: row.team,
          points: row.points,
          position: row.position,
        };
      }),
      title: "Кубок конструкторов",
    },
  ];

  return (
    <AppShell>
      <header className="sr-only">
        <h1>RaceSide - Формула-1 на русском</h1>
        <p>
          Новости, календарь, результаты и статистика чемпионата Формулы-1.
        </p>
      </header>
      <section className="grid gap-5 pb-5 xl:grid-cols-[minmax(0,1fr)_23rem] xl:items-start">
        <div className="contents xl:grid xl:min-w-0 xl:gap-5">
          <div className="order-1 xl:order-none">
            <CurrentRaceCard
              currentRace={currentRace}
              nextSession={nextSession}
              sessions={sessionResults}
            />
          </div>
          <div className="order-5 xl:order-none">
            <NewsCard items={newsItems} />
          </div>
        </div>

        <aside className="contents xl:grid xl:gap-5">
          <div className="order-2 xl:order-none">
            <LatestReportCard driverSlugByName={driverSlugByName} report={latestReport} />
          </div>
          <div className="order-3 xl:order-none">
            <HomeStandingsCarousel slides={standingSlides} />
          </div>
          <div className="order-4 grid gap-5 xl:order-none">
            <HomeSidebarCarousels marketSlides={marketSlides} polls={polls} />
          </div>
        </aside>
      </section>
      <GrandPrixReportDialog driverSlugByName={driverSlugByName} open={isReportOpen} report={dialogReport} />
    </AppShell>
  );
}

async function getHomePagePublicData() {
  const weekendSessionsPromise = getWeekendSessions();
  const sessionResultsPromise = weekendSessionsPromise.then(async (sessions) => {
    const visibleSessions = sessions.slice(0, 5);
    const resultsBySession = await getSessionResultsBySessionIds(
      visibleSessions.map((session) => session.id),
      CURRENT_F1_SEASON,
    );

    return visibleSessions.map((session) => ({
      results: session.id ? resultsBySession.get(session.id) ?? [] : [],
      session,
    }));
  });
  const [
    newsResult,
    nextSession,
    standings,
    constructorStandings,
    currentRace,
    championOdds,
    constructorOdds,
    latestReport,
    driverSlugByName,
    sessionResults,
  ] = await Promise.all([
    getNewsItems({ pageSize: 7 }),
    getNextSession(),
    getDriverStandings(CURRENT_F1_SEASON),
    getConstructorStandings(CURRENT_F1_SEASON),
    getCurrentRaceDetail(),
    getSeasonChampionOdds(),
    getConstructorChampionOdds(),
    getLatestGrandPrixReport(),
    getDriverSlugMap(),
    sessionResultsPromise,
  ]);

  return {
    championOdds,
    constructorOdds,
    constructorStandings,
    currentRace,
    driverSlugByName,
    latestReport,
    newsResult,
    nextSession,
    sessionResults,
    standings,
  };
}

function CurrentRaceCard({
  currentRace,
  nextSession,
  sessions,
}: {
  currentRace: RaceDetail | null;
  nextSession: NextSession;
  sessions: SessionWithResults[];
}) {
  const raceTitleLength = Array.from(nextSession.race).length;
  const raceTitleSizeClass = raceTitleLength > 32
    ? "text-[1.6rem] sm:text-[1.9rem] lg:text-[2rem]"
    : raceTitleLength > 22
      ? "text-[1.75rem] sm:text-[2.1rem] lg:text-[2.25rem]"
      : "text-3xl sm:text-4xl lg:text-[2.75rem]";

  return (
    <section className="stitch-panel overflow-hidden p-0" aria-labelledby="next-race-title">
      <header className="flex min-h-12 items-center justify-between gap-3 border-b border-border/70 px-4 py-3 sm:px-5">
        <p className="font-telemetry flex shrink-0 items-center gap-2 whitespace-nowrap text-[0.66rem] font-bold uppercase tracking-[0.08em] text-primary sm:text-xs sm:tracking-[0.12em]">
          <Gauge aria-hidden="true" className="size-4 shrink-0" />
          <span>Следующий этап</span>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={nextSession.status === "Live" ? "success" : "warning"}>
            {nextSession.status}
          </Badge>
          <span className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
            <span className="h-3 w-px bg-primary/70" aria-hidden="true" />
            Сезон <span className="font-telemetry font-bold text-foreground">2026</span>
          </span>
        </div>
      </header>

      <div className="grid min-w-0 lg:grid-cols-[minmax(16rem,0.82fr)_minmax(0,1.18fr)]">
        <div className="order-1 min-w-0 px-4 pb-2 pt-5 sm:px-6 sm:pt-6 lg:col-start-1 lg:row-start-1 lg:border-r lg:pb-6">
          <div className="grid gap-3">
            <div className="flex items-center gap-2 font-telemetry text-[0.7rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">
              <RaceFlag
                className="h-4 w-6"
                countryCode={currentRace?.countryCode}
                label={currentRace?.country ?? nextSession.race}
                value={currentRace?.countryFlag}
              />
              <span>Раунд {currentRace?.round ?? "—"}</span>
            </div>
            <h2
              className={`max-w-3xl text-balance font-display font-extrabold leading-[1.04] ${raceTitleSizeClass}`}
              id="next-race-title"
            >
              {nextSession.race}
            </h2>
            <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-muted-foreground sm:text-base">
              <MapPin aria-hidden="true" className="size-4 shrink-0 text-primary" />
              <span className="min-w-0 truncate">{nextSession.circuit}</span>
            </p>
          </div>
          <div className="mt-6 hidden border-t border-border/70 pt-4 lg:block">
            <p className="font-telemetry text-[0.62rem] font-bold uppercase tracking-[0.1em] text-primary">
              Следующая сессия
            </p>
            <p className="mt-1.5 text-sm font-bold text-foreground">
              {formatSessionName(nextSession.session)}
            </p>
            <Button asChild className="mt-5 w-full" variant="secondary">
              <Link href="/weekend" prefetch={false}>
                Перейти к этапу
                <ArrowRight aria-hidden="true" data-icon="inline-end" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="order-2 min-w-0 px-4 pb-5 sm:px-6 lg:col-span-2 lg:row-start-2 lg:border-t lg:px-4 lg:pb-4">
          <HomeSessionStrip activeSessionName={nextSession.session} embedded sessions={sessions} />
        </div>

        <div className="order-3 h-[13rem] min-w-0 border-t border-border/70 p-3 sm:h-[16rem] sm:p-4 lg:col-start-2 lg:row-start-1 lg:h-auto lg:min-h-[18rem] lg:border-l lg:border-t-0 lg:p-5">
          <TrackMap compact fill circuit={nextSession.circuit} label={nextSession.race} layout={currentRace?.layout} unframed />
        </div>

        <div className="order-4 flex flex-col gap-3 border-t border-border/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:hidden">
          <div className="min-w-0">
            <p className="font-telemetry text-[0.64rem] font-bold uppercase tracking-[0.1em] text-primary">
              Ближайшая сессия
            </p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <p className="text-sm font-bold text-foreground">{formatSessionName(nextSession.session)}</p>
              <p className="text-xs text-muted-foreground">{nextSession.startsAt}</p>
            </div>
          </div>
          <Button asChild className="w-full shrink-0 sm:w-auto lg:w-full" variant="secondary">
            <Link href="/weekend" prefetch={false}>
              Перейти к этапу
              <ArrowRight aria-hidden="true" data-icon="inline-end" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function NewsCard({ items }: { items: NewsItem[] }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 pb-3 sm:pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            <Newspaper aria-hidden="true" className="size-4" />
          </span>
          Свежие новости
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 sm:p-0">
        {items.length ? (
          <div className="divide-y divide-border/70">
            {items.map((item) => (
              <Link
                className="group grid min-w-0 grid-cols-[minmax(0,1fr)_5.25rem] gap-x-3 gap-y-2.5 p-4 transition-colors hover:bg-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[minmax(0,1fr)_8rem] sm:gap-x-5 sm:p-5"
                href={`/news/${item.slug}`}
                key={item.slug}
                prefetch={false}
              >
                <div className="col-span-2 min-w-0">
                  <NewsMeta item={item} />
                </div>
                <h2 className="col-span-2 min-w-0 text-base font-semibold leading-6 transition-colors group-hover:text-primary sm:text-lg">
                  {item.title}
                </h2>
                <p className="line-clamp-3 min-w-0 self-center text-sm leading-6 text-muted-foreground sm:line-clamp-4">
                  {item.summary}
                </p>
                {item.imageUrl ? (
                  <NewsImage
                    alt={item.title}
                    className="relative aspect-square self-center overflow-hidden rounded-md bg-muted sm:aspect-[4/3]"
                    src={item.imageUrl}
                  />
                ) : (
                  <span className="grid min-h-20 place-items-center border-l border-border/70 text-muted-foreground group-hover:text-primary">
                    <ArrowRight aria-hidden="true" className="size-5 transition-transform group-hover:translate-x-1" />
                  </span>
                )}
              </Link>
            ))}
          </div>
        ) : (
          <p className="px-5 py-7 text-sm text-muted-foreground">
            Свежих новостей пока нет.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function NewsMeta({ item }: { item: NewsItem }) {
  const visibleTag = item.tags.find((tag) => tag.type === "race");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline">{item.source}</Badge>
      {visibleTag ? <NewsTagBadge tag={visibleTag} /> : null}
      <span className="font-telemetry text-[0.68rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        {item.time}
      </span>
    </div>
  );
}

function LatestReportCard({
  driverSlugByName,
  report,
}: {
  driverSlugByName: Record<string, string>;
  report: GrandPrixReport | null;
}) {
  const isReady = isGrandPrixReportReady(report);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 pb-3 sm:pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            <Trophy aria-hidden="true" className="size-4" />
          </span>
          Отчет прошлого Гран-при
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 sm:pt-4">
        {report && isReady ? (
          <GrandPrixPodiumPreview
            driverSlugByName={driverSlugByName}
            href={`/?raceReport=${report.raceSlug}`}
            report={report}
          />
        ) : report ? (
          <div className="rounded-lg border border-border bg-muted/45 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">{report.raceName}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {report.circuitName} · {report.raceDate}
                </p>
              </div>
              <Badge variant="warning">Формируется</Badge>
            </div>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Отчет уже в процессе формирования. Как только соберем классификацию, темп и ключевые события,
              здесь появится полный разбор Гран-при.
            </p>
          </div>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">
            Отчет появится после завершения гонки и синхронизации результатов.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function isGrandPrixReportReady(report: GrandPrixReport | null) {
  return Boolean(report && (report.status === "ready" || report.status === "partial"));
}

function buildMarketSlide({
  emptyText,
  id,
  odds,
  standings,
  title,
}: {
  emptyText: string;
  id: HomeMarketSlide["id"];
  odds: Awaited<ReturnType<typeof getSeasonChampionOdds>>;
  standings: StandingRow[];
  title: string;
}): HomeMarketSlide {
  return {
    emptyText,
    id,
    title,
    odds: odds
      ? {
          ...odds,
          outcomes: odds.outcomes.map((outcome) => ({
            ...outcome,
            color: getTeamAssetForMarketOutcome(outcome.name, standings)?.color,
          })),
        }
      : null,
  };
}
