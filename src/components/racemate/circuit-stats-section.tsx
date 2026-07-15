"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  ArrowDownUp,
  BadgeCheck,
  Flag,
  Gauge,
  MapPinned,
  Medal,
  Ruler,
  Route,
  ShieldAlert,
  TimerReset,
  Trophy,
  X,
} from "lucide-react";

import { RaceFlag } from "@/components/racemate/race-flag";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  CircuitDriverStat,
  CircuitGrandPrixHistoryRow,
  CircuitRating,
  CircuitStatsView,
  CircuitTeamStat,
} from "@/types/racemate";

export function CircuitStatsSection({
  className,
  circuitName,
  footerAction,
  headerAction,
  embedded = false,
  mode = "compact",
  showCircuitName = true,
  stats,
}: {
  className?: string;
  circuitName?: string;
  footerAction?: ReactNode;
  headerAction?: ReactNode;
  embedded?: boolean;
  mode?: "compact" | "button";
  showCircuitName?: boolean;
  stats: CircuitStatsView | null;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const dialog = stats ? (
    <CircuitStatsDialog onOpenChange={setOpen} open={open} stats={stats} />
  ) : null;

  if (mode === "button") {
    return (
      <>
        <Button
          className={cn("w-full justify-center", className)}
          disabled={!stats}
          onClick={() => setOpen(true)}
          type="button"
          variant="secondary"
        >
          Статистика трассы
        </Button>
        {dialog}
      </>
    );
  }

  if (!stats) {
    return (
      <section className={cn(embedded ? "" : "pb-8", className)} id="circuit-stats">
        <div className={cn("grid gap-4", embedded ? "" : "rounded-xl border border-border bg-card/80 p-4 sm:p-5")}>
          <div className="flex items-center justify-between gap-3">
            <p className="stitch-label text-primary">О трассе</p>
            {headerAction}
          </div>
          <div>
            <h2 className="mt-2 font-display text-2xl font-extrabold tracking-[-0.03em]">
              {circuitName ?? "Трасса этапа"}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              История трассы появится после ближайшего обновления кеша.
            </p>
          </div>
          <Button className="w-full justify-center" disabled type="button" variant="secondary">
            Подробнее
          </Button>
          {footerAction}
        </div>
      </section>
    );
  }

  return (
    <section className={cn(embedded ? "" : "pb-8", className)} id="circuit-stats">
      <div className={cn(
        "relative overflow-hidden",
        embedded ? "" : "rounded-xl border border-border bg-card/80 p-4 shadow-[0_18px_56px_rgb(0_0_0_/_0.28)] sm:p-5",
      )}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,hsl(var(--primary)/0.16),transparent_18rem)]" />
        <div className={cn("relative grid", embedded ? "gap-2.5" : "gap-4")}>
          <CircuitCompactDossier
            dense={embedded}
            headerAction={headerAction}
            showCircuitName={showCircuitName}
            stats={stats}
          />
          <Button
            className="w-full justify-center border-border/80 bg-secondary/70 hover:bg-accent"
            onClick={() => setOpen(true)}
            type="button"
            variant="secondary"
          >
            Подробнее
          </Button>
          {footerAction}
        </div>
      </div>

      {dialog}
    </section>
  );
}

