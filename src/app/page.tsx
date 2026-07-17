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
      <section className="grid gap-5 pb-5 xl:grid-cols-[minmax(0,1fr)_23rem] xl:items-start">
        <div className="grid min-w-0 gap-5">
          <CurrentRaceCard
            currentRace={currentRace}
            nextSession={nextSession}
            sessions={sessionResults}
          />
          <NewsCard items={newsItems} />
        </div>

        <aside className="grid gap-5">
          <LatestReportCard driverSlugByName={driverSlugByName} report={latestReport} />
          <HomeStandingsCarousel slides={standingSlides} />
          <HomeSidebarCarousels marketSlides={marketSlides} polls={polls} />
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
  return (
    <div className="stitch-panel relative min-h-[34rem] overflow-hidden p-0">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_0%,rgb(225_6_0_/_0.18),transparent_22rem),linear-gradient(135deg,rgb(255_255_255_/_0.05),transparent_38%)]" />
      <div className="relative grid gap-4 p-4 sm:p-5">
        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="font-telemetry flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-primary">
              <Gauge aria-hidden="true" data-icon="inline-start" />
              Следующий этап
            </p>
            <div className="ml-auto flex shrink-0 items-center justify-end gap-2">
              <Badge variant={nextSession.status === "Live" ? "success" : "warning"}>
                {nextSession.status}
              </Badge>
              <span
                aria-label="Сезон 2026"
                className="hidden h-5 items-center gap-2 sm:inline-flex"
              >
                <span aria-hidden="true" className="h-4 w-px bg-primary/65" />
                <span className="text-[0.62rem] font-semibold leading-none text-muted-foreground">Сезон</span>
                <span aria-hidden="true" className="size-1 rounded-full bg-primary/70" />
                <span className="font-telemetry text-xs font-extrabold leading-none text-foreground">2026</span>
              </span>
            </div>
          </div>
          <h1 className="font-display max-w-4xl text-balance text-2xl font-extrabold leading-tight tracking-[-0.04em] sm:text-3xl lg:text-4xl">
            {formatSessionName(nextSession.session)}
          </h1>
          <p className="mt-2 flex min-w-0 items-center gap-2 text-sm font-semibold text-muted-foreground sm:text-base">
            <MapPin aria-hidden="true" className="size-4 shrink-0 text-primary" />
            <span className="shrink-0 font-telemetry text-[0.68rem] font-bold uppercase tracking-[0.08em]">
              На трассе
            </span>
            <span className="min-w-0 truncate">{nextSession.circuit}</span>
          </p>
        </div>

        <HomeSessionStrip activeSessionName={nextSession.session} sessions={sessions} />

        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(13rem,15rem)]">
          <div className="h-[14rem] min-w-0 max-w-full overflow-hidden sm:h-[15.5rem] lg:h-[16.5rem]">
            <TrackMap compact fill circuit={nextSession.circuit} label={nextSession.race} layout={currentRace?.layout} unframed />
          </div>
          <div className="grid min-w-0 content-between justify-items-center gap-3 px-1 py-2 text-center lg:justify-items-stretch lg:py-3 lg:text-left">
            <div>
              <p className="font-telemetry text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                {currentRace?.country ?? "Гран-при"}
              </p>
              <p className="mt-2 font-display text-xl font-bold leading-tight">
                {nextSession.race}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {nextSession.startsAt}
              </p>
            </div>
            <Button asChild className="mx-auto w-full max-w-sm lg:mx-0 lg:max-w-none" variant="secondary">
              <Link href="/weekend" prefetch={false}>
                Перейти к этапу
                <ArrowRight aria-hidden="true" data-icon="inline-end" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
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
                className="group grid min-w-0 grid-cols-[minmax(0,1fr)_6.5rem] gap-3 p-4 transition-colors hover:bg-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[minmax(0,1fr)_10rem] sm:gap-5 sm:p-5"
                href={`/news/${item.slug}`}
                key={item.slug}
                prefetch={false}
              >
                <div className="min-w-0 self-center">
                  <NewsMeta item={item} />
                  <div className="mt-3 flex min-w-0 items-start gap-2">
                    <h2 className="min-w-0 flex-1 text-base font-semibold leading-6 transition-colors group-hover:text-primary sm:text-lg">
                      {item.title}
                    </h2>
                    <ArrowRight
                      aria-hidden="true"
                      className="mt-1 hidden size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary sm:block"
                    />
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
                    {item.summary}
                  </p>
                </div>
                {item.imageUrl ? (
                  <NewsImage
                    alt=""
                    className="relative aspect-[4/3] self-center overflow-hidden rounded-md bg-muted"
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
  const visibleTag = item.tags.find((tag) => tag.type === "team") ?? item.tags.find((tag) => tag.type === "race") ?? item.tags[0];

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
