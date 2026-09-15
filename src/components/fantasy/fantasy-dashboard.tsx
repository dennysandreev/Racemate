import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Crosshair,
  Flag,
  ListOrdered,
  Lock,
  Users,
} from "lucide-react";
import Link from "next/link";

import { FantasyLeagueAvatar } from "@/components/fantasy/fantasy-league-avatar";
import { FantasyLockCountdown } from "@/components/fantasy/fantasy-lock-countdown";
import { FantasySectionNav } from "@/components/fantasy/fantasy-section-nav";
import { FantasyTrackVisualImage } from "@/components/fantasy/fantasy-track-visual";
import { PreviousPredictionResultButton } from "@/components/racemate/fantasy-prediction-tools";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getFantasyTrackVisual } from "@/data/fantasy-track-assets";
import { cn } from "@/lib/utils";
import type {
  GlobalFantasyLeaderboardRow,
  LeagueSummary,
  PredictionState,
} from "@/types/racemate";

type LeaderboardPreview = {
  currentUser: (GlobalFantasyLeaderboardRow & { userId: string }) | null;
  topRows: GlobalFantasyLeaderboardRow[];
  updatedAt: string;
};

export function FantasyDashboard({
  leaderboard,
  leagues,
  predictionState,
  signedIn,
}: {
  leaderboard: LeaderboardPreview;
  leagues: LeagueSummary[];
  predictionState: PredictionState;
  signedIn: boolean;
}) {
  const current = predictionState.current;
  const race = predictionState.race;
  const qualificationComplete = current?.poleDriverId ? 1 : 0;
  const dnfComplete = current?.dnfPickKind === "none" || Boolean(current?.dnfDriverId);
  const raceComplete = Math.min(
    14,
    (current?.top10DriverIds.length ?? 0)
      + Number(Boolean(current?.fastestLapDriverId))
      + Number(dnfComplete)
      + Number(Boolean(current?.topScoringTeamId))
      + Number(Boolean(current?.fastestPitStopTeamId)),
  );
  const myLeagues = leagues.filter((league) => league.isMember || league.isOwner).slice(0, 3);
  const nextScope = !race?.poleLocked && !qualificationComplete ? "qualification" : "race";
  const allLocked = Boolean(race?.poleLocked && race?.raceLocked);
  return (
    <section className="grid gap-4 pb-8 sm:gap-5">
      <section className="overflow-hidden rounded-xl border border-border/70 bg-card">
        <FantasySectionNav active="overview" integrated />

        <div className="relative min-h-[15rem] overflow-hidden bg-card">
          {race?.fantasyVisual ? (
            <FantasyTrackVisualImage
              className="absolute inset-0 h-full aspect-auto rounded-none border-0"
              preload
              showCredit={false}
              sizes="(max-width: 1279px) 100vw, 1180px"
              visual={race.fantasyVisual}
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center bg-muted/30">
              <Flag aria-hidden="true" className="size-20 text-muted-foreground/25" />
            </div>
          )}

          <div aria-hidden="true" className="fantasy-dashboard-hero-scrim absolute inset-0" />

          <div className="relative flex min-h-[15rem] max-w-2xl flex-col px-5 py-5 text-foreground sm:px-8 lg:px-9">
            <div className="flex flex-1 flex-col justify-center">
              <p className="font-telemetry text-xs font-black uppercase tracking-[0.12em] text-primary">
                Следующая гонка
              </p>
              <h1 className="mt-3 max-w-2xl text-balance font-display text-3xl font-black tracking-[-0.03em] sm:text-4xl lg:text-5xl">
                {race?.name ?? "Следующий этап"}
              </h1>
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-semibold text-foreground/80">
                {race ? (
                  <span className="inline-flex items-center gap-2">
                    <CalendarDays aria-hidden="true" className="size-4 text-primary" />
                    Этап {race.round}, сезон {race.season}
                  </span>
                ) : null}
                {!allLocked && race ? (
                  <FantasyLockCountdown
                    locked={false}
                    lockedLabel="Закрыто"
                    prefix={nextScope === "qualification" ? "До квалификации" : "До гонки"}
                    startsAtIso={nextScope === "qualification" ? race.qualifyingStartsAtIso : race.raceStartsAtIso}
                  />
                ) : (
                  <Badge variant="warning">
                    <Lock aria-hidden="true" data-icon="inline-start" />
                    Прогноз закрыт
                  </Badge>
                )}
              </div>

              <div className="mt-4 max-w-xl overflow-hidden rounded-lg border border-border/70 bg-background/80 backdrop-blur-sm">
                <div className="flex min-h-9 items-center justify-between gap-3 border-b border-border/65 px-3 sm:px-4">
                  <p className="inline-flex items-center gap-2 text-xs font-bold">
                    <Crosshair aria-hidden="true" className="size-3.5 text-primary" />
                    Сделать прогноз
                  </p>
                  <span className="font-telemetry text-[0.58rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                    Выбери сессию
                  </span>
                </div>
                <nav aria-label="Сделать прогноз" className="grid grid-cols-2">
                  <PredictionScopeLink
                    completed={qualificationComplete === 1}
                    href="/fantasy/prediction?scope=qualification"
                    label="Квалификация"
                  />
                  <PredictionScopeLink
                    completed={raceComplete === 14}
                    href="/fantasy/prediction?scope=race"
                    label="Гонка"
                  />
                </nav>
              </div>
            </div>
          </div>
        </div>
      </section>

      <DashboardSummaryRail
        leaderboard={leaderboard}
        predictionState={predictionState}
        qualificationComplete={qualificationComplete}
        raceComplete={raceComplete}
        signedIn={signedIn}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(22rem,0.92fr)]">
        <MyLeagues leagues={myLeagues} signedIn={signedIn} />
        <LeaderboardPreview leaderboard={leaderboard} />
      </div>
    </section>
  );
}