function CircuitStatsDialog({
  onOpenChange,
  open,
  stats,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  stats: CircuitStatsView;
}) {
  if (!open) {
    return null;
  }

  return createPortal(
    <div
      aria-labelledby="circuit-stats-dialog-title"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-background/84 p-3 backdrop-blur-md sm:p-6"
      onMouseDown={() => onOpenChange(false)}
      role="dialog"
    >
      <div
        className="flex h-[92dvh] w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-[0_24px_90px_rgb(0_0_0_/_0.55)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="shrink-0 border-b border-border bg-card/85 px-4 py-3 backdrop-blur sm:px-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Badge variant="outline">Исторические данные</Badge>
              <h2
                className="sr-only"
                id="circuit-stats-dialog-title"
              >
                Исторические данные трассы {stats.circuit.name}
              </h2>
            </div>
            <Button
              aria-label="Закрыть статистику"
              onClick={() => onOpenChange(false)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <X aria-hidden="true" data-icon="inline-start" />
            </Button>
          </div>
        </header>

        <div className="min-h-0 max-w-full overflow-x-hidden overflow-y-auto p-3 sm:p-5">
          <CircuitStatsDetails stats={stats} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

function CircuitCompactDossier({
  dense = false,
  headerAction,
  showCircuitName = true,
  stats,
}: {
  dense?: boolean;
  headerAction?: ReactNode;
  showCircuitName?: boolean;
  stats: CircuitStatsView;
}) {
  const metrics = [
    {
      icon: Ruler,
      label: "Длина круга",
      value: formatKm(stats.circuit.lapLengthKm),
    },
    {
      icon: Route,
      label: "Дистанция",
      value: formatCompactDistanceValue(stats.circuit.raceDistanceKm, stats.circuit.raceLaps),
    },
    {
      icon: TimerReset,
      label: "Рекорд трассы",
      value: formatLapRecord(stats.circuit.lapRecordTime, stats.circuit.lapRecordDriver, stats.circuit.lapRecordYear),
    },
  ];

  return (
    <div className="relative min-w-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="stitch-label text-primary">О трассе</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {headerAction ?? (
            <span className={cn("grid place-items-center rounded-md bg-primary/10 text-primary", dense ? "size-8" : "size-10")}>
              <MapPinned aria-hidden="true" className={dense ? "size-4" : "size-5"} />
            </span>
          )}
        </div>
      </div>
      {showCircuitName ? (
        <h2 className="relative mt-4 text-balance font-display text-2xl font-extrabold leading-tight tracking-[-0.03em]">
          {stats.circuit.name}
        </h2>
      ) : null}
      <div className={cn("divide-y stitch-divider", dense ? "mt-2" : "mt-4")}>
        {metrics.map((metric) => (
          <CircuitPreviewMetric
            icon={metric.icon}
            dense={dense}
            key={metric.label}
            label={metric.label}
            value={metric.value}
          />
        ))}
      </div>
    </div>
  );
}

function CircuitPreviewMetric({
  dense = false,
  icon: Icon,
  label,
  value,
}: {
  dense?: boolean;
  icon: typeof Gauge;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className={cn("grid grid-cols-[auto_1fr] gap-3", dense ? "min-h-12 py-2" : "min-h-14 py-3")}>
      <span className={cn("grid place-items-center rounded-md bg-primary/10 text-primary", dense ? "size-7" : "size-8")}>
        <Icon aria-hidden="true" className={dense ? "size-3.5" : "size-4"} />
      </span>
      <span className="grid min-w-0 content-center gap-1">
        <span className="text-xs font-semibold text-muted-foreground">{label}</span>
        <span className="min-w-0 break-words font-mono text-sm font-bold leading-5 text-foreground">
          {value}
        </span>
      </span>
    </div>
  );
}

function CircuitParameterRow({
  className,
  label,
  value,
}: {
  className?: string;
  label: string;
  value: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid min-h-11 gap-1.5 border-b border-border/65 py-2.5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(7rem,auto)] sm:items-center sm:gap-3",
        className,
      )}
    >
      <span className="text-sm font-medium leading-5 text-foreground">{label}</span>
      <span className="min-w-0 break-words font-mono text-sm leading-5 text-foreground sm:text-right">
        {value}
      </span>
    </div>
  );
}

