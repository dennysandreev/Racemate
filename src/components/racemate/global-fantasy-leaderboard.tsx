import { ListOrdered } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { GlobalFantasyLeaderboard } from "@/types/racemate";

export function GlobalFantasyLeaderboardPanel({
  currentDisplayName,
  leaderboard,
}: {
  currentDisplayName?: string | null;
  leaderboard: GlobalFantasyLeaderboard;
}) {
  const rows = leaderboard.rows;
  const leaderScore = Math.max(rows[0]?.totalScore ?? 0, 1);

  if (!rows.length) {
    return (
      <section className="stitch-panel p-6">
        <p className="text-sm leading-6 text-muted-foreground">
          Рейтинг появится, когда участники сохранят первые личные прогнозы.
        </p>
      </section>
    );
  }

  return (
    <div>
      <section className="stitch-panel overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b stitch-divider p-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border/70 bg-secondary/40">
              <ListOrdered aria-hidden="true" className="size-4.5 text-primary" />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold leading-tight">Глобальный лидерборд</h2>
              <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
                Все участники RaceMate за сезон
              </p>
            </div>
          </div>
          <Badge variant="secondary">{rows.length}</Badge>
        </div>
        <ol>
          {rows.map((row) => {
            const isCurrentUser = isSameName(row.displayName, currentDisplayName);

            return (
              <li
                className={cn(
                  "grid grid-cols-[2.2rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-t stitch-divider px-3 py-2.5 transition-colors hover:bg-accent/40 sm:px-4",
                  isCurrentUser && "bg-primary/10",
                )}
                key={`${row.rank}-${row.displayName}`}
              >
                <span
                  className={cn(
                    "font-telemetry text-sm font-extrabold",
                    row.rank === 1 && "text-[#f4c95d]",
                    row.rank === 2 && "text-[#cbd5e1]",
                    row.rank === 3 && "text-[#d48a5f]",
                    row.rank > 3 && "text-muted-foreground",
                  )}
                >
                  {row.rank}
                </span>
                <div className="min-w-0">
                  <p className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-bold">{row.displayName}</span>
                    {isCurrentUser ? (
                      <span className="font-telemetry shrink-0 rounded border border-primary/45 bg-primary/12 px-1.5 py-0.5 text-[0.55rem] font-extrabold uppercase tracking-[0.08em] text-primary">
                        Вы
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 truncate text-xs font-semibold text-muted-foreground">
                    {row.predictionCount} прогн. · средний {row.averageScore} · лучший {row.bestScore ?? "—"}
                    {row.bestBreakdown
                      ? ` (топ-10 ${row.bestBreakdown.top10Points} · бонусы ${row.bestBreakdown.top10Bonus} · спец ${row.bestBreakdown.specialPoints})`
                      : ""}
                  </p>
                  <div aria-hidden="true" className="mt-1.5 h-1 max-w-56 overflow-hidden rounded-full bg-secondary/50">
                    <div
                      className="h-full rounded-full bg-primary/80"
                      style={{ width: `${Math.max(2, Math.round((row.totalScore / leaderScore) * 100))}%` }}
                    />
                  </div>
                </div>
                <span className="font-telemetry text-right text-base font-extrabold">{row.totalScore}</span>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

function isSameName(name: string, currentDisplayName?: string | null) {
  return Boolean(currentDisplayName && name.trim().toLowerCase() === currentDisplayName.trim().toLowerCase());
}
