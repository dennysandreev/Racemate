"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  Check,
  ChevronsUpDown,
  GitCompareArrows,
  RotateCcw,
  SlidersHorizontal,
  Trophy,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import { CumulativePointsChart } from "@/components/racemate/cumulative-points-chart";
import { DriverAvatarBadge } from "@/components/racemate/driver-avatar-badge";
import { DriverComparisonShare } from "@/components/racemate/driver-comparison-share";
import { RaceFlag } from "@/components/racemate/race-flag";
import { StitchPanel, StitchPanelHeader } from "@/components/racemate/stitch-primitives";
import { TeamLogo } from "@/components/racemate/team-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Slider } from "@/components/ui/slider";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  compareDriverSnapshots,
  driverComparisonMetrics,
  type ComparisonMetricKey,
} from "@/lib/driver-comparison";
import { cn } from "@/lib/utils";
import type {
  DriverComparisonDataset,
  DriverComparisonDriver,
  DriverDirectoryDriver,
  DriverProfileTeam,
  DriverRoundSnapshot,
  DriverStageResult,
} from "@/types/racemate";

type ComparisonOption = DriverDirectoryDriver & { team: DriverProfileTeam };

export function DriverComparison({
  dataset,
  initialRound,
  leftSlug,
  rightSlug,
}: {
  dataset: DriverComparisonDataset;
  initialRound: number;
  leftSlug?: string;
  rightSlug?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [round, setRound] = useState(initialRound);
  const leftDriver = leftSlug
    ? dataset.drivers.find((driver) => driver.slug === leftSlug) ?? null
    : null;
  const rightDriver = rightSlug && rightSlug !== leftSlug
    ? dataset.drivers.find((driver) => driver.slug === rightSlug) ?? null
    : null;
  const selectedRound = dataset.rounds.find((item) => item.round === round) ?? null;
  const leftSnapshot = getSnapshot(leftDriver, round);
  const rightSnapshot = getSnapshot(rightDriver, round);
  const comparison = compareDriverSnapshots(leftSnapshot, rightSnapshot);

  function updateDriver(slot: "a" | "b", slug: string) {
    const params = new URLSearchParams(window.location.search);
    params.set("season", String(dataset.season));
    params.set(slot, slug);
    params.delete("round");

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  function clearComparison() {
    const params = new URLSearchParams();
    params.set("season", String(dataset.season));

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  function swapDrivers() {
    if (!leftDriver || !rightDriver) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    params.set("a", rightDriver.slug);
    params.set("b", leftDriver.slug);

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  function commitRound(nextRound: number) {
    const params = new URLSearchParams(window.location.search);
    params.set("season", String(dataset.season));
    params.set("round", String(nextRound));
    window.history.replaceState(
      window.history.state,
      "",
      `${pathname}?${params.toString()}`,
    );
  }

  return (
    <div className={cn("grid min-w-0 gap-4 sm:gap-5", isPending && "opacity-75")}>
      <section className="stitch-panel overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border p-4">
          <h2 className="font-display text-lg font-bold">Дуэль пилотов</h2>
          <div className="flex items-center gap-2">
            {leftDriver && rightDriver && selectedRound && round > 0 ? (
              <DriverComparisonShare
                leftName={leftDriver.fullName}
                leftSlug={leftDriver.slug}
                raceName={selectedRound.raceName}
                rightName={rightDriver.fullName}
                rightSlug={rightDriver.slug}
                round={round}
                season={dataset.season}
              />
            ) : null}
            <Button
              aria-label="Поменять пилотов местами"
              disabled={!leftDriver || !rightDriver || isPending}
              onClick={swapDrivers}
              size="icon"
              title="Поменять пилотов местами"
              type="button"
              variant="outline"
            >
              <ArrowLeftRight aria-hidden="true" />
            </Button>
            <Button
              aria-label="Очистить сравнение"
              disabled={(!leftDriver && !rightDriver) || isPending}
              onClick={clearComparison}
              size="icon"
              title="Очистить сравнение"
              type="button"
              variant="ghost"
            >
              <RotateCcw aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 items-stretch sm:grid-cols-[minmax(0,1fr)_4.5rem_minmax(0,1fr)]">
          <DriverDuelSlot
            driver={leftDriver}
            excludedSlug={rightDriver?.slug}
            onSelect={(slug) => updateDriver("a", slug)}
            options={dataset.options}
            season={dataset.season}
          />
          <div className="order-last col-span-2 flex items-center justify-center gap-2 border-t border-border bg-background/45 px-3 py-3 text-center sm:order-none sm:col-span-1 sm:grid sm:content-center sm:justify-items-center sm:border-x sm:border-t-0 sm:px-2 sm:py-5">
            <GitCompareArrows aria-hidden="true" className="size-5 text-primary" />
            <p className="font-telemetry text-lg font-extrabold sm:mt-2 sm:text-xl">
              {leftDriver && rightDriver ? `${comparison.leftScore}:${comparison.rightScore}` : "VS"}
            </p>
            <p className="text-[0.6rem] font-semibold text-muted-foreground sm:mt-1">по метрикам</p>
          </div>
          <DriverDuelSlot
            align="right"
            driver={rightDriver}
            excludedSlug={leftDriver?.slug}
            onSelect={(slug) => updateDriver("b", slug)}
            options={dataset.options}
            season={dataset.season}
          />
        </div>
      </section>

      <TimelinePanel
        dataset={dataset}
        onCommit={commitRound}
        onRoundChange={setRound}
        round={round}
        selectedRound={selectedRound}
      />

      {leftDriver && rightDriver && leftSnapshot && rightSnapshot ? (
        <>
          <ComparisonMetrics
            comparison={comparison.result}
            left={leftSnapshot}
            leftName={leftDriver.fullName}
            right={rightSnapshot}
            rightName={rightDriver.fullName}
          />

          <StageComparison
            left={leftSnapshot.stage}
            leftName={leftDriver.fullName}
            right={rightSnapshot.stage}
            rightName={rightDriver.fullName}
          />

          <CumulativePointsChart
            ariaLabel={`Накопленные очки ${leftDriver.fullName} и ${rightDriver.fullName} после этапа ${round}`}
            emptyLabel="Очки появятся после первого завершенного этапа."
            mode="comparison"
            series={[
              toChartSeries(leftDriver, round),
              toChartSeries(rightDriver, round),
            ]}
          />
        </>
      ) : (
        <section className="stitch-panel grid min-h-64 place-items-center p-6 text-center">
          <div className="max-w-md">
            <span className="mx-auto grid size-12 place-items-center rounded-md bg-primary/12 text-primary">
              <GitCompareArrows aria-hidden="true" className="size-6" />
            </span>
            <h2 className="mt-4 font-display text-xl font-bold">Выбери двух пилотов</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              RaceSide сопоставит их результаты и покажет положение в сезоне после выбранного этапа.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

function DriverDuelSlot({
  align = "left",
  driver,
  excludedSlug,
  onSelect,
  options,
  season,
}: {
  align?: "left" | "right";
  driver: DriverComparisonDriver | null;
  excludedSlug?: string;
  onSelect: (slug: string) => void;
  options: ComparisonOption[];
  season: number;
}) {
  const [open, setOpen] = useState(false);

  if (!driver) {
    return (
      <div className="grid min-h-56 place-items-center p-3 sm:p-5">
        <DriverPicker
          excludedSlug={excludedSlug}
          label="Выбрать пилота"
          onOpenChange={setOpen}
          onSelect={onSelect}
          open={open}
          options={options}
          season={season}
          trigger={(
            <Button
              aria-label={align === "left" ? "Выбрать первого пилота" : "Выбрать второго пилота"}
              className="h-14 w-full max-w-48 whitespace-normal"
              type="button"
              variant="outline"
            >
              <ChevronsUpDown aria-hidden="true" data-icon="inline-start" />
              Выбрать пилота
            </Button>
          )}
        />
      </div>
    );
  }

  return (
    <div className={cn("grid min-w-0 content-between gap-4 p-3 sm:p-5", align === "right" && "text-right")}>
      <div
        className={cn(
          "flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:items-start",
          align === "right" && "items-end sm:flex-row-reverse",
        )}
      >
        <Link
          aria-label={`Открыть профиль: ${driver.fullName}`}
          className="group shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          href={`/drivers/${driver.slug}?season=${season}`}
          prefetch={false}
        >
          <DriverAvatarBadge
            className="size-16 sm:size-24"
            color={driver.team.color}
            fallbackClassName="font-telemetry text-xl text-foreground"
            fallbackLabel={driver.number ?? driver.code}
            imageClassName="transition-transform duration-200 ease-out group-hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none"
            name={driver.fullName}
            season={season}
            sizes="6rem"
            slug={driver.slug}
            src={driver.avatarUrl}
          />
        </Link>
        <div className="min-w-0 w-full flex-1 sm:w-auto">
          <h3 className="min-h-[3.75rem] text-balance font-display text-base font-extrabold leading-tight sm:min-h-14 sm:text-2xl">
            <Link
              className="rounded-sm transition-colors duration-200 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
              href={`/drivers/${driver.slug}?season=${season}`}
              prefetch={false}
            >
              {driver.fullName}
            </Link>
          </h3>
          <Link
            className={cn(
              "mt-2 flex w-fit items-center gap-2 rounded-sm text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
              align === "right" && "ml-auto justify-end",
            )}
            href={`/teams/${driver.team.slug}?season=${season}`}
            prefetch={false}
          >
            <TeamLogo
              code={driver.team.code}
              color={driver.team.color}
              logo={driver.team.logo}
              name={driver.team.name}
              season={season}
              shape="square"
            />
            <span className="hidden truncate text-xs font-semibold sm:inline">
              {driver.team.name}
            </span>
          </Link>
        </div>
      </div>
      <DriverPicker
        excludedSlug={excludedSlug}
        label={`Заменить: ${driver.fullName}`}
        onOpenChange={setOpen}
        onSelect={onSelect}
        open={open}
        options={options}
        season={season}
        selectedSlug={driver.slug}
        trigger={(
          <Button className="h-11 w-full" type="button" variant="outline">
            <ChevronsUpDown aria-hidden="true" data-icon="inline-start" />
            Заменить
          </Button>
        )}
      />
    </div>
  );
}

function DriverPicker({
  excludedSlug,
  label,
  onOpenChange,
  onSelect,
  open,
  options,
  season,
  selectedSlug,
  trigger,
}: {
  excludedSlug?: string;
  label: string;
  onOpenChange: (open: boolean) => void;
  onSelect: (slug: string) => void;
  open: boolean;
  options: ComparisonOption[];
  season: number;
  selectedSlug?: string;
  trigger: React.ReactNode;
}) {
  const isMobile = useIsMobile();
  const content = (
    <DriverPickerContent
      excludedSlug={excludedSlug}
      onSelect={(slug) => {
        onSelect(slug);
        onOpenChange(false);
      }}
      options={options}
      season={season}
      selectedSlug={selectedSlug}
    />
  );

  if (isMobile) {
    return (
      <Drawer onOpenChange={onOpenChange} open={open}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{label}</DrawerTitle>
            <DrawerDescription>Выбери участника сезона {season}.</DrawerDescription>
          </DrawerHeader>
          <div className="min-h-0 px-4 pb-6">{content}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="overflow-hidden p-0">
        <DialogHeader className="border-b border-border p-5 pb-4">
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>Выбери участника сезона {season}.</DialogDescription>
        </DialogHeader>
        <div className="p-3">{content}</div>
      </DialogContent>
    </Dialog>
  );
}

function DriverPickerContent({
  excludedSlug,
  onSelect,
  options,
  season,
  selectedSlug,
}: {
  excludedSlug?: string;
  onSelect: (slug: string) => void;
  options: ComparisonOption[];
  season: number;
  selectedSlug?: string;
}) {
  const teams = useMemo(
    () => [...new Set(options.map((option) => option.team.name))],
    [options],
  );

  return (
    <Command>
      <CommandInput placeholder="Имя пилота или команда" />
      <CommandList className="max-h-[52vh]">
        <CommandEmpty>Пилот не найден</CommandEmpty>
        {teams.map((teamName) => (
          <CommandGroup heading={teamName} key={teamName}>
            {options
              .filter((option) => option.team.name === teamName)
              .map((option) => (
                <CommandItem
                  disabled={option.slug === excludedSlug}
                  key={option.id}
                  onSelect={() => onSelect(option.slug)}
                  value={`${option.fullName} ${option.team.name}`}
                >
                  <DriverAvatarBadge
                    className="size-9"
                    color={option.team.color}
                    fallbackLabel={option.number ?? option.code}
                    name={option.fullName}
                    season={season}
                    sizes="2.25rem"
                    slug={option.slug}
                    src={option.avatarUrl}
                  />
                  <span className="min-w-0 flex-1 truncate font-semibold">{option.fullName}</span>
                  {option.slug === selectedSlug ? <Check aria-hidden="true" className="size-4 text-primary" /> : null}
                </CommandItem>
              ))}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  );
}

function TimelinePanel({
  dataset,
  onCommit,
  onRoundChange,
  round,
  selectedRound,
}: {
  dataset: DriverComparisonDataset;
  onCommit: (round: number) => void;
  onRoundChange: (round: number) => void;
  round: number;
  selectedRound: DriverComparisonDataset["rounds"][number] | null;
}) {
  return (
    <StitchPanel className="min-w-0 overflow-hidden">
      <StitchPanelHeader
        action={dataset.latestCompletedRound > 0 ? (
          <Badge variant="secondary">Этап {round} из {dataset.rounds.length}</Badge>
        ) : null}
        icon={SlidersHorizontal}
        meta={selectedRound
          ? `После ${selectedRound.raceName}`
          : "Сезон еще не начался"}
        title="Срез сезона"
      />
      {dataset.latestCompletedRound > 0 ? (
        <div className="grid gap-4 p-4 sm:p-5">
          <Slider
            aria-label="Этап сезона"
            max={dataset.latestCompletedRound}
            min={1}
            onValueChange={(value) => onRoundChange(value[0] ?? 1)}
            onValueCommit={(value) => onCommit(value[0] ?? 1)}
            step={1}
            value={[round]}
          />
          <div className="overflow-x-auto pb-1">
            <div className="flex w-max items-center gap-2">
              {dataset.rounds.map((item) => {
                const active = item.round === round;

                return (
                  <button
                    aria-current={active ? "step" : undefined}
                    aria-label={`${item.raceName}, этап ${item.round}`}
                    className={cn(
                      "grid size-11 place-items-center rounded-md border text-xs transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background/40 text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                    disabled={!item.completed}
                    key={item.round}
                    onClick={() => {
                      onRoundChange(item.round);
                      onCommit(item.round);
                    }}
                    title={item.raceName}
                    type="button"
                  >
                    <RaceFlag countryCode={item.countryCode} label={item.raceName} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <p className="p-5 text-sm text-muted-foreground">
          Статистика появится после первого завершенного этапа.
        </p>
      )}
    </StitchPanel>
  );
}

function ComparisonMetrics({
  comparison,
  left,
  leftName,
  right,
  rightName,
}: {
  comparison: Partial<Record<ComparisonMetricKey, "left" | "right" | "tie">>;
  left: DriverRoundSnapshot;
  leftName: string;
  right: DriverRoundSnapshot;
  rightName: string;
}) {
  return (
    <StitchPanel className="overflow-hidden">
      <StitchPanelHeader icon={Trophy} title="Показатели сезона" />
      <div className="grid">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(7.5rem,1.2fr)_minmax(0,1fr)] border-b border-border bg-background/40 px-3 py-2 text-xs font-semibold text-muted-foreground sm:px-5">
          <span className="truncate lg:pr-4 lg:text-right">{leftName}</span>
          <span className="text-center">Показатель</span>
          <span className="truncate text-right lg:pl-4 lg:text-left">{rightName}</span>
        </div>
      {driverComparisonMetrics.map((metric) => {
          const winner = comparison[metric.key] ?? "tie";

          return (
            <div
              className="grid min-h-14 grid-cols-[minmax(0,1fr)_minmax(7.5rem,1.2fr)_minmax(0,1fr)] items-center border-b border-border px-3 py-2 last:border-b-0 sm:px-5"
              key={metric.key}
            >
              <MetricValue
                format={metric.format}
                value={left[metric.key]}
                winner={winner === "left"}
              />
              <span className="px-2 text-center text-xs font-semibold text-muted-foreground sm:text-sm">
                {metric.label}
              </span>
              <MetricValue
                align="right"
                format={metric.format}
                value={right[metric.key]}
                winner={winner === "right"}
              />
            </div>
          );
        })}
      </div>
    </StitchPanel>
  );
}

function MetricValue({
  align = "left",
  format,
  value,
  winner,
}: {
  align?: "left" | "right";
  format?: "decimal" | "position";
  value: number | null;
  winner: boolean;
}) {
  return (
    <span
      className={cn(
        "flex items-center gap-2",
        align === "right"
          ? "justify-end lg:justify-start lg:pl-4"
          : "lg:justify-end lg:pr-4",
      )}
    >
      {winner && align === "left" ? <Check aria-hidden="true" className="size-4 shrink-0 text-success" /> : null}
      <span className={cn("font-telemetry text-base font-extrabold sm:text-lg", winner && "text-foreground")}>
        {formatMetric(value, format)}
      </span>
      {winner && align === "right" ? <Check aria-hidden="true" className="size-4 shrink-0 text-success" /> : null}
      {winner ? <span className="sr-only">Преимущество</span> : null}
    </span>
  );
}

function StageComparison({
  left,
  leftName,
  right,
  rightName,
}: {
  left: DriverStageResult | null;
  leftName: string;
  right: DriverStageResult | null;
  rightName: string;
}) {
  return (
    <StitchPanel className="overflow-hidden">
      <StitchPanelHeader icon={GitCompareArrows} title="На выбранном этапе" />
      <div className="grid md:grid-cols-2 md:divide-x md:divide-border">
        <StageDriverResult name={leftName} result={left} />
        <StageDriverResult name={rightName} result={right} />
      </div>
    </StitchPanel>
  );
}

function StageDriverResult({ name, result }: { name: string; result: DriverStageResult | null }) {
  if (!result?.participated) {
    return (
      <div className="grid min-h-44 content-center p-5">
        <p className="font-display text-base font-bold">{name}</p>
        <p className="mt-2 text-sm text-muted-foreground">Нет стартов на выбранном этапе</p>
      </div>
    );
  }

  const items: Array<{ className?: string; label: string; value: string }> = [
    { label: "Квалификация", value: formatPosition(result.qualifyingPosition) },
    ...(result.sprintPosition !== null
      ? [{ label: "Спринт", value: `${formatPosition(result.sprintPosition)} / ${formatMetric(result.sprintPoints, "decimal")} оч.` }]
      : []),
    { label: "Старт", value: formatPosition(result.startPosition) },
    { label: "Финиш", value: result.isDnf ? "Сход" : formatPosition(result.finishPosition) },
    { label: "Очки за этап", value: formatMetric(result.points, "decimal") },
    {
      className: cn(
        "col-span-2 text-center sm:text-left",
        result.sprintPosition === null ? "sm:col-span-2" : "sm:col-span-1",
      ),
      label: "Лучший круг",
      value: result.fastestLapTime ?? "Нет данных",
    },
  ];

  return (
    <div className="p-5">
      <p className="font-display text-base font-bold">{name}</p>
      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-3">
        {items.map((item) => (
          <div className={cn("bg-card p-3", item.className)} key={item.label}>
            <dt className="text-[0.65rem] font-semibold text-muted-foreground">{item.label}</dt>
            <dd className="mt-1 font-telemetry text-sm font-extrabold">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function getSnapshot(driver: DriverComparisonDriver | null, round: number) {
  return driver?.snapshots.findLast((snapshot) => snapshot.round <= round) ?? null;
}

function toChartSeries(driver: DriverComparisonDriver, round: number) {
  return {
    id: driver.id,
    name: driver.fullName,
    color: driver.team.color,
    points: [
      { round: 0, raceName: "Старт", value: 0 },
      ...driver.snapshots
        .filter((snapshot) => snapshot.round <= round)
        .map((snapshot) => ({
          round: snapshot.round,
          raceName: snapshot.stage?.raceName ?? `Этап ${snapshot.round}`,
          value: snapshot.points,
        })),
    ],
  };
}

function formatMetric(value: number | null, format?: "decimal" | "position") {
  if (value === null) {
    return "Нет стартов";
  }

  if (format === "position") {
    return `P${value}`;
  }

  if (format === "decimal" && !Number.isInteger(value)) {
    return value.toFixed(1);
  }

  return String(value);
}

function formatPosition(value: number | null) {
  return value === null ? "Нет данных" : `P${value}`;
}