function CircuitStatsDetails({ stats }: { stats: CircuitStatsView }) {
  const characterRatings = stats.character.ratings.length ? stats.character.ratings : stats.ratings;
  const characterFacts = [
    { label: "Побед с поула", value: formatPercent(stats.character.facts.poleWinRate ?? stats.qualifying.poleWinRate) },
    {
      label: "Средний старт победителя",
      value: formatPosition(stats.character.facts.winnerAvgStartPosition ?? stats.qualifying.winnerAvgStartPosition),
    },
    { label: "Средние сходы", value: formatNumber(stats.character.facts.avgDnfCount ?? stats.chaos.avgDnfCount) },
  ];

  return (
    <div className="divide-y divide-border/80">
      <section className="grid gap-5 pb-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)] lg:gap-8">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="stitch-label text-primary">О трассе</p>
              <h3 className="mt-1 text-balance font-display text-2xl font-extrabold leading-tight tracking-[-0.03em] sm:text-3xl">
                {stats.circuit.name}
              </h3>
              <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <RaceFlag
                  className="text-base"
                  countryCode={getCircuitCountryCode(stats.circuit.country)}
                  label={stats.circuit.country}
                />
                {stats.circuit.locality}, {stats.circuit.country}
              </p>
            </div>
            <MapPinned aria-hidden="true" className="size-5 shrink-0 text-primary" />
          </div>
          <div className="mt-4 grid gap-x-6 sm:grid-cols-2">
            <CircuitParameterRow label="Первый Гран-при" value={formatNumber(stats.circuit.firstGrandPrixYear)} />
            <CircuitParameterRow label="Длина круга" value={formatKm(stats.circuit.lapLengthKm)} />
            <CircuitParameterRow label="Дистанция" value={formatDistanceValue(stats.circuit.raceDistanceKm, stats.circuit.raceLaps)} />
            <CircuitParameterRow label="Повороты" value={formatNumber(stats.circuit.turnsCount)} />
            <CircuitParameterRow label="Прямые для активного крыла" value={formatNumber(stats.circuit.drsZonesCount)} />
          </div>
        </div>
        <div className="border-t border-border/80 pt-2 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <CircuitRecordRow
            icon={TimerReset}
            label="Рекорд трассы"
            value={formatLapRecord(stats.circuit.lapRecordTime, stats.circuit.lapRecordDriver, stats.circuit.lapRecordYear)}
          />
          <CircuitRecordRow icon={Medal} label="Самый успешный пилот" value={stats.records.mostSuccessfulDriver ?? "—"} />
          <CircuitRecordRow icon={Flag} label="Самая успешная команда" value={stats.records.mostSuccessfulTeam ?? "—"} />
          <CircuitRecordRow icon={ShieldAlert} label="Максимум сходов" value={formatNumber(stats.records.maxDnfCount ?? null)} />
        </div>
      </section>

      <CircuitFlatSection className="py-5" icon={Gauge} title="Характер трассы">
        <div className="grid gap-4">
          <div className="grid divide-y divide-border/70 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {characterFacts.map((fact) => (
              <CircuitStatTile key={fact.label} label={fact.label} value={fact.value} />
            ))}
          </div>
          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
            {characterRatings.map((rating) => (
              <RatingRow key={rating.label} rating={rating} />
            ))}
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            {stats.character.racesCount
              ? `Рассчитано на основе ${stats.character.racesCount} гонок.`
              : "Оценка появится после обновления исторических данных."}
          </p>
        </div>
      </CircuitFlatSection>

      <section className="grid divide-y divide-border/80 py-5 xl:grid-cols-3 xl:divide-x xl:divide-y-0">
        <CircuitInsightGroup
          icon={BadgeCheck}
          title="Квалификация"
          rows={[
            ["Победы с первого ряда", formatPercent(stats.qualifying.frontRowWinRate)],
            ["Средний старт победителя", formatPosition(stats.qualifying.winnerAvgStartPosition)],
          ]}
        />
        <CircuitInsightGroup
          icon={ArrowDownUp}
          title="Обгоны"
          rows={[
            ["Средняя дельта", formatSigned(stats.overtaking.avgPositionDelta)],
            ["Средний разброс", formatNumber(stats.overtaking.avgAbsPositionDelta)],
            ["Лучший прорыв", formatPositionRecord(stats.overtaking.bestGain)],
          ]}
        />
        <CircuitInsightGroup
          icon={ShieldAlert}
          title="Safety Car и хаос"
          rows={[
            ["Событий SC / гонку", formatNumber(stats.chaos.safetyCarFrequency)],
            ["Событий VSC / гонку", formatNumber(stats.chaos.vscFrequency)],
            ["Красные флаги / гонку", formatNumber(stats.chaos.redFlagFrequency)],
          ]}
        />
      </section>

      <section className="grid py-5 xl:grid-cols-[minmax(13rem,0.35fr)_minmax(0,1.65fr)]">
        <div className="pb-5 xl:border-r xl:border-border/80 xl:pb-0 xl:pr-5">
          <CircuitSectionHeader icon={Activity} title="Стратегия и пит-стопы" />
          <div className="mt-2">
            <CircuitFactRow label="Средние пит-стопы" value={formatNumber(stats.strategy.avgPitStops)} />
            <CircuitFactRow label="Первый пит-стоп" value={stats.strategy.avgFirstPitLap === null ? "—" : `круг ${formatNumber(stats.strategy.avgFirstPitLap)}`} />
            <CircuitFactRow label="Частая стратегия" value={stats.strategy.mostCommonStrategy ?? "—"} />
            <CircuitFactRow label="Вариативность" value={stats.strategy.strategyVariabilityLevel ?? "—"} />
          </div>
        </div>
        <div className="border-t border-border/80 pt-5 xl:border-t-0 xl:pl-5 xl:pt-0">
          <CircuitSectionHeader icon={Trophy} title="Последние гонки на этой трассе" />
          <div className="mt-2">
            <HistoryTable rows={stats.history} />
          </div>
        </div>
      </section>

      <section className="grid py-5 xl:grid-cols-2 xl:divide-x xl:divide-border/80">
        <div className="pb-5 xl:pb-0 xl:pr-5">
          <CircuitSectionHeader icon={Medal} title="Пилоты на этой трассе" />
          <DriverStatsList rows={stats.topDrivers} />
        </div>
        <div className="border-t border-border/80 pt-5 xl:border-t-0 xl:pl-5 xl:pt-0">
          <CircuitSectionHeader icon={Flag} title="Команды на этой трассе" />
          <TeamStatsList rows={stats.topTeams} />
        </div>
      </section>

      <p className="pt-4 text-right text-xs leading-5 text-muted-foreground">
        Историческая база:{" "}
        <span className="font-telemetry font-bold text-foreground/80">
          {stats.summary.racesCount ? `${stats.summary.racesCount} гонок` : "данные уточняются"}
        </span>
      </p>
    </div>
  );
}

function CircuitRecordRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Gauge;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="grid gap-1.5 border-b border-border/65 py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold leading-5 text-muted-foreground">{label}</span>
        <Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />
      </div>
      <p className="break-words font-telemetry text-sm font-extrabold leading-5 text-foreground">
        {value}
      </p>
    </div>
  );
}

function CircuitSectionHeader({
  icon: Icon,
  title,
}: {
  icon: typeof BadgeCheck;
  title: string;
}) {
  return (
    <div>
      <h2 className="flex min-w-0 items-center gap-2 font-display text-lg font-bold leading-tight">
        <Icon aria-hidden="true" className="size-5 shrink-0" />
        <span className="min-w-0 text-wrap">{title}</span>
      </h2>
    </div>
  );
}

function CircuitFactRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="grid min-h-10 gap-1 border-b border-border/65 py-2 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(7rem,auto)] sm:items-center sm:gap-3">
      <span className="min-w-0 text-sm font-medium leading-5 text-foreground">{label}</span>
      <span className="min-w-0 break-words font-mono text-sm leading-5 text-foreground sm:text-right">
        {value}
      </span>
    </div>
  );
}

function CircuitStatTile({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="grid min-h-20 content-between gap-3 py-3 sm:px-5 sm:py-2 sm:first:pl-0 sm:last:pr-0">
      <p className="text-sm font-medium leading-5 text-foreground">{label}</p>
      <p className="break-words font-telemetry text-xl font-extrabold leading-none text-foreground">
        {value}
      </p>
    </div>
  );
}

function RatingRow({
  rating,
}: {
  rating: Pick<CircuitRating, "label" | "value"> & { valueLabel?: string };
}) {
  const displayValue = rating.valueLabel ?? (rating.value ? `${rating.value}/5` : "—");

  return (
    <div className="grid min-h-16 content-between gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium">{rating.label}</p>
        <span className="text-right font-telemetry text-sm text-muted-foreground">{displayValue}</span>
      </div>
      <div className="grid grid-cols-5 gap-1" aria-label={`${rating.label}: ${rating.value ?? 0} из 5`}>
        {Array.from({ length: 5 }).map((_, index) => (
          <span
            className={cn(
              "h-1.5 rounded-full bg-muted transition-colors",
              rating.value && index < rating.value ? "bg-primary" : null,
            )}
            key={index}
          />
        ))}
      </div>
    </div>
  );
}

function CircuitFlatSection({
  children,
  className,
  icon: Icon,
  title,
}: {
  children: ReactNode;
  className?: string;
  icon: typeof BadgeCheck;
  title: string;
}) {
  return (
    <section className={className}>
      <CircuitSectionHeader icon={Icon} title={title} />
      <div className="mt-4">{children}</div>
    </section>
  );
}

