import {
  ArrowLeft,
  BarChart3,
  ClipboardList,
  Settings,
  Trash2,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  deleteFantasyLeague,
  updateFantasyLeague,
} from "@/app/fantasy/actions";
import { AppShell } from "@/components/racemate/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getLeagueDetail } from "@/data/racemate-repository";
import { getSessionUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import type {
  FantasyScoreBreakdown,
  LeagueDetail,
  LeagueHistoryEntry,
  LeagueMemberPrediction,
  PredictionResultPick,
  PreviousPredictionTop10Pick,
} from "@/types/racemate";

type LeaguePageSearchParams = {
  created?: string;
  joined?: string;
  message?: string;
  round?: string;
  updated?: string;
  user?: string;
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
  const selectedPrediction =
    selectedEntry?.predictions.find((prediction) => prediction.userId === query.user) ??
    selectedEntry?.predictions[0] ??
    null;
  const notice = getLeagueNotice(query);

  return (
    <AppShell>
      <section className="grid gap-6 py-6">
        <LeagueHero league={league} />

        {notice ? <LeagueNotice notice={notice} /> : null}

        {league.isOwner ? <LeagueOwnerPanel league={league} /> : null}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
          <div className="grid min-w-0 gap-6">
            <TopUsersChart members={league.members} />
            <RaceRoundSelector
              leagueId={league.id}
              selectedRound={selectedEntry?.round ?? null}
              history={league.history}
            />
            <SelectedRaceBoard
              entry={selectedEntry}
              leagueId={league.id}
              selectedUserId={selectedPrediction?.userId ?? null}
            />
          </div>

          <aside className="grid gap-6 xl:sticky xl:top-6">
            <LeagueSeasonStandings members={league.members} />
            <PredictionReviewCard prediction={selectedPrediction} race={selectedEntry} />
          </aside>
        </div>
      </section>
    </AppShell>
  );
}

function LeagueHero({ league }: { league: LeagueDetail }) {
  const leader = league.members[0];
  const totalPredictions = league.members.reduce((sum, member) => sum + member.scoredCount, 0);

  return (
    <header className="stitch-panel overflow-hidden p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <Button asChild size="sm" variant="secondary">
            <Link href="/fantasy?tab=leagues">
              <ArrowLeft aria-hidden="true" className="size-4" />
              К лигам
            </Link>
          </Button>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{league.members.length} участников</Badge>
            {league.inviteCode ? <Badge variant="outline">Код {league.inviteCode}</Badge> : null}
            {league.isPublic ? <Badge variant="outline">Открытая</Badge> : <Badge variant="outline">По коду</Badge>}
            {league.isOwner ? <Badge variant="success">Ты создатель</Badge> : null}
          </div>
          <h1 className="mt-3 font-display text-balance text-3xl font-extrabold tracking-[-0.04em] sm:text-5xl">
            {league.name}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Рейтинг, история этапов и разбор ставок всех участников.
          </p>
        </div>

        <div className="grid w-full gap-3 sm:w-auto sm:min-w-[29rem] sm:grid-cols-4">
          <LeagueHeaderMetric label="Лидер" value={leader?.name ?? "—"} />
          <LeagueHeaderMetric label="Очки" value={String(leader?.totalScore ?? "—")} />
          <LeagueHeaderMetric label="Этапов" value={String(league.history.length)} />
          <LeagueHeaderMetric label="Прогнозов" value={String(totalPredictions)} />
        </div>
      </div>
    </header>
  );
}

function LeagueHeaderMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-h-[5.75rem] place-items-center rounded-lg border border-border bg-background/45 p-3 text-center">
      <div className="min-w-0">
        <p className="truncate font-telemetry text-lg font-bold text-primary">{value}</p>
        <p className="mt-1 font-telemetry text-[0.6rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </p>
      </div>
    </div>
  );
}

