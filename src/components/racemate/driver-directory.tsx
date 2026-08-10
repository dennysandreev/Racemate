"use client";

import Link from "next/link";
import { Check, GitCompareArrows, Plus, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { DriverAvatarBadge } from "@/components/racemate/driver-avatar-badge";
import { TeamLogo } from "@/components/racemate/team-logo";
import { cn } from "@/lib/utils";
import type { DriverDirectoryDriver, DriverDirectoryTeam } from "@/types/racemate";

export function DriverDirectory({
  season,
  teams,
}: {
  season: number;
  teams: DriverDirectoryTeam[];
}) {
  const [selected, setSelected] = useState<DriverDirectoryDriver[]>([]);
  const [message, setMessage] = useState("");

  function toggleDriver(driver: DriverDirectoryDriver) {
    const isSelected = selected.some((item) => item.id === driver.id);

    if (isSelected) {
      setSelected((current) => current.filter((item) => item.id !== driver.id));
      setMessage(`${driver.fullName} убран из сравнения`);
      return;
    }

    if (selected.length >= 2) {
      setMessage("Сначала убери одного из выбранных пилотов");
      return;
    }

    setSelected((current) => [...current, driver]);
    setMessage(`${driver.fullName} добавлен к сравнению`);
  }

  const compareHref = selected.length === 2
    ? `/drivers/compare?season=${season}&a=${selected[0].slug}&b=${selected[1].slug}`
    : null;

  return (
    <div className={cn("grid gap-4", selected.length > 0 && "pb-28 sm:pb-24")}>
      <p aria-live="polite" className="sr-only">{message}</p>

      <section
        aria-label="Пилоты сезона по командам"
        className="grid gap-4 lg:grid-cols-2"
      >
        {teams.map((team) => (
          <TeamDriverCard
            key={team.id}
            onToggle={toggleDriver}
            season={season}
            selectedIds={new Set(selected.map((driver) => driver.id))}
            team={team}
          />
        ))}
      </section>

      {selected.length > 0 ? (
        <div className="fixed inset-x-4 bottom-4 z-20 xl:left-[18rem]">
          <div className="mx-auto flex w-full max-w-[70rem] flex-col gap-3 rounded-lg border border-border bg-background/96 p-3 shadow-xl backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:p-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary/12 text-primary">
                <GitCompareArrows aria-hidden="true" className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground">
                  {selected.length === 1 ? "Выбран один пилот" : "Пилоты готовы к сравнению"}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {selected.map((driver) => driver.fullName).join(" и ")}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                aria-label="Очистить выбор пилотов"
                onClick={() => {
                  setSelected([]);
                  setMessage("Выбор очищен");
                }}
                size="icon"
                type="button"
                variant="ghost"
              >
                <X aria-hidden="true" />
              </Button>
              {compareHref ? (
                <Button asChild className="min-w-36 flex-1 sm:flex-none" size="lg">
                  <Link href={compareHref} prefetch={false}>
                    Сравнить
                    <GitCompareArrows aria-hidden="true" data-icon="inline-end" />
                  </Link>
                </Button>
              ) : (
                <Button className="min-w-36 flex-1 sm:flex-none" disabled size="lg">
                  Выбери второго
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TeamDriverCard({
  onToggle,
  season,
  selectedIds,
  team,
}: {
  onToggle: (driver: DriverDirectoryDriver) => void;
  season: number;
  selectedIds: Set<string>;
  team: DriverDirectoryTeam;
}) {
  const primaryDrivers = team.drivers.filter((driver) => driver.isPrimary);
  const reserveDrivers = team.drivers.filter((driver) => !driver.isPrimary);

  return (
    <article
      className="relative overflow-hidden rounded-lg border border-border bg-card"
      style={{
        backgroundImage: `radial-gradient(circle at 50% 0%, color-mix(in srgb, ${team.color} 16%, transparent), transparent 24rem)`,
      }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1"
        style={{ backgroundColor: team.color }}
      />

      <div className="grid grid-cols-2 divide-x divide-border">
        {primaryDrivers.map((driver) => (
          <DriverCell
            driver={driver}
            key={driver.id}
            onToggle={onToggle}
            season={season}
            selected={selectedIds.has(driver.id)}
            team={team}
          />
        ))}
        {primaryDrivers.length === 1 ? (
          <div className="grid min-h-64 place-items-center p-4 text-center text-xs text-muted-foreground">
            Второй пилот пока не определен
          </div>
        ) : null}
      </div>

      {reserveDrivers.length ? (
        <div className="border-t border-border px-4 py-3">
          <p className="text-xs font-semibold text-muted-foreground">Также выступали</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {reserveDrivers.map((driver) => {
              const selected = selectedIds.has(driver.id);

              return (
                <div
                  className={cn(
                    "flex min-h-11 min-w-0 items-center gap-2 rounded-md border px-2.5 py-1.5",
                    selected ? "border-primary bg-primary/10" : "border-border bg-background/40",
                  )}
                  key={driver.id}
                >
                  <Link
                    aria-label={`Открыть профиль: ${driver.fullName}`}
                    className="group flex min-w-0 items-center gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    href={`/drivers/${driver.slug}?season=${season}`}
                    prefetch={false}
                  >
                    <DriverAvatarBadge
                      className="size-8"
                      color={team.color}
                      fallbackLabel={driver.number ?? driver.code}
                      imageClassName="transition-transform duration-200 ease-out group-hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none"
                      name={driver.fullName}
                      season={season}
                      sizes="2rem"
                      slug={driver.slug}
                      src={driver.avatarUrl}
                    />
                    <span className="max-w-32 truncate text-xs font-bold">{driver.fullName}</span>
                  </Link>
                  <button
                    aria-label={selected ? `Убрать ${driver.fullName} из сравнения` : `Добавить ${driver.fullName} к сравнению`}
                    aria-pressed={selected}
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                      selected ? "bg-primary text-primary-foreground" : "bg-accent text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => onToggle(driver)}
                    type="button"
                  >
                    {selected ? <Check aria-hidden="true" className="size-4" /> : <Plus aria-hidden="true" className="size-4" />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <Link
        className="flex min-h-16 items-center justify-between gap-3 border-t border-border bg-background/50 px-4 py-3 transition-colors duration-200 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none"
        href={`/teams/${team.slug}?season=${season}`}
        prefetch={false}
      >
        <div className="min-w-0">
          <p className="truncate font-display text-base font-extrabold">{team.shortName}</p>
          <p className="mt-0.5 font-telemetry text-[0.65rem] font-bold text-muted-foreground">
            {team.championshipPosition ? `P${team.championshipPosition} в Кубке конструкторов` : "Позиция уточняется"}
          </p>
        </div>
        <TeamLogo
          code={team.code}
          color={team.color}
          logo={team.logo}
          name={team.name}
          season={season}
          size="md"
        />
      </Link>
    </article>
  );
}

function DriverCell({
  driver,
  onToggle,
  season,
  selected,
  team,
}: {
  driver: DriverDirectoryDriver;
  onToggle: (driver: DriverDirectoryDriver) => void;
  season: number;
  selected: boolean;
  team: DriverDirectoryTeam;
}) {
  return (
    <div className={cn("grid min-h-64 content-between gap-4 p-3 sm:p-4", selected && "bg-primary/6")}>
      <Link
        className="group grid min-w-0 justify-items-center gap-3 rounded-md text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        href={`/drivers/${driver.slug}?season=${season}`}
        prefetch={false}
      >
        <DriverAvatarBadge
          className="size-20 sm:size-24"
          color={team.color}
          fallbackClassName="font-telemetry text-2xl text-foreground"
          fallbackLabel={driver.number ?? driver.code}
          imageClassName="transition-transform duration-200 ease-out group-hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none"
          name={driver.fullName}
          season={season}
          sizes="6rem"
          slug={driver.slug}
          src={driver.avatarUrl}
        />
        <div className="min-w-0">
          <p className="text-balance font-display text-sm font-extrabold leading-tight group-hover:text-primary sm:text-base">
            {driver.fullName}
          </p>
          <p className="mt-1 font-telemetry text-[0.65rem] font-bold text-muted-foreground">
            № {driver.number ?? "?"} <span aria-hidden="true">/</span> {driver.championshipPosition ? `P${driver.championshipPosition}` : "без позиции"}
          </p>
          <p className="mt-2 font-telemetry text-base font-extrabold sm:text-lg">
            {formatPoints(driver.points)} <span className="text-[0.65rem] text-muted-foreground">оч.</span>
          </p>
        </div>
      </Link>

      <Button
        aria-pressed={selected}
        className="h-11 w-full px-2 text-[0.62rem] sm:text-[0.68rem]"
        onClick={() => onToggle(driver)}
        type="button"
        variant={selected ? "default" : "outline"}
      >
        {selected ? <Check aria-hidden="true" data-icon="inline-start" /> : <Plus aria-hidden="true" data-icon="inline-start" />}
        {selected ? "Выбран" : "К сравнению"}
      </Button>
    </div>
  );
}

function formatPoints(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