function CircuitInsightGroup({
  icon: Icon,
  rows,
  title,
}: {
  icon: typeof BadgeCheck;
  rows: Array<[string, string]>;
  title: string;
}) {
  return (
    <div className="py-4 first:pt-0 last:pb-0 xl:px-5 xl:py-0 xl:first:pl-0 xl:last:pr-0">
      <CircuitSectionHeader icon={Icon} title={title} />
      <div className="mt-2">
        {rows.map(([label, value]) => (
          <CircuitFactRow key={label} label={label} value={value} />
        ))}
      </div>
    </div>
  );
}

function HistoryTable({ rows }: { rows: CircuitGrandPrixHistoryRow[] }) {
  if (!rows.length) {
    return <EmptyLine>Исторические данные появятся после синхронизации завершенных гонок.</EmptyLine>;
  }

  return (
    <>
      <div className="grid gap-2 sm:hidden">
        {rows.map((row) => (
          <article className="grid gap-3 border-b border-border/70 py-3 first:pt-0 last:border-b-0" key={`${row.season}-${row.round}`}>
            <div className="flex items-start justify-between gap-3">
              <Link className="font-telemetry text-base font-bold hover:text-primary" href={row.href}>
                {row.season}
              </Link>
              <span className="font-telemetry text-xs text-muted-foreground">
                SC/VSC/RF&nbsp;{[row.safetyCarCount, row.vscCount, row.redFlagCount].map((value) => value ?? "—").join("/")}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <HistoryMobileFact label="Победитель" value={row.winner} />
              <HistoryMobileFact label="Поул" value={row.pole} />
              <HistoryMobileFact className="col-span-2" label="Подиум" value={row.podium.join(" · ") || "—"} />
              <HistoryMobileFact label="Команда" value={row.winnerTeam} />
              <HistoryMobileFact label="Сходы" value={String(row.dnfCount ?? "—")} />
            </div>
          </article>
        ))}
      </div>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[560px] text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr className="border-b stitch-divider">
            <th className="px-3 py-2 font-medium">Сезон</th>
            <th className="px-3 py-2 font-medium">Победитель</th>
            <th className="px-3 py-2 font-medium">Поул</th>
            <th className="px-3 py-2 font-medium">Подиум</th>
            <th className="px-3 py-2 font-medium">Сходы</th>
            <th className="px-3 py-2 font-medium">SC/VSC/RF</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="border-b stitch-divider last:border-b-0" key={`${row.season}-${row.round}`}>
              <td className="px-3 py-2">
                <Link className="font-telemetry font-bold hover:text-primary" href={row.href}>
                  {row.season}
                </Link>
              </td>
              <td className="px-3 py-2">
                <p className="font-medium">{row.winner}</p>
                <p className="text-xs text-muted-foreground">{row.winnerTeam}</p>
              </td>
              <td className="px-3 py-2">
                {row.pole}
              </td>
              <td className="px-3 py-2 text-muted-foreground">{row.podium.join(" · ") || "—"}</td>
              <td className="px-3 py-2 font-telemetry">{row.dnfCount ?? "—"}</td>
              <td className="px-3 py-2 font-telemetry">
                {[row.safetyCarCount, row.vscCount, row.redFlagCount]
                  .map((value) => value ?? "—")
                  .join("/")}
              </td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>
    </>
  );
}

function HistoryMobileFact({
  className,
  label,
  value,
}: {
  className?: string;
  label: string;
  value: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-words font-medium leading-5">{value}</p>
    </div>
  );
}

function DriverStatsList({ rows }: { rows: CircuitDriverStat[] }) {
  if (!rows.length) {
    return <EmptyLine>Недостаточно исторических данных по действующим пилотам.</EmptyLine>;
  }

  return (
    <div className="mt-2 divide-y divide-border/65">
      {rows.map((row, index) => (
        <Link
          className="grid gap-3 py-3 transition-colors hover:text-primary sm:grid-cols-[auto_1fr_auto]"
          href={row.driverSlug ? `/drivers/${row.driverSlug}` : "#"}
          key={`${row.driver}-${index}`}
          prefetch={false}
        >
          <span className="font-telemetry text-muted-foreground">#{index + 1}</span>
          <span className="min-w-0">
            <span className="flex items-center gap-2 font-medium">
              <span
                className="h-5 w-1.5 rounded-full bg-primary"
                style={{ backgroundColor: row.teamColor ?? undefined }}
              />
              {row.driver}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {row.team} · {row.starts} стартов · {row.wins} побед · {row.podiums} подиумов
            </span>
          </span>
          <span className="font-telemetry text-sm text-muted-foreground">
            ср. финиш {formatPosition(row.avgFinishPosition)}
          </span>
        </Link>
      ))}
    </div>
  );
}

