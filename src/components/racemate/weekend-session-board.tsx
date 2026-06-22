"use client";

import { useState } from "react";
import { CheckCircle2, Cloud, CloudRain, CloudSun, Sun } from "lucide-react";

import { SessionResultsDialog, type SessionWithResults } from "@/components/racemate/session-results-dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatSessionName } from "@/lib/session-display";

type WeekendSessionBoardProps = {
  activeSessionName: string;
  sessions: SessionWithResults[];
};

export function WeekendSessionBoard({
  activeSessionName,
  sessions,
}: WeekendSessionBoardProps) {
  const [selected, setSelected] = useState<SessionWithResults | null>(null);

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

      <SessionResultsDialog onClose={() => setSelected(null)} selected={selected} />
    </>
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
