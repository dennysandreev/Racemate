import { Crown, ListOrdered } from "lucide-react";

import { FantasyLeagueAvatar } from "@/components/fantasy/fantasy-league-avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { GlobalFantasyLeaderboard } from "@/types/racemate";

export type FantasyLeaderboardPanelRow = {
  averageScore: number;
  bestBreakdown?: GlobalFantasyLeaderboard["rows"][number]["bestBreakdown"];
  bestScore: number | null;
  displayName: string;
  isCurrentUser?: boolean;
  key: string;
  predictionCount: number;
  rank: number;
  totalScore: number;
};

export function GlobalFantasyLeaderboardPanel({
  currentDisplayName,
  leaderboard,
}: {
  currentDisplayName?: string | null;
  leaderboard: GlobalFantasyLeaderboard;
}) {
  const rows: FantasyLeaderboardPanelRow[] = leaderboard.rows.map((row) => ({
    ...row,
    isCurrentUser: isSameName(row.displayName, currentDisplayName),
    key: `${row.rank}-${row.displayName}`,
  }));
  const currentUser = rows.find((row) => row.isCurrentUser) ?? null;

  return (
    <div className="grid gap-4">
      {rows.length ? <LeaderboardPodium rows={rows.slice(0, 3)} /> : null}
      {currentUser ? <CurrentUserSummary row={currentUser} /> : null}
      <FantasyLeaderboardPanel
        emptyText="Рейтинг появится, когда участники сохранят первые личные прогнозы."
        rows={rows}
        title="Рейтинг сезона"
      />
    </div>
  );
}

