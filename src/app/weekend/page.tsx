import {
  CalendarDays,
  ExternalLink,
  MapPin,
  Newspaper,
  Target,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import type { ComponentType, ReactNode, SVGProps } from "react";

import { FantasyLockCountdown } from "@/components/fantasy/fantasy-lock-countdown";
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
import { cn } from "@/lib/utils";
import type { PredictionState, RaceDetail, RaceWinnerOdds, StandingRow } from "@/types/racemate";

export const dynamic = "force-dynamic";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

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
      <section className="grid gap-4 py-5 sm:gap-5">
        <WeekendHero
          circuitStats={circuitStats}
          currentRace={currentRace}
          nextRace={nextSession.race}
          nextSession={nextSession}
          raceReplay={raceReplay}
          weekendStatus={nextSession.status}
        />

        <div className="grid gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_23rem] xl:items-start">
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
                sessions={sessionResults}
              />
            </div>
          </section>

          <div className="grid gap-4 sm:gap-5">
            <FantasyPredictionCard predictionState={predictionState} userSignedIn={Boolean(user)} />
            <WinnerOddsCard odds={winnerOdds} teamLookupRows={standings} />
          </div>
        </div>

        <StageNewsPanel href={raceNewsHref} items={raceNews} />
      </section>
    </AppShell>
  );
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
      <div className="relative grid gap-5 p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
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
            {currentRace?.country ? (
              <span className="text-sm font-semibold text-muted-foreground">{currentRace.country}</span>
            ) : null}
          </div>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <TrackLocalTimeBadge timezone={currentRace?.timezone} />
            <Badge className="shrink-0" variant={weekendStatus === "Live" ? "success" : "warning"}>
              {weekendStatus}
            </Badge>
          </div>
        </div>

        <div className="min-w-0">
          <p className="font-telemetry mb-2.5 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-primary">
            <MapPin aria-hidden="true" className="size-3.5" />
            {currentRace?.circuit ?? "Трасса этапа"}
          </p>
          <h1 className="max-w-4xl text-balance font-display text-3xl font-extrabold leading-tight tracking-[-0.04em] sm:text-5xl">
            {nextRace}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {!isWeekendDone ? (
              <FantasyLockCountdown
                locked={false}
                lockedLabel=""
                prefix={`${formatSessionName(nextSession.session)}`}
                startsAtIso={nextSession.startsAtIso}
              />
            ) : null}
            <span className="text-sm font-semibold text-muted-foreground">
              {isWeekendDone
                ? "Этап завершен — смотри результаты сессий и повтор гонки."
                : `Ближайшая сессия: ${formatSessionName(nextSession.session)} · ${nextSession.startsAt}`}
            </span>
          </div>
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
    <section className="stitch-panel overflow-hidden p-0">
      <PanelHeader
        action={
          <Button asChild size="sm" variant="secondary">
            <Link href={href}>Все новости</Link>
          </Button>
        }
        icon={Newspaper}
        meta="Материалы, привязанные к этому гран-при"
        title="Новости этапа"
      />
      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
        {items.length ? (
          items.map((item) => (
            <Link
              className="group flex min-w-0 flex-col rounded-md border border-border/70 bg-background/30 p-4 transition-colors hover:border-primary/40 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href={`/news/${item.slug}`}
              key={item.slug}
            >
              <Badge className="self-start" variant="secondary">{item.source}</Badge>
              <p className="mt-3 text-sm font-bold leading-5 transition-colors group-hover:text-primary">
                {item.title}
              </p>
              <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">{item.summary}</p>
            </Link>
          ))
        ) : (
          <p className="rounded-md border border-border/70 p-4 text-sm leading-6 text-muted-foreground sm:col-span-2 xl:col-span-4">
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
    <section className="stitch-panel overflow-hidden p-0">
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