function PredictionScopeLink({
  completed,
  href,
  label,
}: {
  completed: boolean;
  href: string;
  label: string;
}) {
  return (
    <Link
      className="group inline-flex min-h-11 min-w-0 items-center justify-between gap-2 border-r border-border/65 px-3 py-2.5 font-display text-xs font-bold transition-colors last:border-r-0 hover:bg-accent hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:min-h-12 sm:px-4 sm:text-sm"
      href={href}
    >
      <span className="inline-flex min-w-0 items-center gap-2">
        <span className="truncate">{label}</span>
        {completed ? <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-success" /> : null}
      </span>
      <ArrowRight aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  );
}

function DashboardSummaryRail({
  leaderboard,
  predictionState,
  qualificationComplete,
  raceComplete,
  signedIn,
}: {
  leaderboard: LeaderboardPreview;
  predictionState: PredictionState;
  qualificationComplete: number;
  raceComplete: number;
  signedIn: boolean;
}) {
  const currentUser = leaderboard.currentUser;
  const previous = predictionState.previousResult;
  const previousVisual = previous
    ? getFantasyTrackVisual(previous.season ?? 2026, previous.round, previous.raceName)
    : null;
  const averageScore = predictionState.seasonSummary.scoredPredictionCount
    ? (predictionState.seasonSummary.totalScore ?? 0) / predictionState.seasonSummary.scoredPredictionCount
    : null;

  return (
    <section className="overflow-hidden rounded-xl border border-border/70 bg-card/75">
      <div className="grid lg:grid-cols-[minmax(0,1.55fr)_minmax(17rem,0.75fr)]">
        <div className="min-w-0 border-b border-border/65 px-4 py-3 sm:px-5 sm:py-4 lg:border-b-0 lg:border-r">
          <div className="flex min-w-0 items-end justify-between gap-5">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-muted-foreground">Очки за сезон</p>
              <p className="mt-1 flex items-baseline gap-2">
                <strong className="font-telemetry text-3xl font-black leading-none sm:text-4xl">
                  {signedIn ? String(predictionState.seasonSummary.totalScore ?? "-") : "-"}
                </strong>
                <span className="text-xs font-semibold text-muted-foreground">очков</span>
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-telemetry text-lg font-black">{qualificationComplete + raceComplete} из 15</p>
              <p className="mt-0.5 text-[0.65rem] font-semibold text-muted-foreground">прогноз заполнен</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 border-t border-border/65 pt-3">
            <SeasonMetric label="Среднее за этап" value={signedIn ? formatScore(averageScore) : "-"} />
            <SeasonMetric label="Место" value={signedIn && currentUser ? String(currentUser.rank) : "-"} />
            <SeasonMetric label="Прогнозов" value={signedIn ? String(predictionState.seasonSummary.predictionCount) : "-"} />
          </div>
        </div>

        <PreviousPredictionResultButton
          className="group grid min-w-0 cursor-pointer grid-cols-[3.5rem_minmax(0,1fr)_2.25rem] items-center gap-3 border-l-2 border-l-primary px-4 py-3 text-left transition-colors hover:bg-accent/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[5rem_minmax(0,1fr)_2.5rem] sm:gap-4 sm:px-5 sm:py-4"
          previousResult={previous}
        >
          {previousVisual ? (
            <FantasyTrackVisualImage
              className="size-14 shrink-0 aspect-square rounded-lg border border-border/60 sm:size-20"
              sizes="(max-width: 639px) 56px, 80px"
              variant="thumb"
              visual={previousVisual}
            />
          ) : (
            <span className="grid size-14 shrink-0 place-items-center rounded-lg bg-muted/30 sm:size-20">
              <Flag aria-hidden="true" className="size-5 text-muted-foreground/35" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-muted-foreground">Прошлый этап</span>
            <span className="mt-0.5 block truncate font-display text-sm font-bold sm:mt-1 sm:text-base">{previous?.raceName ?? "Итоги впереди"}</span>
            <span className="mt-0.5 block font-telemetry text-xs font-black text-primary sm:mt-1 sm:text-sm">
              {previous ? `+${previous.score} очков` : "После первого подсчёта"}
            </span>
          </span>
          <span className="grid size-9 place-items-center rounded-full border border-border/70 bg-background/55 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary">
            <ArrowRight aria-hidden="true" className="size-4" />
          </span>
        </PreviousPredictionResultButton>
      </div>
    </section>
  );
}

function SeasonMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-r border-border/65 px-2 text-center first:pl-0 last:border-r-0 last:pr-0 sm:px-4">
      <p className="font-telemetry text-base font-black sm:text-lg">{value}</p>
      <p className="mt-0.5 text-[0.625rem] font-semibold leading-tight text-muted-foreground sm:text-xs">{label}</p>
    </div>
  );
}

function MyLeagues({ leagues, signedIn }: { leagues: LeagueSummary[]; signedIn: boolean }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border/70 bg-card/75">
      <header className="flex h-14 items-center px-4 py-2 sm:px-5">
        <Link
          className="group inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href="/fantasy/leagues"
        >
          <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
            <Users aria-hidden="true" className="size-4" />
          </span>
          <h2 className="font-display text-base font-bold transition-colors group-hover:text-primary">Мои лиги</h2>
        </Link>
      </header>
      {signedIn && leagues.length ? (
        <div className="px-4 pb-2 sm:px-5">
          {leagues.map((league) => (
            <Link
              className="grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-t border-border/60 py-2.5 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href={league.id ? `/fantasy/leagues/${league.id}` : "/fantasy/leagues"}
              key={league.id ?? league.name}
            >
              <FantasyLeagueAvatar avatarUrl={league.avatarUrl} className="size-11" name={league.name} />
              <span className="min-w-0">
                <span className="block truncate font-display text-base font-bold">{league.name}</span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">
                  {league.members} участников, лидер {league.leader}
                </span>
              </span>
              <span className="text-right">
                <span className="block font-telemetry text-sm font-black">Открыть</span>
                <span className="mt-1 block text-[0.65rem] text-muted-foreground">таблицу</span>
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mx-5 mb-5 flex min-h-36 flex-col items-start justify-center border-t border-border/60 py-5 sm:mx-6">
          <Users aria-hidden="true" className="size-6 text-primary" />
          <p className="mt-3 font-bold">С друзьями интереснее</p>
          <p className="mt-1 text-sm text-muted-foreground">Создай лигу или войди по приглашению.</p>
          <Button asChild className="mt-4" size="sm" variant="secondary">
            <Link href={signedIn ? "/fantasy/leagues" : "/auth?next=%2Ffantasy%2Fleagues"}>
              {signedIn ? "Открыть лиги" : "Войти"}
            </Link>
          </Button>
        </div>
      )}
    </section>
  );
}

function LeaderboardPreview({ leaderboard }: { leaderboard: LeaderboardPreview }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border/70 bg-card/75">
      <header className="flex h-14 items-center px-4 py-2 sm:px-5">
        <Link
          className="group inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href="/fantasy/leaderboard"
        >
          <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
            <ListOrdered aria-hidden="true" className="size-4" />
          </span>
          <h2 className="font-display text-base font-bold transition-colors group-hover:text-primary">Лидеры сезона</h2>
        </Link>
      </header>
      {leaderboard.topRows.length ? (
        <div className="px-4 pb-2 sm:px-5">
          {leaderboard.topRows.map((row) => {
            const isCurrentUser = leaderboard.currentUser?.rank === row.rank
              && leaderboard.currentUser.displayName === row.displayName;

            return (
              <div className="grid min-h-16 grid-cols-[2rem_auto_minmax(0,1fr)_auto] items-center gap-3 border-t border-border/60 py-2.5" key={`${row.rank}-${row.displayName}`}>
                <span className={cn("font-telemetry text-lg font-black text-primary", isCurrentUser && "text-foreground")}>{row.rank}</span>
                <FantasyLeagueAvatar className="size-10" name={row.displayName} />
                <span className="truncate text-sm font-bold">{row.displayName}</span>
                <span className="grid grid-cols-2 gap-3 text-right">
                  <span>
                    <span className="block font-telemetry text-sm font-black">{row.predictionCount}</span>
                    <span className="text-[0.58rem] text-muted-foreground">прогнозов</span>
                  </span>
                  <span>
                    <span className="block font-telemetry text-base font-black">{row.totalScore}</span>
                    <span className="text-[0.58rem] text-muted-foreground">очков</span>
                  </span>
                </span>
              </div>
            );
          })}
          {leaderboard.currentUser && leaderboard.currentUser.rank > 3 ? (
            <div className="mb-2 mt-2 grid min-h-16 grid-cols-[2rem_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-lg border border-primary/60 bg-primary/8 px-3 py-2">
              <span className="font-telemetry text-base font-black text-foreground">{leaderboard.currentUser.rank}</span>
              <span className="truncate text-sm font-bold">Ты</span>
              <span className="text-right">
                <span className="block font-telemetry text-sm font-black">{leaderboard.currentUser.predictionCount}</span>
                <span className="text-[0.58rem] text-muted-foreground">прогнозов</span>
              </span>
              <span className="text-right">
                <span className="block font-telemetry text-sm font-black">{leaderboard.currentUser.totalScore}</span>
                <span className="text-[0.58rem] text-muted-foreground">очков</span>
              </span>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mx-5 mb-5 flex min-h-36 items-center gap-3 border-t border-border/60 py-5 text-sm text-muted-foreground sm:mx-6">
          <CheckCircle2 aria-hidden="true" className="size-5 text-primary" />
          Рейтинг появится после первых начисленных очков.
        </div>
      )}
    </section>
  );
}

function formatScore(value: number | null) {
  return value === null
    ? "-"
    : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value);
}
