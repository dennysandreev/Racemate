"use client";

import { useCallback, useEffect } from "react";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { LeagueDetail } from "@/types/racemate";

export function LeagueDialog({ league }: { league: LeagueDetail | null }) {
  const router = useRouter();

  const closeDialog = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    params.delete("league");
    const query = params.toString();

    router.replace(query ? `/fantasy?${query}` : "/fantasy", { scroll: false });
  }, [router]);

  useEffect(() => {
    if (!league) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeDialog();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeDialog, league]);

  if (!league) {
    return null;
  }

  const leader = league.members[0];

  return (
    <div
      aria-labelledby="league-dialog-title"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-black/72 p-3 backdrop-blur-md sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          closeDialog();
        }
      }}
      role="dialog"
    >
      <section className="stitch-panel flex max-h-[88dvh] w-full max-w-6xl flex-col overflow-hidden shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b stitch-divider p-4 sm:p-6">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{league.members.length} участников</Badge>
              {league.inviteCode ? <Badge variant="outline">Код {league.inviteCode}</Badge> : null}
            </div>
            <h2
              className="font-display text-balance text-2xl font-extrabold tracking-[-0.03em] sm:text-4xl"
              id="league-dialog-title"
            >
              {league.name}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Прогнозы видны сразу после сохранения. Очки начисляются после обработки результатов этапа.
            </p>
          </div>
          <button
            aria-label="Закрыть лигу"
            className="grid size-10 shrink-0 place-items-center rounded-md border border-border bg-background/65 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={closeDialog}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </header>

        <div className="min-h-0 overflow-y-auto p-4 sm:p-6">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_21rem]">
            <div className="grid min-w-0 gap-5">
              <section className="rounded-lg border border-border/80 bg-background/35">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b stitch-divider p-4">
                  <div>
                    <p className="stitch-label text-muted-foreground">Текущий этап</p>
                    <h3 className="mt-2 font-display text-xl font-bold">Прогнозы участников</h3>
                  </div>
                  {leader ? <Badge variant="success">Лидер: {leader.name}</Badge> : null}
                </div>
                <div className="divide-y stitch-divider">
                  {league.members.length ? (
                    league.members.map((member, index) => (
                      <article className="grid gap-4 p-4 lg:grid-cols-[13rem_minmax(0,1fr)_5rem] lg:items-start" key={member.userId}>
                        <div className="min-w-0">
                          <p className="font-telemetry text-[0.68rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                            #{index + 1} · {member.role === "owner" ? "Владелец" : "Участник"}
                          </p>
                          <h4 className="mt-2 truncate font-display text-lg font-bold">{member.name}</h4>
                          <p className="mt-1 text-xs text-muted-foreground">В лиге с {member.joinedAt}</p>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {member.picks.map((pick) => (
                            <div
                              className={cn(
                                "rounded-md border border-border/70 bg-muted/35 p-3",
                                pick.value === "Не выбран" && "opacity-65",
                              )}
                              key={`${member.userId}-${pick.label}`}
                            >
                              <p className="text-xs text-muted-foreground">{pick.label}</p>
                              <p className="mt-1 truncate text-sm font-semibold">{pick.value}</p>
                            </div>
                          ))}
                        </div>
                        <div className="rounded-md border border-border/70 bg-background/45 p-3 text-center">
                          <p className="font-telemetry text-xl font-bold text-primary">
                            {member.currentScore ?? "—"}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">за этап</p>
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="p-4 text-sm text-muted-foreground">
                      В этой лиге пока нет участников.
                    </p>
                  )}
                </div>
              </section>

              <section className="rounded-lg border border-border/80 bg-background/35">
                <div className="border-b stitch-divider p-4">
                  <p className="stitch-label text-muted-foreground">История ставок</p>
                  <h3 className="mt-2 font-display text-xl font-bold">Завершенные этапы</h3>
                </div>
                <div className="divide-y stitch-divider">
                  {league.history.length ? (
                    league.history.map((entry) => (
                      <article className="grid gap-3 p-4" key={`${entry.round}-${entry.raceName}`}>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <h4 className="font-display text-lg font-bold">{entry.raceName}</h4>
                          <Badge variant="outline">Раунд {entry.round}</Badge>
                        </div>
                        <div className="grid gap-2">
                          {entry.predictions.map((prediction) => (
                            <div
                              className="grid gap-2 rounded-md border border-border/70 bg-muted/30 p-3 sm:grid-cols-[10rem_minmax(0,1fr)_4rem] sm:items-center"
                              key={`${entry.round}-${prediction.userId}`}
                            >
                              <p className="truncate font-medium">{prediction.name}</p>
                              <p className="truncate text-sm text-muted-foreground">
                                {prediction.picks.map((pick) => `${pick.label}: ${pick.value}`).join(" · ")}
                              </p>
                              <p className="font-telemetry text-right font-bold text-primary">
                                {prediction.score ?? "—"}
                              </p>
                            </div>
                          ))}
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="p-4 text-sm text-muted-foreground">
                      История появится после первого этапа с начисленными очками.
                    </p>
                  )}
                </div>
              </section>
            </div>

            <aside className="grid content-start gap-4">
              <section className="rounded-lg border border-border/80 bg-background/35 p-4">
                <p className="stitch-label text-muted-foreground">Рейтинг сезона</p>
                <div className="mt-4 grid gap-3">
                  {league.members.length ? (
                    league.members.map((member, index) => (
                      <div className="grid grid-cols-[2rem_minmax(0,1fr)_4rem] items-center gap-3" key={`rank-${member.userId}`}>
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
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">Рейтинг пока пуст.</p>
                  )}
                </div>
              </section>

              <section className="rounded-lg border border-border/80 bg-background/35 p-4">
                <p className="stitch-label text-muted-foreground">Статистика</p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <LeagueMetric label="Лучший этап" value={String(leader?.bestScore ?? "—")} />
                  <LeagueMetric label="Прогнозов" value={String(league.members.reduce((sum, member) => sum + member.scoredCount, 0))} />
                  <LeagueMetric label="Участников" value={String(league.members.length)} />
                  <LeagueMetric label="Код" value={league.inviteCode ?? "—"} />
                </div>
              </section>
            </aside>
          </div>
        </div>
      </section>
    </div>
  );
}

function LeagueMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/70 bg-muted/30 p-3">
      <p className="font-telemetry text-lg font-bold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
