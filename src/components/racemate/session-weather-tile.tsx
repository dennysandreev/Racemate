import { CheckCircle2, Cloud, CloudRain, CloudSun, Sun } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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
  const isCompleted = session.status === "Завершена";

  return (
    <div
      className={cn(
        "relative min-h-24 rounded-md border p-3 transition-colors",
        isActive
          ? "border-primary bg-primary text-primary-foreground shadow-sm"
          : "border-border/70 bg-muted",
        isCompleted && !isActive && "bg-muted/45 text-muted-foreground",
        compact && "min-h-20",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium">{session.name}</p>
          <p
            className={cn(
              "mt-1 truncate text-[0.7rem]",
              isActive ? "text-primary-foreground/75" : "text-muted-foreground",
            )}
          >
            {session.startsAt}
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
          <p className="whitespace-nowrap font-mono text-lg leading-none">
            {session.weather?.temperature ?? "—"}
          </p>
          <p
            className={cn(
              "mt-2 text-xs",
              isActive ? "text-primary-foreground/75" : "text-muted-foreground",
            )}
          >
            {getWeatherLabel(session.weather?.precipitationMm)}
          </p>
        </div>
        {showStatusBadge ? (
          <Badge variant={isActive ? "secondary" : isCompleted ? "outline" : "warning"}>
            {isActive ? "Сейчас" : isCompleted ? "Завершена" : "Ожидается"}
          </Badge>
        ) : null}
      </div>
    </div>
  );
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
    return "Есть дождь";
  }

  if (precipitationMm > 0) {
    return "Может моросить";
  }

  return "Сухо";
}
