"use client";

import { Check, Flag, Users } from "lucide-react";
import { useState } from "react";

import { DriverAvatarBadge } from "@/components/racemate/driver-avatar-badge";
import { TeamLogo } from "@/components/racemate/team-logo";
import { cn } from "@/lib/utils";

type TeamChoice = {
  code?: string | null;
  color?: string | null;
  id: string;
  label: string;
  logo?: string | null;
};

type DriverChoice = {
  code?: string | null;
  color?: string | null;
  id: string;
  label: string;
  slug?: string | null;
  team: string;
};

export function FavoriteChoiceGroups({
  drivers,
  selectedDriverIds,
  selectedTeamId,
  teams,
}: {
  drivers: DriverChoice[];
  selectedDriverIds: string[];
  selectedTeamId?: string;
  teams: TeamChoice[];
}) {
  const [teamId, setTeamId] = useState(selectedTeamId ?? "");
  const [driverIds, setDriverIds] = useState(() => selectedDriverIds.slice(0, 2));

  function toggleDriver(driverId: string) {
    setDriverIds((current) => {
      if (current.includes(driverId)) {
        return current.filter((id) => id !== driverId);
      }

      return current.length >= 2 ? current : [...current, driverId];
    });
  }

  return (
    <>
      <fieldset className="grid gap-5 border-t stitch-divider p-5 sm:p-6">
        <legend className="sr-only">Любимая команда</legend>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="stitch-label flex items-center gap-2 text-primary">
              <Flag aria-hidden="true" className="size-3.5" />
              Команда
            </p>
            <h2 className="mt-2 font-display text-xl font-extrabold">Любимая команда</h2>
            <p className="mt-1 text-sm text-muted-foreground">Выбери одну команду, за которой следишь ближе всего.</p>
          </div>
          <span className="font-telemetry text-xs font-bold text-muted-foreground">Один выбор</span>
        </div>

        {teams.length ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {teams.map((team) => {
              const checked = teamId === team.id;

              return (
                <label
                  className={cn(
                    "group relative grid min-h-20 cursor-pointer grid-cols-[auto_minmax(0,1fr)_1.75rem] items-center gap-3 overflow-hidden rounded-md border border-border bg-card/55 px-3 py-3 transition-colors hover:border-foreground/25 hover:bg-accent/45 focus-within:ring-2 focus-within:ring-ring",
                    checked && "bg-accent/55",
                  )}
                  key={team.id}
                  style={{ borderColor: checked ? (team.color ?? "var(--primary)") : undefined }}
                >
                  <input
                    checked={checked}
                    className="sr-only"
                    name="teamIds"
                    onChange={() => setTeamId(team.id)}
                    type="radio"
                    value={team.id}
                  />
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 left-0 w-1 opacity-80"
                    style={{ backgroundColor: team.color ?? "var(--primary)" }}
                  />
                  <TeamLogo
                    code={team.code}
                    color={team.color}
                    logo={team.logo}
                    name={team.label}
                    size="sm"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold leading-tight">{team.label}</span>
                    <span className="mt-1 block font-telemetry text-[0.65rem] font-bold text-muted-foreground">
                      {team.code ?? "F1"}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "grid size-6 place-items-center rounded-full border border-border text-transparent transition-colors",
                      checked && "border-primary bg-primary text-primary-foreground",
                    )}
                  >
                    <Check aria-hidden="true" className="size-3.5" />
                  </span>
                </label>
              );
            })}
          </div>
        ) : (
          <p className="border-l-2 border-primary px-4 py-2 text-sm text-muted-foreground">
            Команды появятся после обновления чемпионата.
          </p>
        )}
      </fieldset>

      <fieldset className="grid gap-5 border-t stitch-divider p-5 sm:p-6">
        <legend className="sr-only">Любимые пилоты</legend>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="stitch-label flex items-center gap-2 text-primary">
              <Users aria-hidden="true" className="size-3.5" />
              Пилоты
            </p>
            <h2 className="mt-2 font-display text-xl font-extrabold">Любимые пилоты</h2>
            <p className="mt-1 text-sm text-muted-foreground">Можно выбрать до двух гонщиков текущего сезона.</p>
          </div>
          <span
            className={cn(
              "rounded border border-border px-2.5 py-1 font-telemetry text-xs font-extrabold",
              driverIds.length > 0 && "border-success/45 bg-success/10 text-success",
            )}
          >
            {driverIds.length} / 2
          </span>
        </div>

        {drivers.length ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {drivers.map((driver) => {
              const checked = driverIds.includes(driver.id);
              const isUnavailable = !checked && driverIds.length >= 2;

              return (
                <label
                  className={cn(
                    "group grid min-h-20 grid-cols-[3.5rem_minmax(0,1fr)_1.75rem] items-center gap-3 rounded-md border border-border bg-card/55 px-3 py-2.5 transition-colors focus-within:ring-2 focus-within:ring-ring",
                    isUnavailable
                      ? "cursor-not-allowed opacity-40"
                      : "cursor-pointer hover:border-foreground/25 hover:bg-accent/45",
                    checked && "bg-accent/55",
                  )}
                  key={driver.id}
                  style={{ borderColor: checked ? (driver.color ?? "var(--primary)") : undefined }}
                >
                  <input
                    checked={checked}
                    className="sr-only"
                    disabled={isUnavailable}
                    name="driverIds"
                    onChange={() => toggleDriver(driver.id)}
                    type="checkbox"
                    value={driver.id}
                  />
                  <DriverAvatarBadge
                    className="size-14"
                    color={driver.color}
                    name={driver.label}
                    sizes="3.5rem"
                    slug={driver.slug}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold leading-tight">{driver.label}</span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">{driver.team}</span>
                  </span>
                  <span
                    className={cn(
                      "grid size-6 place-items-center rounded-full border border-border text-transparent transition-colors",
                      checked && "border-primary bg-primary text-primary-foreground",
                    )}
                  >
                    <Check aria-hidden="true" className="size-3.5" />
                  </span>
                </label>
              );
            })}
          </div>
        ) : (
          <p className="border-l-2 border-primary px-4 py-2 text-sm text-muted-foreground">
            Пилоты появятся после обновления чемпионата.
          </p>
        )}
      </fieldset>
    </>
  );
}
