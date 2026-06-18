"use client";

import { useEffect, useId, useState } from "react";
import { CheckCircle2, Cloud, CloudRain, CloudSun, Sun, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TeamLogo } from "@/components/racemate/team-logo";
import { cn } from "@/lib/utils";
import { formatSessionName } from "@/lib/session-display";
import type { SessionResult, WeekendSession } from "@/types/racemate";

type WeekendSessionWithResults = {
  results: SessionResult[];
  session: WeekendSession;
};

type WeekendSessionBoardProps = {
  activeSessionName: string;
  sessions: WeekendSessionWithResults[];
};

export function WeekendSessionBoard({
  activeSessionName,
  sessions,
}: WeekendSessionBoardProps) {
  const [selected, setSelected] = useState<WeekendSessionWithResults | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!selected) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelected(null);
      }
    };

    const previousOverflow = document.body.style.overflow;

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [selected]);

  return (
    <>
      <div className="overflow-hidden rounded-lg border border-border/70 bg-background/35">
        {sessions.map((item) => {
          const sessionStatus = item.results.length ? "Завершена" : item.session.status;
          const isLive = sessionStatus === "Live";
          const isCurrentTarget = item.session.name === activeSessionName;
          const isCompleted = sessionStatus === "Завершена";
          const isHighlighted = isLive || (isCurrentTarget && !isCompleted);

          return (
            <button
              className={cn(
                "group relative grid min-h-[3.9rem] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border/70 px-3 py-2.5 text-left transition-colors last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-4",
                isLive
                  ? "bg-success/10 text-foreground"
                  : isHighlighted
                    ? "bg-primary/10 text-foreground"
                    : "hover:bg-accent/70",
                isCompleted && "bg-muted/25 text-muted-foreground",
                "touch-manipulation",
              )}
              key={item.session.id ?? item.session.name}
              onClick={() => setSelected(item)}
              type="button"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "absolute bottom-2 left-0 top-2 w-0.5 rounded-r-full bg-border",
                  isLive && "bg-success",
                  isHighlighted && !isLive && "bg-primary",
                  isCompleted && "bg-muted-foreground/35",
                )}
              />
              <div className="flex min-w-0 items-center gap-3 pl-2">
                <Badge
                  className="hidden shrink-0 sm:inline-flex"
                  variant={isLive ? "success" : isCompleted ? "outline" : "warning"}
                >
                  {isLive ? "Live" : isCompleted ? "Завершена" : "Ожидается"}
                </Badge>
                <div className="min-w-0">
                  <p className="truncate font-display text-sm font-bold leading-tight sm:text-base">
                    {formatSessionName(item.session.name)}
                  </p>
                  <p className="mt-1 truncate font-telemetry text-[0.68rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    {item.session.startsAt}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {isCompleted ? (
                  <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
                ) : (
                  <WeatherIcon precipitationMm={item.session.weather?.precipitationMm} />
                )}
                <div className="text-right">
                  <p className="font-telemetry whitespace-nowrap text-base font-bold leading-none text-foreground">
                    {item.session.weather?.temperature ?? "—"}
                  </p>
                  <p className="mt-1 hidden whitespace-nowrap text-[0.68rem] text-muted-foreground sm:block">
                    {getWeatherLabel(item.session.weather?.precipitationMm)}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {selected ? (
        <div
          aria-labelledby={titleId}
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-background/82 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelected(null);
            }
          }}
          role="dialog"
        >
          <div className="flex max-h-[88dvh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
            <div className="shrink-0 flex items-start justify-between gap-4 border-b border-border/70 p-4 sm:p-5">
              <div>
                <h2 className="text-xl font-semibold" id={titleId}>
                  {formatSessionName(selected.session.name)}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selected.session.startsAt}
                </p>
              </div>
              <Button
                aria-label="Закрыть результаты"
                onClick={() => setSelected(null)}
                size="sm"
                type="button"
                variant="secondary"
              >
                <X aria-hidden="true" className="size-4" />
              </Button>
            </div>

            <div className="grid min-h-0 gap-4 overflow-y-auto p-4 sm:p-5">
              <div className="grid gap-3 rounded-md border border-border/70 bg-muted/50 p-3 text-sm sm:grid-cols-4">
                <Metric label="Статус" value={selected.session.status} />
                <Metric label="Температура" value={selected.session.weather?.temperature ?? "Нет данных"} />
                <Metric label="Ветер" value={selected.session.weather?.wind ?? "Нет данных"} />
                <Metric label="Осадки" value={selected.session.weather?.precipitation ?? "Нет данных"} />
              </div>

              {selected.results.length ? (
                <div className="overflow-x-auto rounded-md border border-border/70">
                  <table className="w-full min-w-[42rem] text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr className="border-b border-border/70">
                        <th className="px-4 py-3 font-medium">Поз.</th>
                        <th className="px-4 py-3 font-medium">Пилот</th>
                        <th className="px-4 py-3 font-medium">Команда</th>
                        <th className="px-4 py-3 font-medium">Время</th>
                        <th className="px-4 py-3 font-medium">Круги</th>
                        <th className="px-4 py-3 text-right font-medium">Очки</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.results.map((result) => (
                        <tr
                          className="border-b border-border/70 last:border-b-0"
                          key={`${result.position}-${result.driver}-${result.time}`}
                        >
                          <td className="px-4 py-3 font-mono text-muted-foreground">
                            {result.position ?? "-"}
                          </td>
                          <td className="px-4 py-3 font-medium">
                            {result.driver}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            <span className="flex items-center gap-2">
                              <TeamLogo
                                code={result.teamCode}
                                color={result.teamColor}
                                logo={result.teamLogo}
                                name={result.team}
                              />
                              <span>{result.team}</span>
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-muted-foreground">
                            {result.time}
                          </td>
                          <td className="px-4 py-3 font-mono text-muted-foreground">
                            {result.laps ?? "-"}
                          </td>
                          <td className="px-4 py-3 text-right font-mono">
                            {result.points ?? "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="grid min-h-44 place-items-center rounded-md border border-border/70 p-5 text-center">
                  <div>
                    <p className="font-medium">Результаты появятся после синхронизации</p>
                    <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                      RaceMate покажет таблицу сразу после обработки этой сессии.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

function WeatherIcon({ precipitationMm }: { precipitationMm?: number | null }) {
  if (precipitationMm === null || precipitationMm === undefined) {
    return <Cloud className="size-5 shrink-0" aria-hidden="true" />;
  }

  if (precipitationMm >= 0.4) {
    return <CloudRain className="size-5 shrink-0" aria-hidden="true" />;
  }

  if (precipitationMm > 0) {
    return <CloudSun className="size-5 shrink-0" aria-hidden="true" />;
  }

  return <Sun className="size-5 shrink-0" aria-hidden="true" />;
}

function getWeatherLabel(precipitationMm?: number | null) {
  if (precipitationMm === null || precipitationMm === undefined) {
    return "Прогноз уточняется";
  }

  if (precipitationMm >= 0.4) {
    return "Есть дождь";
  }

  if (precipitationMm > 0) {
    return "Может моросить";
  }

  return "Сухо";
}
