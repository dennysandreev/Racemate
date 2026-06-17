"use client";

import { useCallback, useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { GrandPrixReport } from "@/types/racemate";

type GrandPrixReportDialogProps = {
  open: boolean;
  report: GrandPrixReport | null;
};

export function GrandPrixReportDialog({
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

  return (
    <div
      aria-labelledby="grand-prix-report-title"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-background/78 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={closeReport}
      role="dialog"
    >
      <div
        className="flex max-h-[90dvh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={report.status === "ready" ? "success" : "warning"}>
                {report.status === "ready" ? "Готов" : "Частично готов"}
              </Badge>
              <Badge variant="outline">
                {report.season}, раунд {report.round}
              </Badge>
            </div>
            <h2
              className="mt-3 text-balance text-xl font-semibold leading-tight sm:text-2xl"
              id="grand-prix-report-title"
            >
              {report.raceName}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
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
            <X aria-hidden="true" className="size-5" />
          </Button>
        </div>

        <div className="min-h-0 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="grid gap-5">
            <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-md border border-border/70 p-4">
                <h3 className="text-base font-semibold">Коротко о гонке</h3>
                {report.aiSummary ? (
                  <div className="mt-3 grid gap-3 text-sm leading-6 text-muted-foreground">
                    {report.aiSummary.split(/\n{2,}/).map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    Структурированный отчет готов, AI-саммари появится после повторной обработки.
                  </p>
                )}
              </div>
              <div className="grid gap-3 rounded-md border border-border/70 p-4">
                <ReportFact label="Победитель" value={winner} />
                <ReportFact label="Подиум" value={podium.length ? podium.join(", ") : "Подиум уточняется"} />
                <ReportFact label="Лучший прорыв" value={bestGain ?? "Нет данных"} />
                <ReportFact label="Самая сильная команда" value={bestTeam ?? "Нет данных"} />
                <ReportFact label="Главная потеря" value={biggestDrop ?? "Нет данных"} />
              </div>
            </section>

            <section className="grid gap-3">
              <h3 className="text-base font-semibold">Итоги гонки</h3>
              <div className="overflow-x-auto rounded-md border border-border/70">
                <table className="w-full min-w-[48rem] text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr className="border-b border-border/70">
                      <th className="px-4 py-3 font-medium">Поз.</th>
                      <th className="px-4 py-3 font-medium">Пилот</th>
                      <th className="px-4 py-3 font-medium">Команда</th>
                      <th className="px-4 py-3 font-medium">Старт</th>
                      <th className="px-4 py-3 font-medium">+/-</th>
                      <th className="px-4 py-3 font-medium">Лучший круг</th>
                      <th className="px-4 py-3 text-right font-medium">Очки</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.results.slice(0, 10).map((result) => (
                      <tr
                        className="border-b border-border/70 last:border-b-0"
                        key={`${result.position}-${result.driver}`}
                      >
                        <td className="px-4 py-3 font-mono text-muted-foreground">
                          {result.position ?? "-"}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium">{result.driver}</span>
                          <span className="ml-2 inline-flex gap-1">
                            {result.isWinner ? <Badge variant="success">Победа</Badge> : null}
                            {result.isFastestLap ? <Badge variant="outline">БК</Badge> : null}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{result.team}</td>
                        <td className="px-4 py-3 font-mono text-muted-foreground">{result.grid ?? "-"}</td>
                        <td className="px-4 py-3 font-mono text-muted-foreground">
                          {formatDelta(result.positionDelta)}
                        </td>
                        <td className="px-4 py-3 font-mono text-muted-foreground">
                          {result.bestLap ?? "-"}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {result.points ?? 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <ReportList title="Ключевые события">
                {report.keyEvents.length ? report.keyEvents.map((event, index) => (
                  <li className="rounded-md border border-border/70 p-3" key={`${index}-${event.type}-${event.lap}-${event.title}`}>
                    <p className="text-sm font-medium">
                      {event.lap ? `Круг ${event.lap}: ` : ""}
                      {event.title}
                    </p>
                    {event.detail ? (
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{event.detail}</p>
                    ) : null}
                  </li>
                )) : (
                  <li className="text-sm text-muted-foreground">Значимые события пока не найдены.</li>
                )}
              </ReportList>

              <ReportList title="Стратегия и пит-стопы">
                {report.strategies.slice(0, 10).map((strategy) => {
                  const item = strategy as Record<string, unknown>;
                  return (
                    <li className="rounded-md border border-border/70 p-3" key={String(item.driver)}>
                      <p className="text-sm font-medium">{String(item.driver ?? "Пилот")}</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        Пит-стопы: {String(item.pitStops ?? 0)} · составы: {asStringArray(item.compounds).join(", ") || "нет данных"}
                      </p>
                    </li>
                  );
                })}
              </ReportList>
            </section>

            {Object.keys(report.sourceErrors).length ? (
              <section className="rounded-md border border-warning/35 bg-warning/10 p-4">
                <h3 className="text-base font-semibold text-warning">Часть источников не ответила</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Отчет доступен по имеющимся данным. RaceMate попробует обновить его позже.
                </p>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReportFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 pb-3 last:border-b-0 last:pb-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="max-w-[60%] text-right text-sm font-medium">{value}</span>
    </div>
  );
}

function ReportList({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="grid gap-3">
      <h3 className="text-base font-semibold">{title}</h3>
      <ul className="grid gap-2">{children}</ul>
    </section>
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
