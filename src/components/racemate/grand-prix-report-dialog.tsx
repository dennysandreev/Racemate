"use client";

import Link from "next/link";
import { useCallback, useEffect } from "react";
import {
  AlertTriangle,
  Flag,
  Gauge,
  Newspaper,
  Sparkles,
  Timer,
  Trophy,
  TrendingDown,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { TeamColorBar } from "@/components/racemate/team-color";
import { TyreSequence } from "@/components/racemate/tyre-sequence";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getTeamAsset, getTeamAssetForDriver } from "@/data/f1-assets";
import { cn } from "@/lib/utils";
import type { GrandPrixReport } from "@/types/racemate";

type GrandPrixReportDialogProps = {
  driverSlugByName?: Record<string, string>;
  open: boolean;
  report: GrandPrixReport | null;
};

export function GrandPrixReportDialog({
  driverSlugByName = {},
  open,
  report,
}: GrandPrixReportDialogProps) {
  const router = useRouter();
  const closeReport = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("raceReport");
    router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
  }, [router]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeReport();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeReport, open]);

  if (!open || !report) {
    return null;
  }

  const podium = asStringArray(report.highlights.podium);
  const winner = asText(report.highlights.winner) ?? report.results[0]?.driver ?? "Победитель уточняется";
  const bestGain = asHighlight(report.highlights.bestGain);
  const biggestDrop = asHighlight(report.highlights.biggestDrop);
  const bestTeam = asHighlight(report.highlights.bestTeam, "team", "points");
  const fastestLap = asHighlight(report.highlights.fastestLap);
  const fastestPitStop = asHighlight(report.highlights.fastestPitStop, "driver", "duration");
  const safetyCarSummary = asText(report.highlights.safetyCarSummary);
  const mostCommonStrategy = asHighlight(report.highlights.mostCommonStrategy, "sequence", "drivers");
  const biggestDropTeam = getTeamVisualFromHighlight(report.highlights.biggestDrop, report.results);
  const bestTeamVisual = getTeamVisualFromHighlight(report.highlights.bestTeam, report.results, "team");
  const fastestPitStopTeam = getTeamVisualFromHighlight(report.highlights.fastestPitStop, report.results);
  const newsSummary = getNewsSummary(report.newsSummary);
  const summaryParagraphs = getSummaryParagraphs(report.aiSummary);

  return (
    <div
      aria-labelledby="grand-prix-report-title"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-background/84 p-3 backdrop-blur-md sm:p-6"
      onMouseDown={closeReport}
      role="dialog"
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-[0_24px_90px_rgb(0_0_0_/_0.55)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="shrink-0 border-b border-border bg-card/85 px-4 py-4 backdrop-blur sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={report.status === "ready" ? "success" : "warning"}>
                  {report.status === "ready" ? "Отчет готов" : "Частичный отчет"}
                </Badge>
                <Badge variant="outline">
                  {report.season}, раунд {report.round}
                </Badge>
              </div>
              <h2
                className="mt-4 text-balance font-display text-2xl font-extrabold leading-tight tracking-[-0.04em] text-foreground sm:text-4xl"
                id="grand-prix-report-title"
              >
                {report.raceName}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {report.circuitName} · {report.country} · {report.raceDate}
              </p>
            </div>
            <Button
              aria-label="Закрыть отчет"
              onClick={closeReport}
              size="icon"
              type="button"
              variant="ghost"
            >
              <X aria-hidden="true" data-icon="inline-start" />
            </Button>
          </div>
        </header>

        <div className="min-h-0 overflow-y-auto">
          <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <main className="grid min-w-0 gap-6">
              <section className="relative overflow-hidden rounded-xl border border-border bg-card p-5">
                <div className="absolute left-0 top-0 h-full w-1 bg-primary" />
                <div className="mb-4 flex items-center gap-2">
                  <Sparkles aria-hidden="true" className="size-5 text-primary" />
                  <h3 className="font-telemetry text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    AI-разбор гонки
                  </h3>
                </div>
                {summaryParagraphs.length ? (
                  <div className="grid gap-4 text-base leading-7 text-foreground/90">
                    {summaryParagraphs.map((paragraph, index) => (
                      <p className={cn(index === 0 && "font-semibold text-foreground")} key={paragraph}>
                        {paragraph}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm leading-6 text-muted-foreground">
                    Структурированный отчет готов. Короткое саммари появится после повторной обработки.
                  </p>
                )}
              </section>

              {newsSummary.length ? (
                <section className="rounded-xl border border-border bg-card p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <Newspaper aria-hidden="true" className="size-5 text-primary" />
                    <h3 className="font-telemetry text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      Что обсуждали вокруг этапа
                    </h3>
                  </div>
                  <div className="grid gap-3">
                    {newsSummary.map((item) => (
                      <p className="rounded-md border border-border bg-background/35 p-3 text-sm leading-6 text-muted-foreground" key={item}>
                        {item}
                      </p>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="grid gap-4">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="font-telemetry text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    Итоги гонки
                  </h3>
                  <span className="font-telemetry text-[0.68rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    Топ {Math.min(10, report.results.length)}
                  </span>
                </div>
                <div className="overflow-x-auto rounded-xl border border-border bg-card">
                  <table className="w-full min-w-[56rem] text-left text-sm">
                    <thead className="bg-muted/35 text-xs text-muted-foreground">
                      <tr className="border-b border-border">
                        <th className="px-4 py-3 font-telemetry font-bold uppercase tracking-[0.08em]">Поз.</th>
                        <th className="px-4 py-3 font-telemetry font-bold uppercase tracking-[0.08em]">Пилот</th>
                        <th className="px-4 py-3 font-telemetry font-bold uppercase tracking-[0.08em]">Команда</th>
                        <th className="px-4 py-3 font-telemetry font-bold uppercase tracking-[0.08em]">Старт</th>
                        <th className="px-4 py-3 font-telemetry font-bold uppercase tracking-[0.08em]">+/-</th>
                        <th className="px-4 py-3 font-telemetry font-bold uppercase tracking-[0.08em]">Шины</th>
                        <th className="px-4 py-3 font-telemetry font-bold uppercase tracking-[0.08em]">Лучший круг</th>
                        <th className="px-4 py-3 text-right font-telemetry font-bold uppercase tracking-[0.08em]">Очки</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {report.results.slice(0, 10).map((result) => {
                        const teamVisual = getTeamAsset(result.team);
                        const driverSlug = getDriverSlug(driverSlugByName, result.driver);

                        return (
                          <tr className="transition-colors hover:bg-accent/50" key={`${result.position}-${result.driver}`}>
                            <td className="px-4 py-3">
                              <span className="flex items-center gap-2 font-telemetry text-muted-foreground">
                                <TeamColorBar className="h-6 w-1" color={teamVisual?.color} />
                                {result.position ?? "-"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {driverSlug ? (
                                <Link
                                  className="font-semibold transition-colors hover:text-primary"
                                  href={`/drivers/${driverSlug}`}
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  {result.driver}
                                </Link>
                              ) : (
                                <span className="font-semibold">{result.driver}</span>
                              )}
                              <span className="ml-2 inline-flex gap-1">
                                {result.isWinner ? <Badge variant="success">Победа</Badge> : null}
                                {result.isFastestLap ? <Badge variant="outline">БК</Badge> : null}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-telemetry text-muted-foreground">{result.team}</td>
                            <td className="px-4 py-3 font-telemetry text-muted-foreground">{result.grid ?? "-"}</td>
                            <td className="px-4 py-3 font-telemetry text-muted-foreground">
                              {formatDelta(result.positionDelta)}
                            </td>
                            <td className="px-4 py-3">
                              <TyreSequence tyres={result.tyres} />
                            </td>
                            <td className="px-4 py-3 font-telemetry text-muted-foreground">
                              {result.bestLap ?? "-"}
                            </td>
                            <td className="px-4 py-3 text-right font-telemetry text-primary">
                              {result.points ?? 0}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="grid gap-4">
                <div className="flex items-center gap-2">
                  <Flag aria-hidden="true" className="size-5 text-primary" />
                  <h3 className="font-telemetry text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    Ключевые события
                  </h3>
                </div>
                <ol className="relative grid gap-4 before:absolute before:bottom-4 before:left-4 before:top-4 before:w-px before:bg-border">
                  {report.keyEvents.length ? report.keyEvents.slice(0, 8).map((event, index) => (
                    <li className="relative grid gap-1 pl-11" key={`${index}-${event.type}-${event.lap}-${event.title}`}>
                      <span className="absolute left-0 top-0 grid size-8 place-items-center rounded-full border border-border bg-card">
                        <span className={cn("size-2 rounded-full", index === 0 ? "bg-success" : "bg-primary")} />
                      </span>
                      <p className="font-telemetry text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
                        {event.lap ? `Круг ${event.lap}` : "Событие"}
                      </p>
                      <p className="font-semibold">{event.title}</p>
                      {event.detail ? (
                        <p className="text-sm leading-6 text-muted-foreground">{event.detail}</p>
                      ) : null}
                    </li>
                  )) : (
                    <li className="rounded-md border border-border p-4 text-sm text-muted-foreground">
                      Значимые события пока не найдены.
                    </li>
                  )}
                </ol>
              </section>

              {Object.keys(report.sourceErrors).length ? (
                <section className="rounded-xl border border-warning/35 bg-warning/10 p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 text-warning" />
                    <div>
                      <h3 className="font-semibold text-warning">Часть источников не ответила</h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        Отчет доступен по имеющимся данным. RaceMate попробует обновить его позже.
                      </p>
                    </div>
                  </div>
                </section>
              ) : null}
            </main>

            <aside className="grid content-start gap-4">
              <PodiumCard
                driverSlugByName={driverSlugByName}
                podium={podium}
                results={report.results}
                winner={winner}
              />
              <ReportStat
                icon={Timer}
                label="Лучший круг"
                value={fastestLap ?? "Нет данных"}
              />
              <ReportStat
                icon={TrendingUp}
                label="Прорыв дня"
                value={bestGain ?? "Нет данных"}
              />
              <ReportStat
                color={bestTeamVisual?.color}
                icon={Users}
                label="Сильнейшая команда"
                value={bestTeam ?? "Нет данных"}
              />
              <ReportStat
                color={biggestDropTeam?.color}
                icon={TrendingDown}
                label="Главная потеря"
                value={biggestDrop ?? "Нет данных"}
              />
              <ReportStat
                color={fastestPitStopTeam?.color}
                icon={Gauge}
                label="Быстрый пит-стоп"
                value={fastestPitStop ?? "Нет данных"}
              />
              <ReportStat icon={Flag} label="SC / VSC / красный флаг" value={safetyCarSummary ?? "Нет данных"} />
              <ReportStat icon={Trophy} label="Частая стратегия" value={mostCommonStrategy ?? "Нет данных"} />
              <div className="rounded-xl border border-border bg-card p-5 text-center">
                <Trophy aria-hidden="true" className="mx-auto size-9 text-primary" />
                <p className="mt-3 font-display text-lg font-bold">
                  {report.status === "ready" ? "Классификация подтверждена" : "Отчет частично готов"}
                </p>
                <p className="mt-2 font-telemetry text-[0.68rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Обновлено: {report.generatedAt}
                </p>
              </div>
            </aside>
          </div>
        </div>

      </div>
    </div>
  );
}

function PodiumCard({
  driverSlugByName,
  podium,
  results,
  winner,
}: {
  driverSlugByName: Record<string, string>;
  podium: string[];
  results: GrandPrixReport["results"];
  winner: string;
}) {
  const rows = podium.length ? podium.slice(0, 3) : [winner];

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border bg-primary/10 p-4">
        <h3 className="font-telemetry text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Подиум
        </h3>
      </div>
      <div className="grid gap-4 p-5">
        {rows.map((name, index) => {
          const result = getResultForDriverName(results, name);
          const teamVisual = getTeamAsset(result?.team);
          const driverSlug = getDriverSlug(driverSlugByName, name);

          return (
            <div className="flex items-center justify-between gap-3" key={`${index}-${name}`}>
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="font-telemetry w-5 text-muted-foreground"
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <TeamColorBar className="h-8 w-1.5" color={teamVisual?.color} />
                <span className="grid min-w-0 gap-0.5">
                  {driverSlug ? (
                    <Link
                      className="truncate font-semibold transition-colors hover:text-primary"
                      href={`/drivers/${driverSlug}`}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {name}
                    </Link>
                  ) : (
                    <span className="truncate font-semibold">{name}</span>
                  )}
                  {teamVisual?.name ? (
                    <span className="truncate text-xs text-muted-foreground">{teamVisual.name}</span>
                  ) : null}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function getResultForDriverName(results: GrandPrixReport["results"], driverName: string) {
  const normalizedDriver = normalizeDriverName(driverName);

  return results.find((result) => {
    const normalizedResultDriver = normalizeDriverName(result.driver);

    return (
      normalizedResultDriver === normalizedDriver ||
      normalizedResultDriver.includes(normalizedDriver) ||
      normalizedDriver.includes(normalizedResultDriver)
    );
  });
}

function getDriverSlug(driverSlugByName: Record<string, string>, driverName: string) {
  return driverSlugByName[normalizeDriverName(driverName)];
}

function normalizeDriverName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getTeamVisualFromHighlight(
  value: unknown,
  results: GrandPrixReport["results"],
  nameKey = "driver",
) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const name = asText(record[nameKey]);

  if (!name) {
    return null;
  }

  return nameKey === "team" ? getTeamAsset(name) : getTeamAssetForDriver(name, results);
}

function ReportStat({
  color,
  icon: Icon,
  label,
  tone = "neutral",
  value,
}: {
  color?: string | null;
  icon: typeof Timer;
  label: string;
  tone?: "neutral" | "live" | "red";
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex min-w-0 items-center gap-3">
        <Icon
          aria-hidden="true"
          className={cn(
            "size-5 shrink-0 text-muted-foreground",
            tone === "red" && "text-primary",
            tone === "live" && "text-success",
          )}
        />
        {color ? <TeamColorBar className="h-5 w-1" color={color} /> : null}
        <span className="font-telemetry text-[0.68rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </span>
      </div>
      <span className={cn("max-w-[58%] break-words text-right font-telemetry text-xs font-bold leading-5", tone === "red" && "text-primary", tone === "live" && "text-success")}>
        {value}
      </span>
    </div>
  );
}

function formatDelta(value: number | null) {
  if (value === null) {
    return "-";
  }

  if (value > 0) {
    return `+${value}`;
  }

  return String(value);
}

function asText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item)).filter(Boolean)
    : [];
}

function asHighlight(
  value: unknown,
  nameKey = "driver",
  metricKey = "delta",
) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const name = asText(record[nameKey]);

  if (!name) {
    return null;
  }

  const metric = record[metricKey];

  return metric === null || metric === undefined ? name : `${name} (${metric})`;
}

function getSummaryParagraphs(summary?: string | null) {
  return summary
    ? summary
        .split(/\n{2,}/)
        .map((paragraph) => cleanMarkdown(paragraph))
        .filter(Boolean)
    : [];
}

function getNewsSummary(value: Record<string, unknown>) {
  const candidates = [
    value.summary,
    value.items,
    value.news,
    value.points,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate
        .map((item) => {
          if (typeof item === "string") {
            return cleanMarkdown(item);
          }

          if (item && typeof item === "object") {
            const record = item as Record<string, unknown>;
            return cleanMarkdown(asText(record.summary) ?? asText(record.title) ?? asText(record.text));
          }

          return null;
        })
        .filter((item): item is string => Boolean(item))
        .slice(0, 3);
    }
  }

  const text = asText(value.summary) ?? asText(value.text) ?? asText(value.body);

  return text ? [cleanMarkdown(text)] : [];
}

function cleanMarkdown(value: string | null) {
  return value
    ? value
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/\*(.*?)\*/g, "$1")
        .replace(/\*/g, "")
        .trim()
    : "";
}
