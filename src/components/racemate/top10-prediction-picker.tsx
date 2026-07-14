"use client";

import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import type { DriverOption } from "@/types/racemate";

export function Top10PredictionPicker({
  defaultValue,
  drivers,
  locked,
}: {
  defaultValue: string[];
  drivers: DriverOption[];
  locked?: boolean;
}) {
  const initialValue = useMemo(
    () => Array.from({ length: 10 }, (_, index) => defaultValue[index] ?? ""),
    [defaultValue],
  );
  const [selected, setSelected] = useState(initialValue);

  function updatePosition(index: number, value: string) {
    setSelected((current) =>
      current.map((driverId, currentIndex) => (currentIndex === index ? value : driverId)),
    );
  }

  return (
    <div className="divide-y divide-border/70">
      {selected.map((driverId, index) => (
        <label
          className={cn(
            "grid gap-1.5 py-2.5 transition-colors sm:grid-cols-[3.2rem_1fr] sm:items-center",
            locked && "text-warning",
          )}
          key={index}
        >
          <span
            className={cn(
              "font-telemetry text-sm font-bold text-muted-foreground",
              locked && "text-warning",
            )}
          >
            P{index + 1}
          </span>
          <select
            className="min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            disabled={locked}
            name="top10DriverIds"
            onChange={(event) => updatePosition(index, event.target.value)}
            value={driverId}
          >
            <option value="">Пилот</option>
            {drivers.map((driver) => (
              <option
                key={driver.id}
                value={driver.id}
              >
                {driver.name} · {driver.team}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}
