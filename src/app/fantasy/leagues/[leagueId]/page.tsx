import {
  ArrowLeft,
  ChevronDown,
  ClipboardList,
  Settings,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  deleteFantasyLeague,
  joinFantasyLeague,
  updateFantasyLeague,
} from "@/app/fantasy/actions";
import { FantasyLeagueAvatarUploader } from "@/components/fantasy/fantasy-league-avatar-uploader";
import { FantasySectionNav } from "@/components/fantasy/fantasy-section-nav";
import { FantasyTrackVisualImage } from "@/components/fantasy/fantasy-track-visual";
import { LeagueLeaveButton } from "@/components/fantasy/league-leave-button";
import { LeagueInviteCodeCopy } from "@/components/fantasy/league-invite-code-copy";
import { AppShell } from "@/components/racemate/app-shell";
import { FantasyLeaderboardPanel } from "@/components/racemate/global-fantasy-leaderboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getFantasyTrackVisual } from "@/data/fantasy-track-assets";
import { getLeagueDetail } from "@/data/racemate-repository";
import { getSessionUser } from "@/lib/auth";
import { createPageMetadata } from "@/lib/seo";
import { cn } from "@/lib/utils";
import type {
  LeagueDetail,
  LeagueHistoryEntry,
  LeagueMemberPrediction,
  PredictionResultPick,
  PreviousPredictionTop10Pick,
} from "@/types/racemate";

export const metadata = createPageMetadata({
  description: "Приватная страница фентази-лиги RaceSide.",
  noFollow: true,
  noIndex: true,
  path: "/fantasy/leagues",
  title: "Фентази-лига",
});

type LeaguePageSearchParams = {
  created?: string;
  joined?: string;
  message?: string;
  round?: string;
  updated?: string;
  user?: string;
  view?: string;
};

export default async function FantasyLeaguePage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<LeaguePageSearchParams>;
}) {
  const [{ leagueId }, query, user] = await Promise.all([
    params,
    searchParams,
    getSessionUser(),
  ]);

  if (!user) {
    redirect(`/auth?next=${encodeURIComponent(`/fantasy/leagues/${leagueId}`)}`);
  }

  const league = await getLeagueDetail(leagueId, user.id);

  if (!league) {
    notFound();
  }

  const selectedRound = Number(query.round ?? league.history[0]?.round ?? 0);
  const selectedEntry =
    league.history.find((entry) => entry.round === selectedRound) ?? league.history[0] ?? null;
  const activeView = query.view === "rating" ? "rating" : "predictions";
  const notice = getLeagueNotice(query);
  const canViewLeagueContent = Boolean(league.isMember || league.isPublic);

  return (
    <AppShell>
      <section className="grid gap-6 pb-6">
        <FantasySectionNav active="leagues" />
        <LeagueHero league={league} />

        {notice ? <LeagueNotice notice={notice} /> : null}

        {canViewLeagueContent ? (
          <>
            <LeagueTabs activeView={activeView} leagueId={league.id} />

            {activeView === "rating" ? (
              <LeagueSeasonStandings currentUserId={user.id} members={league.members} />
            ) : (
              <PredictionsByRoundAccordion
                history={league.history}
                selectedRound={selectedEntry?.round ?? null}
              />
            )}
          </>
        ) : (
          <section className="rounded-xl border border-border/70 bg-card/75 p-5 sm:p-6">
            <h2 className="font-display text-lg font-bold">Прогнозы доступны участникам</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Введи код приглашения выше, чтобы открыть рейтинг и прогнозы этой лиги.
            </p>
          </section>
        )}
      </section>
    </AppShell>
  );
}

