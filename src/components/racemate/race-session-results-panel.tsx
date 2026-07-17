"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { Trophy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatSessionName } from "@/lib/session-display";
import type { SessionResult, WeekendSession } from "@/types/racemate";

type RaceSessionResultsPanelProps = {
  includeWeather: boolean;
  initialSessionId?: string;
  season: number;
  sessions: Array<{
    results: SessionResult[];
    session: WeekendSession;
  }>;
};

export function RaceSessionResultsPanel({
  includeWeather,
  initialSessionId,
  season,
  sessions,
}: RaceSessionResultsPanelProps) {
  const fallbackSessionId = sessions[0]?.session.id;
  const [activeSessionId, setActiveSessionId] = useState(
    initialSessionId ?? fallbackSessionId,
  );
  const selected = useMemo(
    () => sessions.find((item) => item.session.id === activeSessionId) ?? sessions[0] ?? null,
    [activeSessionId, sessions],
  );

  function selectSession(sessionId?: string) {
    if (!sessionId) {
      return;
    }

    setActiveSessionId(sessionId);

    const url = new URL(window.location.href);
    url.searchParams.set("session", sessionId);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  if (!selected) {
    return (
      <div className="rounded-md border border-border/70 p-5 text-sm text-muted-foreground">
        Расписание этапа пока не синхронизировано.
      </div>
    );
  }

  const { results, session } = selected;
  const sessionStatus = results.length ? "Завершена" : session.status;
  const stats = getSessionStats(session, results, includeWeather);

  return (
    <div className="grid min-w-0 gap-4">
      <div
        aria-label="Сессии этапа"
        className="flex min-w-0 gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]"
        role="tablist"
      >
        {sessions.map((item) => {
          const isActive = item.session.id === session.id;

          return (
            <button
              aria-selected={isActive}
              className={cn(
                "min-h-10 shrink-0 rounded-md border px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-muted/45 text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              key={item.session.id ?? item.session.name}
              onClick={() => selectSession(item.session.id)}
              role="tab"
              type="button"
            >
              {formatSessionName(item.session.name)}
            </button>
          );
        })}
      </div>

      <section aria-live="polite" className="min-w-0 overflow-hidden rounded-md border border-border/70">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-3 py-3 sm:px-4">
          <div className="min-w-0">
            <h3 className="font-display text-lg font-bold leading-tight">
              {formatSessionName(session.name)}
            </h3>
            <p className="mt-1 font-telemetry text-xs font-semibold text-muted-foreground">
              {session.startsAt}
            </p>
          </div>
          <Badge variant={sessionStatus === "Завершена" ? "success" : "warning"}>
            {sessionStatus}
          </Badge>
        </header>

        <div
          className={cn(
            "grid gap-px border-b border-border/70 bg-border/70",
            includeWeather ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-1 sm:grid-cols-3",
          )}
        >
          {stats.map((stat) => (
            <div className="min-h-16 bg-card px-3 py-2.5 sm:px-4" key={stat.label}>
              <p className="text-xs font-semibold text-muted-foreground">{stat.label}</p>
              <div className="mt-1">{stat.value}</div>
            </div>
          ))}
        </div>

        {results.length ? (
          <div className="min-w-0">
            <div className="hidden grid-cols-[2.75rem_minmax(10rem,1.3fr)_minmax(7.5rem,0.8fr)_minmax(6.75rem,0.75fr)_3.5rem_3.5rem] gap-2 border-b border-border/70 bg-muted/15 px-4 py-2.5 text-xs font-semibold text-muted-foreground md:grid">
              <span>Поз.</span>
              <span>Пилот</span>
              <span>Команда</span>
              <span>Время</span>
              <span>Круги</span>
              <span className="text-right">Очки</span>
            </div>
            <ol className="divide-y divide-border/70">
              {results.map((result, index) => (
                <ResultRow
                  key={`${result.position ?? index}-${result.driver}-${result.time}`}
                  result={result}
                  season={season}
                />
              ))}
            </ol>
          </div>
        ) : (
          <div className="grid min-h-44 place-items-center px-4 py-8 text-center">
            <div>
              <Trophy className="mx-auto size-7 text-muted-foreground" aria-hidden="true" />
              <p className="mt-3 font-medium">Результатов пока нет</p>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                Таблица появится сразу после синхронизации этой сессии.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function ResultRow({ result, season }: { result: SessionResult; season: number }) {
  const resultValue = result.time && result.time !== "-"
    ? result.time
    : result.status || "—";

  return (
    <li className="grid min-w-0 grid-cols-[2.35rem_minmax(0,1fr)_auto] items-center gap-x-2.5 px-3 py-3 transition-colors hover:bg-accent/35 md:grid-cols-[2.75rem_minmax(10rem,1.3fr)_minmax(7.5rem,0.8fr)_minmax(6.75rem,0.75fr)_3.5rem_3.5rem] md:gap-2 md:px-4 md:py-3">
      <span className="font-telemetry text-sm font-extrabold text-muted-foreground">
        {result.position ? `P${result.position}` : "—"}
      </span>

      <div className="flex min-w-0 items-center gap-2.5">
        {result.driverNumber ? (
          <span className="grid size-8 shrink-0 place-items-center rounded-sm bg-muted font-telemetry text-xs font-extrabold text-foreground">
            {result.driverNumber}
          </span>
        ) : null}
        <div className="min-w-0">
          <p className="text-sm font-bold leading-4 text-foreground md:truncate">
            {result.driverSlug ? (
              <Link
                className="transition-colors hover:text-primary"
                href={`/drivers/${result.driverSlug}?season=${season}`}
                prefetch={false}
              >
                {result.driver}
              </Link>
            ) : (
              result.driver
            )}
          </p>
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground md:hidden">
            <TeamDot color={result.teamColor} />
            <span className="truncate">{result.team}</span>
          </p>
        </div>
      </div>

      <div className="text-right md:hidden">
        <p className="whitespace-nowrap font-telemetry text-sm font-extrabold text-foreground">
          {resultValue}
        </p>
        <p className="mt-1 whitespace-nowrap text-[0.67rem] font-semibold text-muted-foreground">
          {result.laps !== null ? `${result.laps} кр.` : null}
          {result.laps !== null && result.points !== null ? " · " : null}
          {result.points !== null ? `${result.points} очк.` : null}
        </p>
      </div>

      <div className="hidden min-w-0 items-center gap-2 text-sm text-muted-foreground md:flex">
        <TeamDot color={result.teamColor} />
        <span className="truncate">{result.team}</span>
      </div>
      <span className="hidden break-words font-telemetry text-sm font-semibold text-foreground md:block">
        {resultValue}
      </span>
      <span className="hidden font-telemetry text-sm text-muted-foreground md:block">
        {result.laps ?? "—"}
      </span>
      <span className="hidden text-right font-telemetry text-sm font-bold md:block">
        {result.points ?? "—"}
      </span>
    </li>
  );
}

function TeamDot({ color }: { color?: string }) {
  return (
    <span
      aria-hidden="true"
      className="size-2 shrink-0 rounded-full bg-muted-foreground"
      style={color ? { backgroundColor: color } : undefined}
    />
  );
}

function getSessionStats(
  session: WeekendSession,
  results: SessionResult[],
  includeWeather: boolean,
) {
  const pointsTotal = results.reduce((sum, result) => sum + (result.points ?? 0), 0);
  const bestResult = results[0];
  const normalizedName = session.name.toLowerCase();
  const isRace = session.type === "race" || session.type === "sprint" || normalizedName.includes("гонка");
  const isQualifying = session.type === "qualifying" || normalizedName.includes("квалифика");
  const stats: Array<{ label: string; value: ReactNode }> = [
    {
      label: "Участников",
      value: <MetricValue>{results.length ? String(results.length) : "—"}</MetricValue>,
    },
  ];

  if (isRace || isQualifying) {
    stats.push({
      label: "Победитель",
      value: <MetricValue>{bestResult?.driver ?? "—"}</MetricValue>,
    });
  } else {
    stats.push({
      label: "Лидер",
      value: <MetricValue>{bestResult?.driver ?? "—"}</MetricValue>,
    });
  }

  stats.push({
    label: isRace ? "Очки" : "Время",
    value: (
      <MetricValue>
        {isRace ? (pointsTotal > 0 ? String(pointsTotal) : "—") : bestResult?.time ?? "—"}
      </MetricValue>
    ),
  });

  if (includeWeather) {
    stats.push({
      label: "Погода",
      value: session.weather ? (
        <div className="grid gap-0.5 font-telemetry text-sm font-bold leading-5">
          <span>{session.weather.temperature}</span>
          <span className="text-xs font-semibold text-muted-foreground">
            {session.weather.precipitation}
          </span>
        </div>
      ) : (
        <MetricValue>Нет данных</MetricValue>
      ),
    });
  }

  return stats;
}

function MetricValue({ children }: { children: ReactNode }) {
  return <p className="font-telemetry text-sm font-bold text-foreground">{children}</p>;
}
