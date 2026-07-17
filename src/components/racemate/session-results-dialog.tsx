"use client";

import Link from "next/link";
import { useEffect, useId } from "react";
import { X } from "lucide-react";

import { TeamLogo } from "@/components/racemate/team-logo";
import { Button } from "@/components/ui/button";
import { formatSessionName } from "@/lib/session-display";
import type { SessionResult, WeekendSession } from "@/types/racemate";

export type SessionWithResults = {
  results: SessionResult[];
  session: WeekendSession;
};

type SessionResultsDialogProps = {
  onClose: () => void;
  selected: SessionWithResults | null;
};

export function SessionResultsDialog({ onClose, selected }: SessionResultsDialogProps) {
  const titleId = useId();

  useEffect(() => {
    if (!selected) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, selected]);

  if (!selected) {
    return null;
  }

  const sessionStatus = selected.results.length ? "Завершена" : selected.session.status;

  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-50 grid items-stretch bg-background/82 p-0 backdrop-blur-sm sm:place-items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
    >
      <div className="flex h-dvh max-h-dvh w-full max-w-4xl flex-col overflow-hidden bg-card shadow-2xl sm:h-auto sm:max-h-[88dvh] sm:rounded-lg sm:border sm:border-border">
        <div className="relative z-10 flex shrink-0 items-start justify-between gap-4 border-b border-border/70 bg-card px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] sm:p-5">
          <div>
            <h2 className="text-xl font-semibold" id={titleId}>{formatSessionName(selected.session.name)}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{selected.session.startsAt}</p>
          </div>
          <Button aria-label="Закрыть результаты" onClick={onClose} size="sm" type="button" variant="secondary">
            <X aria-hidden="true" className="size-4" />
          </Button>
        </div>

        <div
          className="min-h-0 flex-1 touch-pan-y space-y-3 overflow-y-scroll overscroll-contain p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:space-y-4 sm:p-5"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-md border border-border/70 bg-muted/50 p-3 text-sm sm:grid-cols-4 sm:gap-3">
            <Metric label="Статус" value={sessionStatus} />
            <Metric label="Температура" value={selected.session.weather?.temperature ?? "Нет данных"} />
            <Metric label="Ветер" value={selected.session.weather?.wind ?? "Нет данных"} />
            <Metric label="Осадки" value={selected.session.weather?.precipitation ?? "Нет данных"} />
          </div>

          {selected.results.length ? (
            <>
              <ol className="divide-y divide-border/70 overflow-hidden rounded-md border border-border/70 sm:hidden">
                {selected.results.map((result) => {
                  const resultValue = result.time && result.time !== "-"
                    ? result.time
                    : result.status || "—";

                  return (
                    <li
                      className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2.5 px-3 py-2.5"
                      key={`${result.position}-${result.driver}-${result.time}`}
                    >
                      <span className="font-telemetry text-sm font-extrabold text-muted-foreground">
                        {result.position ?? "–"}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-foreground">
                          {result.driverSlug ? (
                            <Link className="transition-colors hover:text-primary" href={`/drivers/${result.driverSlug}`}>
                              {result.driver}
                            </Link>
                          ) : result.driver}
                        </p>
                        <p className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
                          <span
                            aria-hidden="true"
                            className="size-1.5 shrink-0 rounded-full bg-muted-foreground"
                            style={result.teamColor ? { backgroundColor: result.teamColor } : undefined}
                          />
                          <span className="truncate">{result.team}</span>
                        </p>
                      </div>
                      <div className="min-w-[5rem] text-right">
                        <p className="font-telemetry whitespace-nowrap text-sm font-extrabold text-foreground">
                          {resultValue}
                        </p>
                        {result.laps !== null || result.points !== null ? (
                          <p className="mt-1 whitespace-nowrap text-[0.65rem] font-semibold text-muted-foreground">
                            {result.laps !== null ? `${result.laps} кр.` : null}
                            {result.laps !== null && result.points !== null ? " · " : null}
                            {result.points !== null ? `${result.points} очк.` : null}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>

              <div className="hidden overflow-x-auto rounded-md border border-border/70 sm:block">
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
                    <tr className="border-b border-border/70 last:border-b-0" key={`${result.position}-${result.driver}-${result.time}`}>
                      <td className="px-4 py-3 font-mono text-muted-foreground">{result.position ?? "-"}</td>
                      <td className="px-4 py-3 font-medium">
                        {result.driverSlug ? (
                          <Link className="transition-colors hover:text-primary" href={`/drivers/${result.driverSlug}`}>
                            {result.driver}
                          </Link>
                        ) : result.driver}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <span className="flex items-center gap-2">
                          <TeamLogo code={result.teamCode} color={result.teamColor} logo={result.teamLogo} name={result.team} />
                          <span>{result.team}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-muted-foreground">{result.time}</td>
                      <td className="px-4 py-3 font-mono text-muted-foreground">{result.laps ?? "-"}</td>
                      <td className="px-4 py-3 text-right font-mono">{result.points ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </>
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