function TeamStatsList({ rows }: { rows: CircuitTeamStat[] }) {
  if (!rows.length) {
    return <EmptyLine>Командная статистика появится после обновления истории этапа.</EmptyLine>;
  }

  return (
    <div className="mt-2 divide-y divide-border/65">
      {rows.map((row, index) => (
        <div
          className="grid gap-3 py-3 sm:grid-cols-[auto_1fr_auto]"
          key={`${row.team}-${index}`}
        >
          <span className="font-telemetry text-muted-foreground">#{index + 1}</span>
          <span className="min-w-0">
            <span className="flex items-center gap-2 font-medium">
              <span
                className="h-5 w-1.5 rounded-full bg-primary"
                style={{ backgroundColor: row.teamColor ?? undefined }}
              />
              {row.team}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {row.starts} стартов · {row.wins} побед · {row.podiums} подиумов
            </span>
          </span>
          <span className="font-telemetry text-sm text-muted-foreground">
            ср. очки {formatNumber(row.avgPoints)}
          </span>
        </div>
      ))}
    </div>
  );
}

function EmptyLine({ children }: { children: string }) {
  return <div className="py-4 text-sm leading-6 text-muted-foreground">{children}</div>;
}

function formatKm(value: number | null) {
  return value === null ? "—" : `${value.toFixed(3)} км`;
}

function formatDistanceValue(distance: number | null, laps: number | null) {
  if (distance === null && laps === null) {
    return "—";
  }

  return (
    <span className="grid gap-0.5">
      {distance !== null ? <span>{distance.toFixed(1)} км</span> : null}
      {laps !== null ? <span>{laps} кругов</span> : null}
    </span>
  );
}

function formatCompactDistanceValue(distance: number | null, laps: number | null) {
  if (distance === null && laps === null) {
    return "—";
  }

  return [
    distance !== null ? `${distance.toFixed(1)} км` : null,
    laps !== null ? `${laps} кругов` : null,
  ].filter(Boolean).join(" · ");
}

function formatLapRecord(time: string | null, driver: string | null, year: number | null) {
  if (!time) {
    return "—";
  }

  return [time, driver, year].filter(Boolean).join(" · ");
}

function formatPercent(value: number | null) {
  return value === null ? "—" : `${Math.round(value)}%`;
}

function formatNumber(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "—";
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatPosition(value: number | null) {
  return value === null ? "—" : `P${formatNumber(value)}`;
}

function formatSigned(value: number | null) {
  if (value === null) {
    return "—";
  }

  return `${value > 0 ? "+" : ""}${formatNumber(value)}`;
}

function formatPositionRecord(record: CircuitStatsView["overtaking"]["bestGain"]) {
  if (!record?.driver) {
    return "—";
  }

  const change = record.start && record.finish ? `P${record.start} → P${record.finish}` : "";

  return [record.driver, change].filter(Boolean).join(" · ");
}

function getCircuitCountryCode(country: string | null | undefined) {
  const normalized = String(country ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  const codes: Record<string, string> = {
    australia: "au",
    austria: "at",
    azerbaijan: "az",
    bahrain: "bh",
    belgium: "be",
    brazil: "br",
    canada: "ca",
    china: "cn",
    france: "fr",
    germany: "de",
    hungary: "hu",
    italy: "it",
    japan: "jp",
    mexico: "mx",
    monaco: "mc",
    netherlands: "nl",
    qatar: "qa",
    "saudi arabia": "sa",
    singapore: "sg",
    spain: "es",
    uae: "ae",
    uk: "gb",
    "united kingdom": "gb",
    usa: "us",
    "united states": "us",
  };

  return codes[normalized] ?? undefined;
}