function LeaderboardPodium({ rows }: { rows: FantasyLeaderboardPanelRow[] }) {
  const order = [rows[1], rows[0], rows[2]].filter(Boolean) as FantasyLeaderboardPanelRow[];

  return (
    <section aria-label="Лидеры сезона" className="overflow-hidden border-y stitch-divider px-3 pb-5 pt-8 sm:px-8 sm:pb-7 sm:pt-10">
      <div className="grid grid-cols-3 items-end gap-2 sm:gap-6">
        {order.map((row) => (
          <article
            className={cn(
              "relative grid min-w-0 justify-items-center text-center",
              row.rank === 1 && "-translate-y-2 sm:-translate-y-3",
            )}
            key={row.key}
          >
            <div
              aria-hidden="true"
              className={cn(
                "absolute left-1/2 top-2 -translate-x-1/2 font-telemetry text-5xl font-black opacity-10 sm:text-7xl",
                row.rank === 1 && "text-[#f4c95d] opacity-20",
                row.rank === 2 && "text-[#cbd5e1]",
                row.rank === 3 && "text-[#d48a5f]",
              )}
            >
              {row.rank}
            </div>
            <div
              className={cn(
                "relative mb-3 rounded-full border-2 p-1",
                row.rank === 1
                  ? "border-[#f4c95d]/80 shadow-[0_0_36px_rgb(244_201_93_/_0.18)]"
                  : row.rank === 2
                    ? "border-[#cbd5e1]/65"
                    : "border-[#d48a5f]/65",
              )}
            >
              {row.rank === 1 ? (
                <span className="absolute -top-6 left-1/2 z-10 -translate-x-1/2 text-[#f4c95d]">
                  <Crown aria-hidden="true" className="size-5 sm:size-6" />
                </span>
              ) : null}
              <FantasyLeagueAvatar
                ariaLabel={`Аватар участника ${row.displayName}`}
                className={cn(
                  "rounded-full border-0 bg-secondary text-base sm:text-xl",
                  row.rank === 1 ? "size-18 sm:size-24" : "size-14 sm:size-20",
                )}
                name={row.displayName}
              />
              <span
                className={cn(
                  "absolute -bottom-2 left-1/2 grid size-7 -translate-x-1/2 place-items-center rounded-full border-2 border-background bg-secondary font-telemetry text-xs font-black",
                  row.rank === 1 && "bg-[#f4c95d] text-black",
                )}
              >
                {row.rank}
              </span>
            </div>
            <h2 className="relative w-full truncate font-display text-sm font-extrabold sm:text-base">{row.displayName}</h2>
            <p className="relative mt-1 font-telemetry text-lg font-black sm:text-2xl">{row.totalScore}</p>
            <p className="relative mt-1 hidden text-xs font-semibold text-muted-foreground sm:block">очков за сезон</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function CurrentUserSummary({ row }: { row: FantasyLeaderboardPanelRow }) {
  return (
    <section className="grid gap-4 border-y border-primary/35 bg-primary/8 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_repeat(3,auto)] sm:items-center sm:gap-10 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <FantasyLeagueAvatar
          ariaLabel={`Твой аватар: ${row.displayName}`}
          className="size-12 rounded-full"
          name={row.displayName}
        />
        <div className="min-w-0">
        <p className="stitch-label text-primary">Твоя позиция</p>
        <p className="mt-1 truncate font-display text-xl font-extrabold">{row.displayName}</p>
        </div>
      </div>
      <SummaryMetric label="Место" value={`#${row.rank}`} />
      <SummaryMetric label="Очки" value={String(row.totalScore)} />
      <SummaryMetric label="Прогнозов" value={String(row.predictionCount)} />
    </section>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="sm:text-right">
      <p className="font-telemetry text-xl font-black">{value}</p>
      <p className="mt-1 text-xs font-semibold text-muted-foreground">{label}</p>
    </div>
  );
}

export function FantasyLeaderboardPanel({
  emptyText,
  rows,
  subtitle,
  title,
}: {
  emptyText: string;
  rows: FantasyLeaderboardPanelRow[];
  subtitle?: string;
  title: string;
}) {
  return (
    <div>
      <section className="overflow-hidden rounded-xl border stitch-divider bg-card/45">
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b stitch-divider px-4 py-2 sm:px-5">
          <div className="flex items-center gap-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
              <ListOrdered aria-hidden="true" className="size-4" />
            </span>
            <div>
              <h2 className="font-display text-base font-bold leading-tight">{title}</h2>
              {subtitle ? <p className="mt-1 text-xs font-medium text-muted-foreground">{subtitle}</p> : null}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Badge variant="secondary">{rows.length} участников</Badge>
          </div>
        </div>
        {rows.length ? <div className="hidden grid-cols-[4rem_2.5rem_minmax(10rem,1fr)_7rem_7rem_7rem_7rem] gap-4 border-b stitch-divider px-5 py-2.5 font-telemetry text-[0.62rem] font-bold uppercase tracking-[0.12em] text-muted-foreground lg:grid">
          <span>Место</span>
          <span className="col-span-2">Участник</span>
          <span className="text-right">Прогнозов</span>
          <span className="text-right">Среднее</span>
          <span className="text-right">Лучший</span>
          <span className="text-right">Очки</span>
        </div> : null}
        {rows.length ? <ol>
          {rows.map((row) => {
            return (
              <li
                className={cn(
                  "grid grid-cols-[1.75rem_2.25rem_minmax(0,1fr)_auto] items-center gap-x-2 border-t stitch-divider px-3 py-2.5 transition-colors first:border-t-0 hover:bg-accent/35 lg:grid-cols-[4rem_2.5rem_minmax(10rem,1fr)_7rem_7rem_7rem_7rem] lg:gap-4 lg:px-5",
                  row.isCurrentUser && "bg-primary/8 shadow-[inset_3px_0_0_rgb(225_6_0)]",
                )}
                key={row.key}
              >
                <span
                  className={cn(
                    "font-telemetry text-sm font-extrabold",
                    row.rank === 1 && "text-[#f4c95d]",
                    row.rank === 2 && "text-[#cbd5e1]",
                    row.rank === 3 && "text-[#d48a5f]",
                    row.rank > 3 && "text-muted-foreground",
                    row.isCurrentUser && "text-foreground",
                  )}
                >
                  {row.rank}
                </span>
                <FantasyLeagueAvatar
                  ariaLabel={`Аватар участника ${row.displayName}`}
                  className="size-9 rounded-full"
                  name={row.displayName}
                />
                <div className="min-w-0">
                  <p className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-bold">{row.displayName}</span>
                    {row.isCurrentUser ? (
                      <span className="font-telemetry shrink-0 rounded border border-primary/45 bg-primary/12 px-1.5 py-0.5 text-[0.55rem] font-extrabold uppercase tracking-[0.08em] text-primary">
                        Вы
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 flex flex-wrap gap-x-2 text-[0.7rem] font-semibold leading-4 text-muted-foreground lg:hidden">
                    <span>{row.predictionCount} прогнозов</span>
                    <span>среднее {row.averageScore}</span>
                    <span>лучший {row.bestScore ?? "-"}</span>
                  </p>
                </div>
                <span className="hidden font-telemetry text-right text-sm font-bold text-muted-foreground lg:block">{row.predictionCount}</span>
                <span className="hidden font-telemetry text-right text-sm font-bold text-muted-foreground lg:block">{row.averageScore}</span>
                <span className="hidden font-telemetry text-right text-sm font-bold text-muted-foreground lg:block">{row.bestScore ?? "-"}</span>
                <span className="font-telemetry text-right text-base font-extrabold">{row.totalScore}</span>
              </li>
            );
          })}
        </ol> : (
          <p className="px-5 py-6 text-sm leading-6 text-muted-foreground">{emptyText}</p>
        )}
      </section>
    </div>
  );
}

function isSameName(name: string, currentDisplayName?: string | null) {
  return Boolean(currentDisplayName && name.trim().toLowerCase() === currentDisplayName.trim().toLowerCase());
}