function LeagueOwnerPanel({ league }: { league: LeagueDetail }) {
  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <form
        action={updateFantasyLeague}
        className="stitch-panel grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end sm:p-5"
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

      <form action={deleteFantasyLeague} className="stitch-panel grid gap-3 border-destructive/40 bg-destructive/5 p-4 sm:p-5">
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

function TopUsersChart({ members }: { members: LeagueMemberPrediction[] }) {
  const topUsers = members.slice(0, 10);
  const maxScore = Math.max(...topUsers.map((member) => member.totalScore), 1);

  return (
    <section className="stitch-panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b stitch-divider p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <BarChart3 aria-hidden="true" className="size-5 text-primary" />
          <div>
            <p className="stitch-label text-muted-foreground">Топ-10</p>
            <h2 className="mt-1 font-display text-2xl font-bold">Очки участников</h2>
          </div>
        </div>
        <Badge variant="secondary">{topUsers.length} из {members.length}</Badge>
      </div>

      {topUsers.length ? (
        <div className="grid gap-3 p-4 sm:p-5">
          {topUsers.map((member, index) => {
            const width = Math.max(6, Math.round((member.totalScore / maxScore) * 100));

            return (
              <div className="grid gap-2" key={member.userId}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="font-telemetry text-xs text-muted-foreground">#{index + 1}</span>
                    <span className="truncate font-semibold">{member.name}</span>
                  </div>
                  <span className="font-telemetry font-bold text-primary">{member.totalScore}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted/45">
                  <div
                    aria-hidden="true"
                    className="h-full rounded-full bg-primary shadow-[0_0_18px_rgb(225_6_0_/_0.32)]"
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="p-5 text-sm text-muted-foreground">
          График появится после первых начисленных очков.
        </p>
      )}
    </section>
  );
}

function RaceRoundSelector({
  history,
  leagueId,
  selectedRound,
}: {
  history: LeagueHistoryEntry[];
  leagueId: string;
  selectedRound: number | null;
}) {
  return (
    <section className="stitch-panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b stitch-divider p-4 sm:p-5">
        <div>
          <p className="stitch-label text-muted-foreground">Этапы</p>
          <h2 className="mt-1 font-display text-2xl font-bold">История гонок</h2>
        </div>
        <Badge variant="secondary">{history.length} этапов</Badge>
      </div>

      {history.length ? (
        <div className="grid gap-2 p-4 sm:grid-cols-2 sm:p-5 2xl:grid-cols-3">
          {history.map((entry) => {
            const leader = entry.predictions[0];
            const selected = selectedRound === entry.round;

            return (
              <Link
                className={cn(
                  "rounded-lg border border-border bg-muted/25 p-3 transition-colors hover:border-primary/60 hover:bg-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected && "border-primary/70 bg-primary/10",
                )}
                href={`/fantasy/leagues/${leagueId}?round=${entry.round}`}
                key={`${entry.round}-${entry.raceName}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-telemetry text-xs font-bold text-muted-foreground">R{entry.round}</span>
                  <Badge variant={selected ? "success" : "outline"}>{entry.predictions.length} прогнозов</Badge>
                </div>
                <h3 className="mt-2 truncate font-display text-base font-bold">{entry.raceName}</h3>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  Лучший: {leader ? `${leader.name}, ${leader.score ?? 0} очк.` : "—"}
                </p>
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="p-5 text-sm leading-6 text-muted-foreground">
          История появится после первого этапа с начисленными очками.
        </p>
      )}
    </section>
  );
}

function SelectedRaceBoard({
  entry,
  leagueId,
  selectedUserId,
}: {
  entry: LeagueHistoryEntry | null;
  leagueId: string;
  selectedUserId: string | null;
}) {
  if (!entry) {
    return (
      <section className="stitch-panel p-5">
        <h2 className="font-display text-2xl font-bold">Результаты этапа</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Здесь появится список участников и очки за выбранный этап.
        </p>
      </section>
    );
  }

  return (
    <section className="stitch-panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b stitch-divider p-4 sm:p-5">
        <div className="min-w-0">
          <p className="stitch-label text-primary">Раунд {entry.round}</p>
          <h2 className="mt-1 truncate font-display text-2xl font-bold">{entry.raceName}</h2>
        </div>
        <Badge variant="secondary">{entry.predictions.length} участников</Badge>
      </div>

      <div className="divide-y stitch-divider">
        {entry.predictions.map((prediction, index) => {
          const selected = selectedUserId === prediction.userId;

          return (
            <Link
              className={cn(
                "grid gap-3 p-3 transition-colors hover:bg-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[3rem_minmax(0,1fr)_7rem_7rem] sm:items-center sm:p-4",
                selected && "bg-primary/10",
              )}
              href={`/fantasy/leagues/${leagueId}?round=${entry.round}&user=${prediction.userId}`}
              key={`${entry.round}-${prediction.userId}`}
            >
              <span className="font-telemetry text-sm font-bold text-muted-foreground">#{index + 1}</span>
              <div className="min-w-0">
                <p className="truncate font-semibold">{prediction.name}</p>
                <ScoreBreakdownLine breakdown={prediction.scoreBreakdown} />
              </div>
              <PillMetric label="Этап" value={String(prediction.score ?? "—")} />
              <PillMetric label="Top-10" value={String(prediction.scoreBreakdown?.top10Points ?? "—")} />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function LeagueSeasonStandings({ members }: { members: LeagueMemberPrediction[] }) {
  return (
    <section className="stitch-panel overflow-hidden">
      <div className="flex items-center gap-2 border-b stitch-divider p-4">
        <Trophy aria-hidden="true" className="size-5 text-primary" />
        <h2 className="font-display text-xl font-bold">Рейтинг сезона</h2>
      </div>
      <div className="max-h-[34rem] overflow-y-auto p-3">
        {members.length ? (
          <div className="grid gap-2">
            {members.map((member, index) => (
              <div
                className="grid grid-cols-[2rem_minmax(0,1fr)_4.5rem] items-center gap-3 rounded-lg border border-border bg-muted/25 p-3"
                key={member.userId}
              >
                <span className="font-telemetry text-sm text-muted-foreground">#{index + 1}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{member.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {member.scoredCount} этапов · ср. {member.averageScore}
                  </p>
                </div>
                <p className="font-telemetry text-right text-lg font-bold text-primary">
                  {member.totalScore}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="p-2 text-sm text-muted-foreground">Рейтинг пока пуст.</p>
        )}
      </div>
    </section>
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

  return (
    <section className="stitch-panel overflow-hidden">
      <div className="border-b stitch-divider p-4 sm:p-5">
        <p className="stitch-label text-primary">Раунд {race.round}</p>
        <h2 className="mt-2 truncate font-display text-2xl font-bold">{prediction.name}</h2>
        <p className="mt-1 truncate text-sm text-muted-foreground">{race.raceName}</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <PillMetric label="Очки" value={String(prediction.score ?? "—")} />
          <PillMetric label="Top-10" value={String(prediction.scoreBreakdown?.top10Points ?? "—")} />
          <PillMetric label="Спец" value={String(prediction.scoreBreakdown?.specialPoints ?? "—")} />
        </div>
      </div>

      <div className="grid gap-5 p-4 sm:p-5">
        <section className="grid gap-2">
          <h3 className="font-display text-lg font-bold">Топ-10</h3>
          {prediction.top10.length ? (
            prediction.top10.map((pick) => (
              <Top10ResultRow key={`${pick.predictedPosition}-${pick.driverId}`} pick={pick} />
            ))
          ) : (
            <p className="rounded-lg border border-border bg-muted/25 p-3 text-sm text-muted-foreground">
              В этом прогнозе top-10 не был сохранен.
            </p>
          )}
        </section>

        <section className="grid gap-2">
          <h3 className="font-display text-lg font-bold">Дополнительно</h3>
          {prediction.specials.map((pick) => (
            <SpecialResultRow key={pick.label} pick={pick} />
          ))}
        </section>
      </div>
    </section>
  );
}

function Top10ResultRow({ pick }: { pick: PreviousPredictionTop10Pick }) {
  return (
    <div
      className={cn(
        "grid gap-2 rounded-lg border px-3 py-2 text-sm sm:grid-cols-[3.25rem_minmax(0,1fr)_auto] sm:items-center",
        getResultTone(pick.points),
      )}
    >
      <span className="font-telemetry font-bold">P{pick.predictedPosition}</span>
      <span className="min-w-0 font-semibold">{pick.driverName}</span>
      <span className="font-telemetry text-xs font-bold">
        {formatActualPosition(pick.actualPosition)} · {pick.points} очк.
      </span>
    </div>
  );
}

function SpecialResultRow({ pick }: { pick: PredictionResultPick }) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2 text-sm",
        pick.points > 0
          ? "border-success/55 bg-success/10"
          : "border-destructive/45 bg-destructive/10",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold">{pick.label}</span>
        <span className="font-telemetry text-xs font-bold">{pick.points} очк.</span>
      </div>
      <p className="mt-1 text-muted-foreground">{pick.value}</p>
    </div>
  );
}

function PillMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background/45 px-3 py-2 text-center">
      <p className="font-telemetry text-base font-bold text-primary">{value}</p>
      <p className="mt-1 font-telemetry text-[0.56rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

function ScoreBreakdownLine({
  breakdown,
}: {
  breakdown: FantasyScoreBreakdown | null | undefined;
}) {
  if (!breakdown) {
    return <p className="text-xs text-muted-foreground">Разбор очков пока недоступен.</p>;
  }

  return (
    <p className="text-xs leading-5 text-muted-foreground">
      Топ-10 {breakdown.top10Points} · Бонусы {breakdown.top10Bonus} · Спец{" "}
      {breakdown.specialPoints}
    </p>
  );
}

function getResultTone(points: number) {
  if (points >= 5) {
    return "border-success/55 bg-success/10";
  }

  if (points === 3) {
    return "border-warning/65 bg-warning/15";
  }

  if (points === 1) {
    return "border-orange-500/60 bg-orange-500/15";
  }

  return "border-destructive/45 bg-destructive/10";
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

  if (query.message) {
    return {
      text: "Не получилось выполнить действие. Проверь данные и попробуй ещё раз.",
      tone: "warning" as const,
    };
  }

  return null;
}
