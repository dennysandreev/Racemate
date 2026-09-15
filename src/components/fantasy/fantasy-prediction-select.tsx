"use client";

import { CheckCircle2, Lock, X } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";

import { TeamLogo } from "@/components/racemate/team-logo";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { DriverOption } from "@/types/racemate";

type DriverPredictionField = {
  allowNoDnf?: boolean;
  helper: string;
  label: string;
  name: "poleDriverId" | "fastestLapDriverId" | "dnfDriverId";
  short: string;
  locked?: boolean;
  value?: string | null;
};

export type FantasyTeamSelectOption = {
  carImageUrl?: string | null;
  code?: string | null;
  color?: string | null;
  id: string;
  logo?: string | null;
  name: string;
};

type TeamPredictionField = {
  helper: string;
  label: string;
  name: "topScoringTeamId" | "fastestPitStopTeamId";
  short: string;
  locked?: boolean;
  value?: string | null;
};

export function FantasyDriverPredictionSelect({
  drivers,
  field,
}: {
  drivers: DriverOption[];
  field: DriverPredictionField;
}) {
  const initialValue = field.value === "__none" && field.allowNoDnf
    ? "__none"
    : drivers.some((driver) => driver.id === field.value)
      ? field.value ?? ""
      : "";
  const [value, setValue] = useState(initialValue);
  const selectRef = useRef<HTMLButtonElement>(null);
  const selectedDriver = drivers.find((driver) => driver.id === value) ?? null;
  const noDnf = field.allowNoDnf && value === "__none";
  const hasSelection = Boolean(selectedDriver || noDnf);
  const displayValue = noDnf ? "Без сходов" : selectedDriver?.name ?? field.helper;

  function clearSelection() {
    setValue("");
    window.requestAnimationFrame(() => selectRef.current?.focus());
  }

  return (
    <div
      className={cn(
        "group h-[5.875rem] min-w-0 rounded-lg border border-border/75 bg-background/35 px-3 py-2 transition-colors hover:border-primary/50 sm:p-2",
        field.locked && "border-warning/50 bg-warning/5",
      )}
    >
      <div
        className={cn(
          "grid h-[4.875rem] min-w-0 grid-cols-[3rem_minmax(0,1fr)] items-center gap-2 sm:flex sm:gap-3",
          (hasSelection || field.locked) && "grid-cols-[3rem_minmax(0,1fr)_2.25rem]",
        )}
      >
        <span className="relative grid size-8 shrink-0 place-items-center justify-self-center overflow-hidden rounded-full border border-border/70 bg-muted font-telemetry text-[0.65rem] font-black sm:size-11">
          {noDnf ? <CheckCircle2 aria-hidden="true" className="size-5 text-success" /> : selectedDriver?.code ?? "?"}
          {selectedDriver?.avatarUrl ? (
            <Image
              alt=""
              className="object-cover object-top"
              fill
              sizes="(max-width: 639px) 32px, 44px"
              src={selectedDriver.avatarUrl}
            />
          ) : null}
        </span>
        {!noDnf ? (
          <span
            aria-hidden="true"
            className="hidden h-9 w-0.5 shrink-0 rounded-full sm:block"
            style={{ backgroundColor: selectedDriver?.teamColor ?? "var(--border)" }}
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-muted-foreground">{field.label}</span>
          {hasSelection ? (
            <>
              <span className="mt-1 block truncate text-sm font-bold">{displayValue}</span>
              {selectedDriver ? (
                <span className="mt-0.5 block truncate text-[0.7rem] text-muted-foreground">
                  {selectedDriver.team}{selectedDriver.number ? ` · №${selectedDriver.number}` : ""}
                </span>
              ) : null}
            </>
          ) : (
            <Select
              disabled={field.locked}
              name={field.name}
              onValueChange={setValue}
              value={value}
            >
              <SelectTrigger
                aria-label={field.label}
                className="mt-1 h-10 w-full min-w-0 bg-background shadow-none"
                id={field.name}
                ref={selectRef}
              >
                <SelectValue placeholder="Выбрать пилота" />
              </SelectTrigger>
              <SelectContent
                align="start"
                className="max-h-72 w-[var(--radix-select-trigger-width)]"
                position="popper"
              >
                {field.allowNoDnf ? <SelectItem value="__none">Без сходов</SelectItem> : null}
                {drivers.map((driver) => (
                  <SelectItem key={driver.id} value={driver.id}>
                    <span className="min-w-0 truncate">{driver.name} · {driver.team}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        {field.locked ? (
          <Lock aria-hidden="true" className="size-4 shrink-0 text-warning" />
        ) : hasSelection ? (
          <Button
            aria-label={`Очистить выбор: ${displayValue}`}
            className="size-9 shrink-0 justify-self-center"
            onClick={clearSelection}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      {hasSelection ? <input name={field.name} type="hidden" value={value} /> : null}
    </div>
  );
}

export function FantasyTeamPredictionSelect({
  field,
  teams,
}: {
  field: TeamPredictionField;
  teams: FantasyTeamSelectOption[];
}) {
  const [value, setValue] = useState(field.value ?? "");
  const selectRef = useRef<HTMLButtonElement>(null);
  const selectedTeam = teams.find((team) => team.id === value) ?? null;

  function clearSelection() {
    setValue("");
    window.requestAnimationFrame(() => selectRef.current?.focus());
  }

  return (
    <div
      className={cn(
        "group h-[5.875rem] min-w-0 rounded-lg border border-border/75 bg-background/35 px-3 py-2 transition-colors hover:border-primary/50 sm:p-2",
        field.locked && "border-warning/50 bg-warning/5",
      )}
    >
      <div
        className={cn(
          "grid h-[4.875rem] min-w-0 gap-2",
          selectedTeam && !field.locked && "grid-cols-[minmax(0,1fr)_2.5rem] items-center",
        )}
        data-fantasy-team-card
      >
        {selectedTeam ? (
          <div className="relative grid h-[4.875rem] min-w-0 grid-cols-[2.5rem_minmax(0,1fr)_5.25rem] items-center gap-2 overflow-hidden rounded-lg px-1.5 sm:grid-cols-[2.75rem_minmax(7rem,0.9fr)_minmax(7rem,1.1fr)] sm:gap-3 sm:px-3">
            <span className="relative z-10 grid place-items-center">
              <TeamLogo
                code={selectedTeam.code}
                color={selectedTeam.color}
                logo={selectedTeam.logo}
                name={selectedTeam.name}
                shape="square"
                size="sm"
              />
            </span>
            <span className="relative z-10 min-w-0">
              <span className="line-clamp-2 text-[0.7rem] font-semibold leading-3.5 text-muted-foreground sm:text-xs sm:leading-4">
                {field.label}
              </span>
              <span className="mt-1 block line-clamp-2 text-xs font-bold leading-3.5 sm:text-sm sm:leading-4">
                {selectedTeam.name}
              </span>
            </span>
            {selectedTeam.carImageUrl ? (
              <span className="relative h-full min-w-0">
                <Image
                  alt={`Болид ${selectedTeam.name}`}
                  className="object-contain object-right"
                  fill
                  sizes="(max-width: 639px) 84px, 180px"
                  src={selectedTeam.carImageUrl}
                />
              </span>
            ) : (
              <span aria-hidden="true" />
            )}
            {selectedTeam.color ? (
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 w-0.5"
                style={{ backgroundColor: selectedTeam.color }}
              />
            ) : null}
            {field.locked ? (
              <Lock aria-hidden="true" className="absolute right-3 top-3 z-10 size-4 text-warning" />
            ) : null}
          </div>
        ) : (
          <div className="relative h-[4.875rem] min-w-0 overflow-hidden rounded-lg py-1 sm:px-3">
            <div className="relative z-10 grid h-full w-full min-w-0 grid-cols-[3rem_minmax(0,1fr)] items-center gap-2 sm:flex sm:gap-3">
              <span className="relative grid size-8 shrink-0 place-items-center justify-self-center overflow-hidden rounded-lg border border-border/70 bg-background/65 sm:size-11">
                <span className="font-telemetry text-xs font-black text-muted-foreground">?</span>
              </span>
              <div className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-muted-foreground">
                  {field.label}
                </span>
                <Select
                  disabled={field.locked}
                  name={field.name}
                  onValueChange={setValue}
                  value={value}
                >
                  <SelectTrigger
                    aria-label={field.label}
                    className="mt-1 h-10 w-full min-w-0 bg-background shadow-none"
                    id={field.name}
                    ref={selectRef}
                  >
                    <SelectValue placeholder="Выбрать команду" />
                  </SelectTrigger>
                  <SelectContent
                    align="start"
                    className="max-h-72 w-[var(--radix-select-trigger-width)]"
                    position="popper"
                  >
                    {teams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        <span className="min-w-0 truncate">{team.name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}
        {selectedTeam && !field.locked ? (
          <Button
            aria-label={`Очистить выбор: ${selectedTeam.name}`}
            className="size-9"
            onClick={clearSelection}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      {selectedTeam ? <input name={field.name} type="hidden" value={value} /> : null}
    </div>
  );
}
