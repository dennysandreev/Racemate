import { ExternalLink, MapPin, Target, TrendingUp } from "lucide-react";
import Link from "next/link";

import { AppShell } from "@/components/racemate/app-shell";
import { CircuitStatsSection } from "@/components/racemate/circuit-stats-section";
import { NavigationLoadingLink } from "@/components/racemate/navigation-loading-link";
import { RaceFlag } from "@/components/racemate/race-flag";
import { TeamColorProgress } from "@/components/racemate/team-color";
import { TrackLocalTimeBadge } from "@/components/racemate/track-local-time-badge";
import { TrackMap } from "@/components/racemate/track-map";
import { WeekendSessionBoard } from "@/components/racemate/weekend-session-board";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import type { PredictionState, RaceDetail, RaceWinnerOdds, StandingRow } from "@/types/racemate";

export const dynamic = "force-dynamic";

export default async function WeekendPage() {
  const [nextSession, weekendSessions, currentRace, user, standings] = await Promise.all([
    getNextSession(),
    getWeekendSessions(),
    getCurrentRaceDetail(),
    getSessionUser(),
    getDriverStandings(),
  ]);
  const sessionResultsPromise = getSessionResultsBySessionIds(
    weekendSessions.map((session) => session.id),
  );
  const [raceNews, winnerOdds, predictionState, resultsBySession, circuitStats, raceReplay] = await Promise.all([
    currentRace ? getRaceNews(currentRace.id, 4) : [],
    getRaceWinnerOdds(currentRace),
    getPredictionState(user?.id),
    sessionResultsPromise,
    currentRace ? getCircuitStatsForRace(currentRace.season, currentRace.round) : null,
    getCurrentRaceReplaySummary(),
  ]);
  const sessionResults = weekendSessions.map((session) => ({
    results: session.id ? resultsBySession.get(session.id) ?? [] : [],
    session,
  }));
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
      <section className="grid gap-5 py-5">
        <WeekendHero
          circuitStats={circuitStats}
          currentRace={currentRace}
          nextRace={nextSession.race}
          raceReplay={raceReplay}
          weekendStatus={nextSession.status}
        />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_23rem] xl:items-stretch">
          <section className="stitch-panel min-w-0 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b stitch-divider p-4 sm:p-5">
              <div>
                <p className="stitch-label text-muted-foreground">Уикенд</p>
                <h2 className="mt-2 font-display text-2xl font-bold">Расписание уикенда</h2>
              </div>
              <Badge variant="secondary">{sessionResults.length} сессий</Badge>
            </div>
            <div className="p-4 sm:p-5">
              <WeekendSessionBoard
                activeSessionName={nextSession.session}
                sessions={sessionResults}
              />
            </div>
          </section>

          <WinnerOddsCard className="h-full" odds={winnerOdds} teamLookupRows={standings} />
          <StageNewsCard href={raceNewsHref} items={raceNews} />
          <FantasyPredictionCard className="h-full" predictionState={predictionState} userSignedIn={Boolean(user)} />
        </div>
      </section>
    </AppShell>
  );
}

