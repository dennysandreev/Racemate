import { CheckCircle2, Cloud, CloudRain, CloudSun, Sun } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatSessionName } from "@/lib/session-display";
import type { WeekendSession } from "@/types/racemate";

type SessionWeatherTileProps = {
  session: WeekendSession;
  isActive?: boolean;
  compact?: boolean;
  showStatusBadge?: boolean;
};

export function SessionWeatherTile({
  session,
  isActive,
  compact,
  showStatusBadge = true,
}: SessionWeatherTileProps) {
  const isLive = session.status === "Live";
  const isCompleted = session.status === "Завершена";
  const isHighlighted = isLive || (isActive && !isCompleted);
  const sessionStart = splitSessionStart(session.startsAt);

  return (
    <div
      className={cn(
        "relative min-h-24 rounded-md border p-3 transition-colors backdrop-blur-md",
        isLive
          ? "border-success bg-success/12 text-foreground shadow-[0_0_18px_rgb(57_255_20_/_0.12)]"
          : isHighlighted
            ? "border-primary bg-primary/8 text-foreground shadow-[inset_0_0_0_1px_rgb(225_6_0_/_0.32)]"
          : "border-border bg-muted/70",
        isCompleted && !isLive && "bg-muted/45 text-muted-foreground",
        compact && "min-h-20",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display truncate text-xs font-bold">{formatSessionName(session.name)}</p>
          <p
            className={cn(
              "mt-1 grid gap-0.5 text-[0.7rem] leading-tight",
              isLive
                ? "text-success"
                : isHighlighted
                  ? "text-muted-foreground"
                  : "text-muted-foreground",
            )}
          >
            <span className="truncate">{sessionStart.date}</span>
            {sessionStart.time ? <span className="truncate">{sessionStart.time}</span> : null}
          </p>
        </div>
        {isCompleted ? (
          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
        ) : (
          renderWeatherIcon(session.weather?.precipitationMm)
        )}
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <div>
          <p className="font-telemetry whitespace-nowrap text-lg leading-none">
            {session.weather?.temperature ?? "—"}
          </p>
          <p
            className={cn(
              "mt-2 text-xs",
              isLive
                ? "text-success"
                : isHighlighted
                  ? "text-muted-foreground"
                  : "text-muted-foreground",
            )}
          >
            {getWeatherLabel(session.weather?.precipitationMm)}
          </p>
        </div>
        {showStatusBadge ? (
          <Badge variant={isLive ? "success" : isCompleted ? "outline" : "warning"}>
            {isLive ? "Live" : isHighlighted ? "Сейчас" : isCompleted ? "Завершена" : "Ожидается"}
          </Badge>
        ) : null}
      </div>
    </div>
  );
}

function splitSessionStart(value: string) {
  const [date, time] = value.split(/,\s*(?=\d{1,2}:\d{2})/);

  return {
    date: date?.trim() || value,
    time: time?.trim() ?? "",
  };
}

function renderWeatherIcon(precipitationMm?: number | null) {
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
    return "Дождь";
  }

  if (precipitationMm > 0) {
    return "Может моросить";
  }

  return "Сухо";
}
