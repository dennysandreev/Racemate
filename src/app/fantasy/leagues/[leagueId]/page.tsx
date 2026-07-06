import {
  ArrowLeft,
  BarChart3,
  ChevronDown,
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
  const selectedPrediction =
    selectedEntry?.predictions.find((prediction) => prediction.userId === query.user) ??
    selectedEntry?.predictions[0] ??
    null;
  const activeView = query.view === "rating" ? "rating" : "predictions";
  const notice = getLeagueNotice(query);

  return (
    <AppShell>
      <section className="grid gap-6 py-6">
        <LeagueHero league={league} />

        {notice ? <LeagueNotice notice={notice} /> : null}

        <LeagueTabs activeView={activeView} leagueId={league.id} />

        {activeView === "rating" ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)] xl:items-start">
            <TopUsersChart members={league.members} />
            <LeagueSeasonStandings members={league.members} />
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
            <PredictionsByRoundAccordion
              history={league.history}
              leagueId={league.id}
              selectedRound={selectedEntry?.round ?? null}
              selectedUserId={selectedPrediction?.userId ?? null}
            />

            <aside className="grid gap-6 xl:sticky xl:top-6">
              <PredictionReviewCard prediction={selectedPrediction} race={selectedEntry} />
            </aside>
          </div>
        )}
      </section>
    </AppShell>
  );
}

function LeagueHero({ league }: { league: LeagueDetail }) {
  const leader = league.members[0];
  const totalPredictions = league.members.reduce((sum, member) => sum + member.scoredCount, 0);

  return (
    <header className="stitch-panel overflow-hidden p-5 sm:p-6">
      <div className="grid gap-6 xl:min-h-[17rem] xl:grid-cols-[minmax(0,1fr)_minmax(28rem,34rem)]">
        <div className="flex min-w-0 flex-col justify-between gap-8">
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

            <div className="mt-3 flex flex-wrap items-start gap-3">
              <h1 className="min-w-0 flex-1 font-display text-balance text-3xl font-extrabold tracking-[-0.04em] sm:text-5xl">
                {league.name}
              </h1>
            </div>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Рейтинг, история этапов и разбор ставок всех участников.
            </p>

            {league.isOwner ? <LeagueSettingsDisclosure league={league} /> : null}
          </div>
        </div>

        <div className="grid w-full content-end gap-3 self-end sm:grid-cols-4">
          <LeagueHeaderMetric label="Лидер" value={leader?.name ?? "—"} />
          <LeagueHeaderMetric label="Очки" value={String(leader?.totalScore ?? "—")} />
          <LeagueHeaderMetric label="Этапов" value={String(league.history.length)} />
          <LeagueHeaderMetric label="Прогнозов" value={String(totalPredictions)} />
        </div>
      </div>
    </header>
  );
}

function LeagueSettingsDisclosure({ league }: { league: LeagueDetail }) {
  return (
    <details className="group mt-4 max-w-4xl">
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-md border border-border bg-background/55 px-3 text-sm font-medium transition-colors hover:border-primary/60 hover:bg-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <Settings aria-hidden="true" className="size-4 text-primary" />
        Настройки
        <ChevronDown
          aria-hidden="true"
          className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="mt-3">
        <LeagueOwnerPanel league={league} />
      </div>
    </details>
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
    <section className="grid gap-4 rounded-xl border border-border bg-card p-4 shadow-2xl shadow-black/25 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <form
        action={updateFantasyLeague}
        className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end"
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
      className="stitch-panel flex flex-wrap gap-2 p-2"
    >
      {tabs.map((tab) => (
        <Link
          aria-current={activeView === tab.id ? "page" : undefined}
          className={cn(
            "flex min-h-11 flex-1 items-center justify-center rounded-md px-4 text-center text-sm font-semibold transition-colors hover:bg-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-none",
            activeView === tab.id
              ? "bg-primary text-primary-foreground shadow-[0_0_18px_rgb(225_6_0_/_0.24)]"
              : "text-muted-foreground",
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
  leagueId,
  selectedRound,
  selectedUserId,
}: {
  history: LeagueHistoryEntry[];
  leagueId: string;
  selectedRound: number | null;
  selectedUserId: string | null;
}) {
  if (!history.length) {
    return (
      <section className="stitch-panel p-5">
        <h2 className="font-display text-2xl font-bold">Прогнозы по раундам</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          История появится после первого этапа с начисленными очками.
        </p>
      </section>
    );
  }

  return (
    <section className="stitch-panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b stitch-divider p-4 sm:p-5">
        <div>
          <p className="stitch-label text-muted-foreground">Этапы</p>
          <h2 className="mt-1 font-display text-2xl font-bold">Прогнозы по раундам</h2>
        </div>
        <Badge variant="secondary">{history.length} этапов</Badge>
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

              <div className="grid gap-2 border-t stitch-divider p-3 sm:p-4">
                {entry.predictions.length ? (
                  entry.predictions.map((prediction, predictionIndex) => {
                    const selected =
                      selectedRound === entry.round && selectedUserId === prediction.userId;

                    return (
                      <Link
                        className={cn(
                          "grid gap-3 rounded-lg border border-border bg-muted/20 p-3 transition-colors hover:border-primary/60 hover:bg-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[3rem_minmax(0,1fr)_7rem_7rem] sm:items-center",
                          selected && "border-primary/70 bg-primary/10",
                        )}
                        href={`/fantasy/leagues/${leagueId}?round=${entry.round}&user=${prediction.userId}`}
                        key={`${entry.round}-${prediction.userId}`}
                      >
                        <span className="font-telemetry text-sm font-bold text-muted-foreground">
                          #{predictionIndex + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{prediction.name}</p>
                          <ScoreBreakdownLine breakdown={prediction.scoreBreakdown} />
                        </div>
                        <PillMetric label="Этап" value={String(prediction.score ?? "—")} />
                        <PillMetric
                          label="Top-10"
                          value={String(prediction.scoreBreakdown?.top10Points ?? "—")}
                        />
                      </Link>
                    );
                  })
                ) : (
                  <p className="rounded-lg border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
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