function WeekendHero({
  circuitStats,
  currentRace,
  nextRace,
  raceReplay,
  weekendStatus,
}: {
  circuitStats: Awaited<ReturnType<typeof getCircuitStatsForRace>>;
  currentRace: RaceDetail | null;
  nextRace: string;
  raceReplay: Awaited<ReturnType<typeof getCurrentRaceReplaySummary>>;
  weekendStatus: string;
}) {
  return (
    <section className="stitch-panel relative overflow-hidden p-0">
      <div className="weekend-hero-glow pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgb(225_6_0_/_0.28),transparent_24rem),linear-gradient(125deg,rgb(255_255_255_/_0.08),transparent_38%),linear-gradient(180deg,transparent,rgb(0_0_0_/_0.28))]" />
      <div className="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-stretch">
        <div className="flex flex-wrap items-center justify-between gap-3 lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            {currentRace ? (
              <RaceFlag
                className="text-xl"
                countryCode={currentRace.countryCode}
                label={currentRace.country}
                value={currentRace.countryFlag}
              />
            ) : null}
            <Badge variant="outline">Раунд {currentRace?.round ?? "—"}</Badge>
          </div>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <TrackLocalTimeBadge timezone={currentRace?.timezone} />
            <Badge className="shrink-0" variant={weekendStatus === "Live" ? "success" : "warning"}>
              {weekendStatus}
            </Badge>
          </div>
        </div>

        <div className="grid min-w-0 content-start gap-5 lg:col-span-2">
          <div>
            <p className="font-telemetry mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-primary">
              <MapPin aria-hidden="true" data-icon="inline-start" />
              {currentRace?.circuit ?? "Трасса этапа"}
            </p>
            <h1 className="font-display max-w-4xl text-balance text-3xl font-extrabold leading-tight tracking-[-0.04em] sm:text-5xl">
              {nextRace}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
              Следи за расписанием, просматривай результаты сессий и делай прогнозы на гонку.
            </p>
          </div>
          <div className="grid overflow-hidden rounded-xl border border-border/75 bg-background/32 shadow-[0_18px_60px_rgb(0_0_0_/_0.24)] backdrop-blur lg:grid-cols-[minmax(0,1fr)_23rem]">
            <div className="h-[18rem] min-w-0 p-3 sm:h-[21rem] xl:h-[24rem]">
              <TrackMap
                circuit={currentRace?.circuit ?? nextRace}
                fill
                label={nextRace}
                layout={currentRace?.layout}
              />
            </div>
            <div className="grid content-end gap-3 border-t border-border/75 p-4 lg:border-l lg:border-t-0">
              <CircuitStatsSection
                circuitName={currentRace?.circuit ?? nextRace}
                embedded
                footerAction={(
                  <Button asChild className="w-full justify-center" size="sm">
                    <Link href="https://vk.com/versportaa" rel="noreferrer" target="_blank">
                      Смотреть онлайн
                      <ExternalLink aria-hidden="true" data-icon="inline-end" />
                    </Link>
                  </Button>
                )}
                showCircuitName={false}
                stats={circuitStats}
              />
              {raceReplay ? (
                <Button asChild className="w-full justify-center" size="sm" variant="secondary">
                  <NavigationLoadingLink
                    href={raceReplay.href}
                    loadingLabel="Готовим повтор Гран-при 2025"
                    prefetch={false}
                  >
                    Гран-при 2025
                  </NavigationLoadingLink>
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StageNewsCard({
  href,
  items,
}: {
  href: string;
  items: Awaited<ReturnType<typeof getRaceNews>>;
}) {
  return (
    <section className="stitch-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b stitch-divider p-4">
        <div>
          <p className="stitch-label text-muted-foreground">Новости</p>
          <h2 className="mt-2 font-display text-2xl font-bold">
            <Link
              className="rounded-md transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href={href}
            >
              Новости этапа
            </Link>
          </h2>
        </div>
        <Button asChild size="sm" variant="secondary">
          <Link href={href}>Читать все новости</Link>
        </Button>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        {items.length ? (
          items.map((item) => (
            <Link
              className="rounded-md border border-border/70 p-4 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href={`/news/${item.slug}`}
              key={item.slug}
            >
              <Badge variant="secondary">{item.source}</Badge>
              <p className="mt-3 text-sm font-semibold leading-5">{item.title}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {item.summary}
              </p>
            </Link>
          ))
        ) : (
          <p className="rounded-md border border-border/70 p-4 text-sm leading-6 text-muted-foreground sm:col-span-2">
            Пока нет новостей, привязанных к этому этапу.
          </p>
        )}
      </div>
    </section>
  );
}

function WinnerOddsCard({
  className,
  odds,
  teamLookupRows,
}: {
  className?: string;
  odds: RaceWinnerOdds | null;
  teamLookupRows: StandingRow[];
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp aria-hidden="true" data-icon="inline-start" />
          Вероятность победы
        </CardTitle>
      </CardHeader>
      <CardContent>
        {odds ? (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{odds.marketTitle}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  По данным {odds.source} · обновлено {odds.updatedAt}
                </p>
              </div>
              <Link
                className="inline-flex items-center gap-1 rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={odds.marketUrl}
                rel="noreferrer"
                target="_blank"
              >
                Рынок
                <ExternalLink aria-hidden="true" className="size-3" />
              </Link>
            </div>
            <div className="grid gap-3">
              {odds.outcomes.map((outcome) => {
                const teamVisual = getTeamAssetForMarketOutcome(outcome.name, teamLookupRows);

                return (
                <div className="grid gap-1.5" key={outcome.name}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-medium">{outcome.name}</span>
                    <span className="whitespace-nowrap font-mono text-muted-foreground">
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
          </div>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">
            На Polymarket пока нет рынка победителя этого этапа.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function FantasyPredictionCard({
  className,
  predictionState,
  userSignedIn,
}: {
  className?: string;
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
    value: pick.value ? driversById.get(pick.value) ?? "Пилот выбран" : "Пилот",
  }));

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target aria-hidden="true" data-icon="inline-start" />
          Прогноз на этап
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {current ? (
          <div className="grid gap-2">
            {picks.map((pick) => (
              <div
                className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-muted/45 px-3 py-2 text-sm"
                key={pick.label}
              >
                <span className="text-muted-foreground">{pick.label}</span>
                <span className="min-w-0 truncate text-right font-medium">{pick.value}</span>
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
      </CardContent>
    </Card>
  );
}
