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

  const weekendSessionsPromise = getWeekendSessions();
  const sessionResultsPromise = weekendSessionsPromise.then(async (sessions) => {
    const visibleSessions = sessions.slice(0, 5);
    const resultsBySession = await getSessionResultsBySessionIds(
      visibleSessions.map((session) => session.id),
    );

    return visibleSessions.map((session) => ({
      results: session.id ? resultsBySession.get(session.id) ?? [] : [],
      session,
    }));
  });
  const [newsResult, nextSession, standings, constructorStandings, currentRace, championOdds, constructorOdds, polls, latestReport, queryReport, driverSlugByName, sessionResults] =
    await Promise.all([
      getNewsItems({ pageSize: 5 }),
      getNextSession(),
      getDriverStandings(),
      getConstructorStandings(),
      getCurrentRaceDetail(),
      getSeasonChampionOdds(),
      getConstructorChampionOdds(),
      getPolls(),
      getLatestGrandPrixReport(),
      getGrandPrixReportBySlug(query.raceReport),
      getDriverSlugMap(),
      sessionResultsPromise,
    ]);
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
        <CurrentRaceCard
          currentRace={currentRace}
          nextSession={nextSession}
          sessions={sessionResults}
        />

        <aside className="grid gap-5 xl:col-start-2 xl:row-span-2 xl:row-start-1">
          <LatestReportCard driverSlugByName={driverSlugByName} report={latestReport} />
          <HomeStandingsCarousel slides={standingSlides} />
          <HomeSidebarCarousels marketSlides={marketSlides} polls={polls} />
        </aside>

        <div className="grid min-w-0 gap-5 xl:col-start-1">
          <NewsCard items={newsItems} />
        </div>
      </section>
      <GrandPrixReportDialog driverSlugByName={driverSlugByName} open={isReportOpen} report={dialogReport} />
    </AppShell>
  );
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
              <Badge className="hidden sm:inline-flex" variant="outline">Сезон 2026</Badge>
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
          <div className="grid min-w-0 content-between gap-3 px-1 py-2 lg:py-3">
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
            <Button asChild className="w-full" variant="secondary">
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
      <CardContent className="grid gap-3 pt-4 sm:pt-4">
        {items.length ? items.map((item) => (
          <Link
            className="grid gap-3 rounded-md border border-border p-4 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href={`/news/${item.slug}`}
            key={item.slug}
            prefetch={false}
          >
            <NewsMeta item={item} />
            <h2 className="text-lg font-semibold leading-6">{item.title}</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              {item.summary}
            </p>
            <NewsImage alt="" src={item.imageUrl} />
          </Link>
        )) : (
          <p className="rounded-md border border-border/70 p-4 text-sm text-muted-foreground">
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
