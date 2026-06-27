import { Trophy } from "lucide-react";

import { StitchPanel } from "@/components/racemate/stitch-primitives";
import type { GlobalFantasyLeaderboard } from "@/types/racemate";

export function GlobalFantasyLeaderboardPanel({ leaderboard }: { leaderboard: GlobalFantasyLeaderboard }) {
  return (
    <StitchPanel className="overflow-hidden">
      {leaderboard.rows.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-[44rem] w-full text-sm">
            <thead className="border-b stitch-divider text-left">
              <tr className="font-telemetry text-[0.68rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                <th className="px-4 py-4">Место</th>
                <th className="px-4 py-4">Участник</th>
                <th className="px-4 py-4 text-right">Очки</th>
                <th className="px-4 py-4 text-right">Прогнозов</th>
                <th className="px-4 py-4 text-right">Средний балл</th>
                <th className="px-4 py-4 text-right">Лучший этап</th>
              </tr>
            </thead>
            <tbody className="divide-y stitch-divider">
              {leaderboard.rows.map((row) => (
                <tr className="transition-colors hover:bg-accent/40" key={`${row.rank}-${row.displayName}`}>
                  <td className="px-4 py-4">
                    <span className="inline-flex min-w-8 items-center gap-2 font-telemetry font-bold">
                      {row.rank <= 3 ? <Trophy aria-hidden="true" className="size-4 text-warning" /> : null}
                      {row.rank}
                    </span>
                  </td>
                  <td className="px-4 py-4 font-medium">{row.displayName}</td>
                  <td className="px-4 py-4 text-right font-telemetry font-bold">{row.totalScore}</td>
                  <td className="px-4 py-4 text-right">{row.predictionCount}</td>
                  <td className="px-4 py-4 text-right">{row.averageScore}</td>
                  <td className="px-4 py-4 text-right">
                    <div className="grid gap-1">
                      <span className="font-telemetry font-bold">{row.bestScore ?? "—"}</span>
                      {row.bestBreakdown ? (
                        <span className="text-xs text-muted-foreground">
                          Топ-10 {row.bestBreakdown.top10Points} · Бонусы {row.bestBreakdown.top10Bonus} · Спец {row.bestBreakdown.specialPoints}
                        </span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-6 text-sm leading-6 text-muted-foreground">
          Рейтинг появится, когда участники сохранят первые личные прогнозы.
        </div>
      )}
    </StitchPanel>
  );
}
