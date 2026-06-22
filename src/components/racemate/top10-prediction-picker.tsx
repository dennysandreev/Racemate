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
  const selectedIds = new Set(selected.filter(Boolean));

  function updatePosition(index: number, value: string) {
    setSelected((current) =>
      current.map((driverId, currentIndex) => (currentIndex === index ? value : driverId)),
    );
  }

  return (
    <div className="grid gap-3">
      {selected.map((driverId, index) => (
        <label
          className={cn(
            "grid gap-2 rounded-md border border-border bg-background/35 p-3 transition-colors sm:grid-cols-[3.2rem_1fr] sm:items-center",
            locked && "border-warning/45 bg-warning/5",
          )}
          key={index}
        >
          <span className="font-telemetry text-sm font-bold text-muted-foreground">
            P{index + 1}
          </span>
          <select
            className="min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            disabled={locked}
            name="top10DriverIds"
            onChange={(event) => updatePosition(index, event.target.value)}
            required={!locked}
            value={driverId}
          >
            <option value="">Пилот</option>
            {drivers.map((driver) => (
              <option
                disabled={driver.id !== driverId && selectedIds.has(driver.id)}
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
