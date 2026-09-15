"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Trophy } from "lucide-react";

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
  const tabListRef = useRef<HTMLDivElement>(null);
  const selected = useMemo(
    () => sessions.find((item) => item.session.id === activeSessionId) ?? sessions[0] ?? null,
    [activeSessionId, sessions],
  );

  useEffect(() => {
    const tabList = tabListRef.current;
    const activeTab = activeSessionId
      ? document.getElementById(getSessionTabId(activeSessionId))
      : null;

    if (!tabList || !activeTab || window.matchMedia("(min-width: 768px)").matches) {
      return;
    }

    const targetLeft = activeTab.offsetLeft - (tabList.clientWidth - activeTab.clientWidth) / 2;
    tabList.scrollTo({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      left: Math.max(0, targetLeft),
    });
  }, [activeSessionId]);

  function selectSession(sessionId?: string) {
    if (!sessionId) {
      return;
    }

    setActiveSessionId(sessionId);

    const url = new URL(window.location.href);
    url.searchParams.set("session", sessionId);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function moveSessionFocus(event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) {
    const isPrevious = event.key === "ArrowLeft" || event.key === "ArrowUp";
    const isNext = event.key === "ArrowRight" || event.key === "ArrowDown";

    if (!isPrevious && !isNext && event.key !== "Home" && event.key !== "End") {
      return;
    }

    event.preventDefault();
    const targetIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? sessions.length - 1
        : (currentIndex + (isPrevious ? -1 : 1) + sessions.length) % sessions.length;
    const targetSessionId = sessions[targetIndex]?.session.id;

    if (!targetSessionId) {
      return;
    }

    selectSession(targetSessionId);
    window.requestAnimationFrame(() => {
      document.getElementById(getSessionTabId(targetSessionId))?.focus();
    });
  }

  if (!selected) {
    return (
      <div className="rounded-md border border-border/70 p-5 text-sm text-muted-foreground">
        Расписание этапа пока не синхронизировано.
      </div>
    );
  }

  const { results, session } = selected;
  const stats = getSessionStats(session, results, includeWeather);

  return (
    <div className="grid min-w-0 gap-3 sm:gap-5">
      <div
        aria-label="Сессии этапа"
        className="flex min-w-0 snap-x snap-mandatory gap-2 overflow-x-auto pb-1 overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:overflow-visible md:pb-0"
        ref={tabListRef}
        role="tablist"
        style={{ gridTemplateColumns: `repeat(${sessions.length}, minmax(0, 1fr))` }}
      >
        {sessions.map((item, index) => {
          const isActive = item.session.id === session.id;
          const tabStatus = item.results.length ? "Есть результаты" : item.session.status;
          const sessionStart = splitSessionStart(item.session.startsAt);

          return (
            <button
              aria-controls={item.session.id ? getSessionPanelId(item.session.id) : undefined}
              aria-selected={isActive}
              aria-label={`${formatSessionName(item.session.name)}, ${item.session.startsAt}, ${tabStatus}`}
              className={cn(
                "grid min-h-[4.75rem] w-[9.25rem] flex-none snap-start content-between overflow-hidden rounded-md border px-3 py-2.5 text-left transition-[background-color,border-color,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px md:h-16 md:min-h-0 md:w-auto md:min-w-0 md:px-3 md:py-2",
                isActive
                  ? "border-primary bg-primary/12 text-foreground"
                  : "border-border bg-background/65 text-muted-foreground hover:border-foreground/20 hover:bg-accent hover:text-foreground",
              )}
              id={item.session.id ? getSessionTabId(item.session.id) : undefined}
              key={item.session.id ?? item.session.name}
              onClick={() => selectSession(item.session.id)}
              onKeyDown={(event) => moveSessionFocus(event, index)}
              role="tab"
              tabIndex={isActive ? 0 : -1}
              type="button"
            >
              <span className="line-clamp-2 text-sm font-bold leading-4 md:truncate">
                {formatSessionName(item.session.name)}
              </span>
              <span className={cn(
                "mt-1 block min-w-0 font-telemetry text-[0.64rem] font-semibold leading-[1.2]",
                isActive && "text-primary",
              )}>
                {sessionStart.time ? <span className="block whitespace-nowrap">{sessionStart.time}</span> : null}
                <span className={cn("block whitespace-nowrap", sessionStart.time && "mt-0.5")}>{sessionStart.date}</span>
              </span>
            </button>
          );
        })}
      </div>

      <section
        aria-labelledby={session.id ? getSessionTabId(session.id) : undefined}
        aria-live="polite"
        className="-mx-4 -mb-4 min-w-0 overflow-hidden border-y border-border/80 bg-transparent sm:mx-0 sm:mb-0 sm:rounded-lg sm:border sm:bg-background/35"
        id={session.id ? getSessionPanelId(session.id) : undefined}
        role="tabpanel"
      >
        <div
          className={cn(
            "grid gap-px border-b border-border/70 bg-border/70",
            includeWeather ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-1 sm:grid-cols-3",
          )}
        >
          {stats.map((stat) => (
            <div className="min-h-[3.75rem] bg-card px-3 py-2.5 sm:min-h-[4.75rem] sm:px-5 sm:py-3" key={stat.label}>
              <p className="text-xs font-semibold text-muted-foreground">{stat.label}</p>
              <div className="mt-1 sm:mt-1.5">{stat.value}</div>
            </div>
          ))}
        </div>

        {results.length ? (
          <div className="min-w-0">
            <div className="hidden grid-cols-[2.75rem_minmax(10rem,1.3fr)_minmax(7.5rem,0.8fr)_minmax(6.75rem,0.75fr)_3.5rem_3.5rem] gap-2 border-b border-border/70 bg-muted/25 px-5 py-2.5 text-xs font-semibold text-muted-foreground md:grid">
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

function splitSessionStart(value: string) {
  const separatorIndex = value.lastIndexOf(",");

  if (separatorIndex < 0) {
    return { date: value, time: null };
  }

  return {
    date: value.slice(0, separatorIndex).trim(),
    time: value.slice(separatorIndex + 1).trim() || null,
  };
}

function ResultRow({ result, season }: { result: SessionResult; season: number }) {
  const resultValue = result.time && result.time !== "-"
    ? result.time
    : result.status || "—";

  return (
    <li
      className={cn(
        "grid min-w-0 grid-cols-[2.35rem_minmax(0,1fr)_auto] items-center gap-x-2.5 px-3 py-3 transition-colors hover:bg-accent/35 md:grid-cols-[2.75rem_minmax(10rem,1.3fr)_minmax(7.5rem,0.8fr)_minmax(6.75rem,0.75fr)_3.5rem_3.5rem] md:gap-2 md:px-5 md:py-3.5",
        result.position && result.position <= 3 && "bg-primary/[0.035]",
      )}
    >
      <span className={cn(
        "font-telemetry text-sm font-extrabold text-muted-foreground",
        result.position === 1 && "text-primary",
      )}>
        {result.position ? `P${result.position}` : "-"}
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
        {result.laps ?? "-"}
      </span>
      <span className="hidden text-right font-telemetry text-sm font-bold md:block">
        {result.points ?? "-"}
      </span>
    </li>
  );
}

function getSessionTabId(sessionId: string) {
  return `session-tab-${sessionId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function getSessionPanelId(sessionId: string) {
  return `session-panel-${sessionId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
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
  const bestResult = results[0];
  const normalizedName = session.name.toLowerCase();
  const isRace = session.type === "race" || session.type === "sprint" || normalizedName.includes("гонка");
  const isQualifying = session.type === "qualifying" || normalizedName.includes("квалифика");
  const fastestLap = isRace ? getSessionFastestLap(results) : null;
  const stats: Array<{ label: string; value: ReactNode }> = [
    {
      label: "Участников",
      value: <MetricValue>{results.length ? String(results.length) : "-"}</MetricValue>,
    },
  ];

  if (isRace || isQualifying) {
    stats.push({
      label: "Победитель",
      value: <MetricValue>{bestResult?.driver ?? "-"}</MetricValue>,
    });
  } else {
    stats.push({
      label: "Лидер",
      value: <MetricValue>{bestResult?.driver ?? "-"}</MetricValue>,
    });
  }

  stats.push({
    label: isRace ? "Лучший круг" : "Время",
    value: isRace ? (
      <div className="grid min-w-0 gap-0.5">
        <MetricValue>{fastestLap?.time ?? "-"}</MetricValue>
        {fastestLap ? (
          <span className="truncate text-xs font-semibold text-muted-foreground">
            {fastestLap.driver}
          </span>
        ) : null}
      </div>
    ) : (
      <MetricValue>{bestResult?.time ?? "-"}</MetricValue>
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

function getSessionFastestLap(results: SessionResult[]) {
  return results
    .map((result) => ({
      driver: result.driver,
      milliseconds: parseLapTime(result.bestLap),
      time: result.bestLap?.trim() ?? "",
    }))
    .filter(
      (result): result is { driver: string; milliseconds: number; time: string } =>
        result.milliseconds !== null && Boolean(result.time),
    )
    .sort((left, right) => left.milliseconds - right.milliseconds)[0] ?? null;
}

function parseLapTime(value?: string | null) {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  const minuteMatch = normalized.match(/^(\d+):(\d{1,2})(?:\.(\d+))?$/);

  if (minuteMatch) {
    const milliseconds = Number((minuteMatch[3] ?? "").padEnd(3, "0").slice(0, 3));
    return Number(minuteMatch[1]) * 60_000 + Number(minuteMatch[2]) * 1_000 + milliseconds;
  }

  const seconds = Number(normalized);
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1_000) : null;
}

function MetricValue({ children }: { children: ReactNode }) {
  return <p className="font-telemetry text-sm font-bold text-foreground">{children}</p>;
}