function LeagueHero({ league }: { league: LeagueDetail }) {
  const leader = league.members[0];
  const totalPredictions = league.members.reduce((sum, member) => sum + member.scoredCount, 0);
  const totalScore = league.members.reduce((sum, member) => sum + member.totalScore, 0);
  const averageStageScore = totalPredictions ? totalScore / totalPredictions : null;

  return (
    <header className="grid gap-7">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0 flex-1">
          <Button asChild size="sm" variant="ghost">
            <Link href="/fantasy/leagues">
              <ArrowLeft aria-hidden="true" className="size-4" />
              К лигам
            </Link>
          </Button>

          <div className="mt-5 flex items-center gap-4 sm:gap-6">
            <FantasyLeagueAvatarUploader
              avatarUrl={league.avatarUrl}
              canEdit={Boolean(league.isOwner)}
              className="size-24 sm:size-32"
              leagueId={league.id}
              leagueName={league.name}
            />
            <div className="min-w-0 flex-1">
              <p className="stitch-label text-primary">Фентази-лига</p>
              <h1 className="mt-2 font-display text-balance text-3xl font-extrabold tracking-[-0.04em] sm:text-5xl">
                {league.name}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                Рейтинг сезона, история этапов и прогнозы участников.
              </p>
              </div>
            </div>
        </div>

        <div className="grid min-w-[17rem] justify-items-end gap-4">
          {league.isOwner ? (
            <LeagueSettingsDisclosure league={league} />
          ) : (
            <LeagueParticipantControls league={league} />
          )}
          {league.isMember ? (
            <div className="grid w-full gap-2">
              <p className="text-right font-telemetry text-[0.62rem] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Код приглашения
              </p>
              {league.inviteCode ? (
                <div className="flex min-w-0 items-center gap-2 border-b stitch-divider pb-2">
                  <code className="min-w-0 flex-1 truncate px-1 py-2 font-telemetry text-sm font-bold text-foreground">
                    {league.inviteCode}
                  </code>
                  <LeagueInviteCodeCopy code={league.inviteCode} />
                </div>
              ) : (
                <p className="border-b stitch-divider px-1 py-2 text-sm text-muted-foreground">
                  Код появится после создания приглашения.
                </p>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {league.isMember || league.isPublic ? (
        <div className="grid grid-cols-2 gap-px overflow-hidden border-y border-border/70 bg-border/70 sm:grid-cols-4 xl:grid-cols-7">
          <LeagueHeaderMetric label="Лидер" value={leader?.name ?? "-"} />
          <LeagueHeaderMetric label="Очки" value={String(leader?.totalScore ?? "-")} />
          <LeagueHeaderMetric label="Участников" value={String(league.members.length)} />
          <LeagueHeaderMetric label="Среднее за этап" value={formatLeagueScore(averageStageScore)} />
          <LeagueHeaderMetric label="Этапов" value={String(league.history.length)} />
          <LeagueHeaderMetric label="Прогнозов" value={String(totalPredictions)} />
          <LeagueHeaderMetric label="Всего очков" value={String(totalScore)} />
        </div>
      ) : null}
    </header>
  );
}

function LeagueParticipantControls({ league }: { league: LeagueDetail }) {
  if (!league.isMember) {
    return (
      <div className="grid w-full max-w-sm justify-items-end gap-3">
        <LeagueStatusBadges league={league} />
        <form action={joinFantasyLeague} className="grid w-full gap-3 rounded-xl border border-border bg-card p-4">
          <input name="leagueId" type="hidden" value={league.id} />
          {!league.isPublic ? (
            <label className="grid gap-2 text-sm font-semibold" htmlFor="league-invite-code">
              Код приглашения
              <input
                autoComplete="off"
                className="min-h-11 rounded-md border border-input bg-background px-3 font-mono text-sm uppercase outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                id="league-invite-code"
                maxLength={16}
                name="inviteCode"
                placeholder="RACE24"
                required
              />
            </label>
          ) : null}
          <Button className="min-h-11" type="submit">
            Присоединиться
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="grid justify-items-end gap-3">
      <LeagueStatusBadges league={league} />
      <LeagueLeaveButton leagueId={league.id} />
    </div>
  );
}

function LeagueStatusBadges({ league }: { league: LeagueDetail }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {league.isPublic ? <Badge variant="outline">Открытая лига</Badge> : <Badge variant="outline">Вход по коду</Badge>}
      {league.isOwner ? <Badge variant="success">Ты создатель</Badge> : null}
    </div>
  );
}

function LeagueSettingsDisclosure({ league }: { league: LeagueDetail }) {
  return (
    <details className="group grid gap-3">
      <summary className="flex cursor-pointer list-none items-start justify-end gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <LeagueStatusBadges league={league} />
        <span
          aria-label="Настройки лиги"
          className="grid size-12 shrink-0 place-items-center rounded-full border border-border/60 bg-background/45 text-muted-foreground transition-colors group-hover:border-primary/60 group-hover:bg-accent/45 group-hover:text-foreground"
          title="Настройки лиги"
        >
          <Settings aria-hidden="true" className="size-5 text-primary" />
        </span>
      </summary>
      <div className="mt-1">
        <LeagueOwnerPanel league={league} />
      </div>
    </details>
  );
}

function LeagueHeaderMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="grid min-h-20 place-items-center bg-background/85 p-3 text-center">
      <div className="flex min-w-0 items-center justify-center gap-2">
        <div className="min-w-0">
          <p className="truncate font-telemetry text-xl font-bold text-foreground">{value}</p>
          <p className="mt-1 font-telemetry text-[0.6rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            {label}
          </p>
        </div>
      </div>
    </div>
  );
}

function LeagueOwnerPanel({ league }: { league: LeagueDetail }) {
  return (
    <section className="grid gap-4 rounded-xl border border-border bg-card p-4 shadow-2xl shadow-black/25">
      <form
        action={updateFantasyLeague}
        className="grid gap-3"
      >
        <input name="leagueId" type="hidden" value={league.id} />
        <label className="grid gap-2 text-sm font-medium" htmlFor="league-name">
          Название лиги
          <input
            className="min-h-11 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
            defaultValue={league.name}
            id="league-name"
            maxLength={64}
            name="name"
            required
          />
        </label>
        <label className="flex min-h-11 items-center gap-2 rounded-md border border-border bg-muted/25 px-3 text-sm text-muted-foreground">
          <input className="size-4 accent-primary" defaultChecked={Boolean(league.isPublic)} name="isPublic" type="checkbox" />
          Показывать в общем списке
        </label>
        <Button className="min-h-11" type="submit" variant="secondary">
          <Settings aria-hidden="true" className="size-4" />
          Сохранить
        </Button>
      </form>

      <form action={deleteFantasyLeague} className="grid gap-3 rounded-lg border border-destructive/35 bg-destructive/10 p-4">
        <input name="leagueId" type="hidden" value={league.id} />
        <label className="grid gap-2 text-sm font-medium" htmlFor="confirmName">
          Удалить лигу
          <input
            className="min-h-11 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
            id="confirmName"
            name="confirmName"
            placeholder={league.name}
            required
          />
        </label>
        <p className="text-xs leading-5 text-muted-foreground">
          Чтобы удалить, введи точное название лиги. Участники и история этой лиги исчезнут из списка.
        </p>
        <Button
          className="min-h-11 border border-destructive/50 bg-destructive text-destructive-foreground hover:bg-destructive/90"
          type="submit"
        >
          <Trash2 aria-hidden="true" className="size-4" />
          Удалить
        </Button>
      </form>
    </section>
  );
}

function LeagueTabs({
  activeView,
  leagueId,
}: {
  activeView: "predictions" | "rating";
  leagueId: string;
}) {
  const tabs = [
    {
      href: `/fantasy/leagues/${leagueId}`,
      id: "predictions",
      label: "Прогнозы по раундам",
    },
    {
      href: `/fantasy/leagues/${leagueId}?view=rating`,
      id: "rating",
      label: "Рейтинг сезона",
    },
  ] as const;

  return (
    <nav
      aria-label="Разделы лиги"
      className="flex flex-wrap border-b stitch-divider"
    >
      {tabs.map((tab) => (
        <Link
          aria-current={activeView === tab.id ? "page" : undefined}
          className={cn(
            "relative flex min-h-12 flex-1 items-center justify-center px-4 text-center text-sm font-semibold transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-none",
            activeView === tab.id
              ? "text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-primary"
              : "text-muted-foreground hover:bg-accent/25",
          )}
          href={tab.href}
          key={tab.id}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

function PredictionsByRoundAccordion({
  history,
  selectedRound,
}: {
  history: LeagueHistoryEntry[];
  selectedRound: number | null;
}) {
  if (!history.length) {
    return (
      <section className="stitch-panel p-5">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
            <ClipboardList aria-hidden="true" className="size-4" />
          </span>
          <h2 className="font-display text-base font-bold">Прогнозы по раундам</h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          История появится после первого этапа с начисленными очками.
        </p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border stitch-divider bg-card/40">
      <div className="flex min-h-14 items-center gap-2 border-b stitch-divider px-4 py-2 sm:px-5">
        <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
          <ClipboardList aria-hidden="true" className="size-4" />
        </span>
        <h2 className="font-display text-base font-bold">Прогнозы по раундам</h2>
      </div>

      <div className="divide-y stitch-divider">
        {history.map((entry, index) => {
          const leader = entry.predictions[0];
          const open = selectedRound === entry.round || (!selectedRound && index === 0);

          return (
            <details
              className="group"
              key={`${entry.round}-${entry.raceName}`}
              open={open}
            >
              <summary className="grid cursor-pointer list-none gap-3 p-4 transition-colors hover:bg-accent/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center [&::-webkit-details-marker]:hidden">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-telemetry text-xs font-bold text-primary">R{entry.round}</span>
                    <Badge variant="outline">{entry.predictions.length} прогнозов</Badge>
                    {leader ? <Badge variant="secondary">Лидер этапа: {leader.name}</Badge> : null}
                  </div>
                  <h3 className="mt-2 truncate font-display text-xl font-bold">{entry.raceName}</h3>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {leader ? `${leader.score ?? 0} очк. у лучшего результата` : "Прогнозов пока нет"}
                  </p>
                </div>
                <ChevronDown
                  aria-hidden="true"
                  className="size-5 text-muted-foreground transition-transform group-open:rotate-180"
                />
              </summary>

              <div className="border-t stitch-divider">
                {entry.predictions.length ? (
                  entry.predictions.map((prediction, predictionIndex) => (
                    <Dialog key={`${entry.round}-${prediction.userId}`}>
                      <DialogTrigger asChild>
                      <button
                        className="grid min-h-12 w-full grid-cols-[2.25rem_minmax(0,1fr)_3.5rem_3.5rem] items-center gap-2 border-b stitch-divider px-4 py-2 text-left transition-colors last:border-b-0 hover:bg-accent/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[3rem_minmax(0,1fr)_5rem_5rem]"
                        type="button"
                      >
                        <span className="font-telemetry text-sm font-bold text-muted-foreground">
                          #{predictionIndex + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{prediction.name}</p>
                        </div>
                        <CompactPredictionMetric label="этап" value={String(prediction.score ?? "—")} />
                        <CompactPredictionMetric label="топ-10" value={String(prediction.scoreBreakdown?.top10Points ?? "—")} />
                      </button>
                      </DialogTrigger>
                      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-6xl gap-0 overflow-y-auto p-0 sm:max-w-6xl [&_[data-slot=dialog-close]]:z-20 [&_[data-slot=dialog-close]]:bg-black/60 [&_[data-slot=dialog-close]]:text-white">
                        <DialogTitle className="sr-only">Прогноз участника {prediction.name}</DialogTitle>
                        <DialogDescription className="sr-only">
                          Прогноз на {entry.raceName} и начисленные за него очки.
                        </DialogDescription>
                        <PredictionReviewCard prediction={prediction} race={entry} />
                      </DialogContent>
                    </Dialog>
                  ))
                ) : (
                  <p className="p-4 text-sm text-muted-foreground">
                    На этом этапе ещё нет сохранённых прогнозов.
                  </p>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}

function LeagueSeasonStandings({
  currentUserId,
  members,
}: {
  currentUserId: string;
  members: LeagueMemberPrediction[];
}) {
  return (
    <FantasyLeaderboardPanel
      emptyText="Рейтинг появится после первых начисленных очков."
      rows={members.map((member, index) => ({
        averageScore: member.averageScore,
        bestScore: member.bestScore,
        displayName: member.name,
        isCurrentUser: member.userId === currentUserId,
        key: member.userId,
        predictionCount: member.scoredCount,
        rank: index + 1,
        totalScore: member.totalScore,
      }))}
      title="Лидерборд лиги"
    />
  );
}

function PredictionReviewCard({
  prediction,
  race,
}: {
  prediction: LeagueHistoryEntry["predictions"][number] | null;
  race: LeagueHistoryEntry | null;
}) {
  if (!prediction || !race) {
    return (
      <section className="stitch-panel p-5">
        <div className="mb-3 flex items-center gap-2">
          <ClipboardList aria-hidden="true" className="size-5 text-primary" />
          <h2 className="font-display text-xl font-bold">Разбор прогноза</h2>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          Выбери этап и участника, чтобы увидеть, какие ставки зашли.
        </p>
      </section>
    );
  }

  const trackVisual = getFantasyTrackVisual(race.season ?? 2026, race.round, race.raceName);

  return (
    <section className="overflow-hidden rounded-xl border stitch-divider bg-card/40">
      <div className="relative min-h-[18rem] overflow-hidden sm:min-h-[22rem]">
        {trackVisual ? (
          <FantasyTrackVisualImage
            className="absolute inset-0 h-full aspect-auto"
            sizes="(max-width: 768px) 100vw, 1200px"
            visual={trackVisual}
          />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgb(225_6_0_/_0.16),transparent_35%),linear-gradient(135deg,#17181a,#08090a)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/78 to-black/20" />
        <div className="relative z-10 flex min-h-[18rem] max-w-2xl flex-col justify-end p-5 sm:min-h-[22rem] sm:p-8">
          <p className="font-telemetry text-xs font-bold uppercase tracking-[0.14em] text-primary">Раунд {race.round}</p>
          <h2 className="mt-3 text-balance font-display text-3xl font-extrabold tracking-[-0.035em] text-white sm:text-5xl">
            {race.raceName}
          </h2>
          <p className="mt-3 text-sm font-semibold text-white/70">Прогноз участника {prediction.name}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 border-b stitch-divider">
        <ReviewMetric label="Всего очков" value={String(prediction.score ?? "-")} />
        <ReviewMetric label="Топ-10" value={String(prediction.scoreBreakdown?.top10Points ?? "-")} />
        <ReviewMetric label="Спецпрогнозы" value={String(prediction.scoreBreakdown?.specialPoints ?? "-")} />
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <section className="border-b stitch-divider lg:border-b-0 lg:border-r">
          <div className="flex items-end justify-between gap-3 border-b stitch-divider p-4 sm:p-6">
            <div>
              <p className="stitch-label text-primary">Финишный порядок</p>
              <h3 className="mt-1 font-display text-2xl font-bold">Прогноз топ-10</h3>
            </div>
            <span className="text-xs font-semibold text-muted-foreground">Прогноз / результат</span>
          </div>
          {prediction.top10.length ? (
            <div className="grid sm:grid-cols-2">
              {prediction.top10.map((pick) => (
                <Top10ResultRow key={`${pick.predictedPosition}-${pick.driverId}`} pick={pick} />
              ))}
            </div>
          ) : (
            <p className="p-5 text-sm text-muted-foreground">
              В этом прогнозе top-10 не был сохранен.
            </p>
          )}
        </section>

        <section>
          <div className="border-b stitch-divider p-4 sm:p-6">
            <p className="stitch-label text-primary">Дополнительно</p>
            <h3 className="mt-1 font-display text-2xl font-bold">Спецпрогнозы</h3>
          </div>
          <div className="divide-y stitch-divider">
            {prediction.specials.map((pick) => (
              <SpecialResultRow key={pick.label} pick={pick} />
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function ReviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-h-24 place-items-center border-r stitch-divider p-3 text-center last:border-r-0">
      <div>
        <p className="font-telemetry text-2xl font-black">{value}</p>
        <p className="mt-1 text-xs font-semibold text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function Top10ResultRow({ pick }: { pick: PreviousPredictionTop10Pick }) {
  return (
    <div
      className={cn(
        "grid min-h-16 grid-cols-[2.8rem_minmax(0,1fr)_auto] items-center gap-2 border-b stitch-divider px-4 py-3 text-sm odd:sm:border-r",
        getResultTone(pick.points),
      )}
    >
      <span className="font-telemetry text-base font-black">P{pick.predictedPosition}</span>
      <span className="min-w-0 truncate font-semibold">{pick.driverName}</span>
      <span className="text-right">
        <span className="block font-telemetry text-xs font-bold">{formatActualPosition(pick.actualPosition)}</span>
        <span className="mt-0.5 block text-xs font-semibold opacity-75">+{pick.points} очк.</span>
      </span>
    </div>
  );
}

function SpecialResultRow({ pick }: { pick: PredictionResultPick }) {
  return (
    <div
      className={cn(
        "px-4 py-4 text-sm sm:px-6",
        pick.points > 0
          ? "bg-success/8"
          : "bg-destructive/8",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold">{pick.label}</span>
        <span className={cn("font-telemetry text-xs font-bold", pick.points > 0 ? "text-success" : "text-destructive")}>
          +{pick.points} очк.
        </span>
      </div>
      <p className="mt-1 text-muted-foreground">{pick.value}</p>
    </div>
  );
}

function CompactPredictionMetric({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-right">
      <span className="block font-telemetry text-sm font-bold text-primary">{value}</span>
      <span className="block font-telemetry text-[0.5rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </span>
    </span>
  );
}

function formatLeagueScore(value: number | null) {
  return value === null
    ? "-"
    : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value);
}

function getResultTone(points: number) {
  if (points >= 5) {
    return "bg-success/8";
  }

  if (points === 3) {
    return "bg-warning/10";
  }

  if (points === 1) {
    return "bg-orange-500/10";
  }

  return "bg-destructive/8";
}

function formatActualPosition(position: number | null) {
  return position ? `финиш P${position}` : "мимо top-10";
}

function LeagueNotice({
  notice,
}: {
  notice: {
    text: string;
    tone: "success" | "warning";
  };
}) {
  return (
    <div
      className={cn(
        "stitch-panel p-4 text-sm leading-6 text-muted-foreground",
        notice.tone === "success" && "border-success/40 bg-success/10",
        notice.tone === "warning" && "border-warning/40 bg-warning/10",
      )}
    >
      {notice.text}
    </div>
  );
}

function getLeagueNotice(query: LeaguePageSearchParams) {
  if (query.created) {
    return {
      text: "Лига создана. Код приглашения уже можно отправить друзьям.",
      tone: "success" as const,
    };
  }

  if (query.joined) {
    return {
      text: "Ты в лиге. После этапа очки появятся в истории.",
      tone: "success" as const,
    };
  }

  if (query.updated) {
    return {
      text: "Настройки лиги сохранены.",
      tone: "success" as const,
    };
  }

  if (query.message === "confirm") {
    return {
      text: "Для удаления введи точное название лиги.",
      tone: "warning" as const,
    };
  }

  if (query.message === "owner") {
    return {
      text: "Создатель управляет лигой через настройки. Чтобы закрыть лигу, удали её.",
      tone: "warning" as const,
    };
  }

  if (query.message === "leave") {
    return {
      text: "Не получилось выйти из лиги. Попробуй ещё раз.",
      tone: "warning" as const,
    };
  }

  if (query.message === "code" || query.message === "not-found") {
    return {
      text: "Код не подошёл. Проверь его и попробуй ещё раз.",
      tone: "warning" as const,
    };
  }

  if (query.message) {
    return {
      text: "Не получилось выполнить действие. Проверь данные и попробуй ещё раз.",
      tone: "warning" as const,
    };
  }

  return null;
}
