"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

type ChoiceItem = { id: string; label: string };

export function FavoriteChoiceGroups({
  drivers,
  selectedDriverIds,
  selectedTeamId,
  teams,
}: {
  drivers: ChoiceItem[];
  selectedDriverIds: string[];
  selectedTeamId?: string;
  teams: ChoiceItem[];
}) {
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
      <fieldset className="grid gap-3">
        <legend className="text-sm font-medium">Любимая команда</legend>
        {teams.length ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map((team) => (
              <label
                className="flex min-h-11 items-center gap-2 rounded-md border border-border/70 bg-background/35 px-3 text-sm transition-colors hover:bg-accent"
                key={team.id}
              >
                <input
                  defaultChecked={selectedTeamId === team.id}
                  name="teamIds"
                  type="radio"
                  value={team.id}
                />
                {team.label}
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Команды появятся после синхронизации.</p>
        )}
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium">
          <span>Любимые пилоты</span>
          <span className="text-xs font-normal text-muted-foreground">{driverIds.length} из 2</span>
        </legend>
        {drivers.length ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {drivers.map((driver) => {
              const checked = driverIds.includes(driver.id);
              const isUnavailable = !checked && driverIds.length >= 2;

              return (
                <label
                  className={cn(
                    "flex min-h-11 items-center gap-2 rounded-md border border-border/70 bg-background/35 px-3 text-sm transition-colors hover:bg-accent",
                    isUnavailable && "cursor-not-allowed opacity-45 hover:bg-background/35",
                  )}
                  key={driver.id}
                >
                  <input
                    checked={checked}
                    disabled={isUnavailable}
                    name="driverIds"
                    onChange={() => toggleDriver(driver.id)}
                    type="checkbox"
                    value={driver.id}
                  />
                  {driver.label}
                </label>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Пилоты появятся после синхронизации.</p>
        )}
      </fieldset>
    </>
  );
}
