"use client";

import { DragDropProvider, useDraggable, useDroppable } from "@dnd-kit/react";
import {
  GripVertical,
  X,
} from "lucide-react";
import Image from "next/image";
import { useMemo, useRef, useState, type ReactNode } from "react";

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

const MAX_TOP_TEN = 10;
type TopTenSlot = string | null;

export function Top10PredictionPicker({
  belowFinish,
  defaultValue,
  drivers,
  headerAction,
  locked,
}: {
  belowFinish?: ReactNode;
  defaultValue: string[];
  drivers: DriverOption[];
  headerAction?: ReactNode;
  locked?: boolean;
}) {
  const availableIds = useMemo(() => new Set(drivers.map((driver) => driver.id)), [drivers]);
  const initialValue = useMemo<TopTenSlot[]>(() => {
    const slots = Array.from<TopTenSlot>({ length: MAX_TOP_TEN }).fill(null);

    [...new Set(defaultValue)]
      .filter((id) => availableIds.has(id))
      .slice(0, MAX_TOP_TEN)
      .forEach((id, index) => {
        slots[index] = id;
      });

    return slots;
  }, [availableIds, defaultValue]);
  const [selected, setSelected] = useState(initialValue);
  const [announcement, setAnnouncement] = useState("");
  const driverById = useMemo(
    () => new Map(drivers.map((driver) => [driver.id, driver])),
    [drivers],
  );
  const selectedSet = useMemo(
    () => new Set(selected.filter((id): id is string => Boolean(id))),
    [selected],
  );
  const selectedCount = selectedSet.size;

  function commit(next: TopTenSlot[], message: string) {
    if (locked || next.map((id) => id ?? "").join("|") === selected.map((id) => id ?? "").join("|")) {
      return;
    }

    setSelected(next.slice(0, MAX_TOP_TEN));
    setAnnouncement(message);
  }

  function placeDriver(driverId: string, targetIndex: number) {
    const driver = driverById.get(driverId);
    if (!driver) {
      return;
    }

    const sourceIndex = selected.indexOf(driverId);
    if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= MAX_TOP_TEN || sourceIndex === targetIndex) {
      return;
    }

    const next = [...selected];
    const targetDriverId = next[targetIndex];
    next[targetIndex] = driverId;
    next[sourceIndex] = targetDriverId;

    commit(next, `${driver.name} перемещён на P${targetIndex + 1}`);
  }

  function removeDriver(driverId: string) {
    const driver = driverById.get(driverId);
    commit(
      selected.map((id) => id === driverId ? null : id),
      `${driver?.name ?? "Пилот"} убран из топ-10`,
    );
  }

  function selectDriver(driverId: string, index: number) {
    const driver = driverById.get(driverId);
    if (!driver || selectedSet.has(driverId)) {
      return;
    }

    const next = [...selected];
    if (index < 0 || index >= MAX_TOP_TEN || next[index]) {
      return;
    }
    next[index] = driverId;

    commit(
      next,
      `${driver.name} выбран на P${index + 1}`,
    );
  }

  return (
    <DragDropProvider
      onDragEnd={(event) => {
        if (event.canceled || locked) {
          return;
        }

        const sourceId = String(event.operation.source?.id ?? "");
        const targetId = String(event.operation.target?.id ?? "");
        const driverId = sourceId.startsWith("driver:") ? sourceId.slice(7) : "";

        if (!driverId) {
          return;
        }

        if (targetId.startsWith("position:")) {
          const targetIndex = Number(targetId.slice(9));
          if (Number.isInteger(targetIndex)) {
            placeDriver(driverId, targetIndex);
          }
        }
      }}
    >
      <div className="grid min-w-0 gap-4 overflow-x-hidden">
        <div className="grid min-w-0 gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-bold">Топ-10 на финише</h2>
            </div>
            <div className="flex w-full min-w-0 items-center gap-3 sm:w-auto">
              <div className="min-w-0 flex-1 sm:flex-none">{headerAction}</div>
              <span className="hidden shrink-0 font-telemetry text-xs font-bold text-muted-foreground sm:inline">
                {selectedCount}/10
              </span>
            </div>
          </div>
          <section
            aria-label="Прогнозируемый топ-10"
            className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-background/30"
          >
            <header className="flex items-center justify-between gap-3 border-b border-border/70 px-3 py-3 sm:hidden">
              <p className="font-display text-sm font-bold">Порядок финиша</p>
              <span className="shrink-0 font-telemetry text-xs font-bold text-muted-foreground">
                {selectedCount}/10
              </span>
            </header>

            <div className="min-h-0 min-w-0 flex-1 divide-y divide-border/65 overflow-x-hidden xl:grid xl:grid-cols-2 xl:divide-y-0">
              {Array.from({ length: MAX_TOP_TEN }, (_, index) => {
                const driverId = selected[index];
                const driver = driverId ? driverById.get(driverId) : null;

                return (
                  <PositionSlot
                    driver={driver ?? null}
                    drivers={drivers}
                    index={index}
                    key={index}
                    locked={Boolean(locked)}
                    onMove={(targetIndex) => {
                      if (driverId) {
                        placeDriver(driverId, targetIndex);
                      }
                    }}
                    onRemove={removeDriver}
                    onSelect={(driverId) => selectDriver(driverId, index)}
                    selectedIds={selectedSet}
                  />
                );
              })}
            </div>
          </section>
          {belowFinish}
        </div>

        {selected.filter((driverId): driverId is string => Boolean(driverId)).map((driverId) => (
          <input key={driverId} name="top10DriverIds" type="hidden" value={driverId} />
        ))}

        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
      </div>
    </DragDropProvider>
  );
}

function PositionSlot({
  driver,
  drivers,
  index,
  locked,
  onMove,
  onRemove,
  onSelect,
  selectedIds,
}: {
  driver: DriverOption | null;
  drivers: DriverOption[];
  index: number;
  locked: boolean;
  onMove: (targetIndex: number) => void;
  onRemove: (driverId: string) => void;
  onSelect: (driverId: string) => void;
  selectedIds: Set<string>;
}) {
  const selectRef = useRef<HTMLButtonElement>(null);
  const {
    isDropTarget,
    ref: setDroppableElement,
  } = useDroppable({ id: `position:${index}`, disabled: locked });
  const {
    handleRef: setDragHandle,
    isDragging,
    ref: setDraggableElement,
  } = useDraggable({
    id: `driver:${driver?.id ?? `empty-${index}`}`,
    disabled: locked || !driver,
  });
  const availableDrivers = drivers.filter(
    (option) => option.id === driver?.id || !selectedIds.has(option.id),
  );

  return (
    <div
      className={cn(
        "grid h-[5.875rem] min-w-0 max-w-full grid-cols-[3rem_minmax(0,1fr)] items-center gap-2 overflow-hidden border-border/65 px-3 py-2 transition-colors sm:grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] sm:px-3 xl:border-b xl:border-r xl:[&:nth-child(even)]:border-r-0 xl:[&:nth-child(n+9)]:border-b-0",
        driver && "grid-cols-[3rem_minmax(0,1fr)_2.25rem]",
        isDropTarget && "bg-primary/10",
      )}
      data-fantasy-position={index + 1}
      ref={setDroppableElement}
    >
      <span className="font-telemetry text-lg font-black text-primary">P{index + 1}</span>
      <div
        className={cn("flex min-w-0 items-center gap-2", isDragging && "opacity-45")}
        ref={driver ? setDraggableElement : undefined}
      >
        {driver ? (
          <button
            aria-label={`Перетащить ${driver.name} с позиции P${index + 1}`}
            aria-keyshortcuts="ArrowUp ArrowDown"
            className={cn(
              "hidden size-9 shrink-0 place-items-center rounded-md text-muted-foreground sm:grid",
              !locked && "cursor-grab hover:bg-accent hover:text-foreground active:cursor-grabbing",
            )}
            disabled={locked}
            onKeyDown={(event) => {
              if (locked) {
                return;
              }

              if (event.key === "ArrowUp" && index > 0) {
                event.preventDefault();
                onMove(index - 1);
              }

              if (event.key === "ArrowDown" && index < MAX_TOP_TEN - 1) {
                event.preventDefault();
                onMove(index + 1);
              }
            }}
            ref={setDragHandle}
            type="button"
          >
            <GripVertical aria-hidden="true" className="size-4" />
          </button>
        ) : null}
        <div className="grid min-w-0 flex-1 gap-2">
          {driver ? <DriverIdentity driver={driver} compact /> : null}
          {!driver ? (
            <Select
              disabled={locked}
              onValueChange={(value) => {
                if (value) {
                  onSelect(value);
                }
              }}
              value=""
            >
              <SelectTrigger
                aria-label={`Пилот на позиции P${index + 1}`}
                className="h-10 w-full min-w-0 bg-background shadow-none"
                ref={selectRef}
              >
                <SelectValue placeholder="Выбрать пилота" />
              </SelectTrigger>
              <SelectContent
                align="start"
                className="max-h-72 w-[var(--radix-select-trigger-width)]"
                position="popper"
              >
                {availableDrivers.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    <span className="min-w-0 truncate">
                      {formatShortDriverName(option.name)} · {option.team}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      </div>
      {driver ? (
        <Button
          aria-label={`Убрать ${driver.name}`}
          className="size-9"
          disabled={locked}
          onClick={() => {
            onRemove(driver.id);
            window.requestAnimationFrame(() => selectRef.current?.focus());
          }}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}

function DriverIdentity({
  compact = false,
  driver,
}: {
  compact?: boolean;
  driver: DriverOption;
}) {
  const initials = driver.code?.slice(0, 3)
    ?? driver.name.split(" ").map((part) => part[0]).join("").slice(0, 2);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      <span
        className={cn(
          "relative grid shrink-0 place-items-center overflow-hidden rounded-full border border-border/70 bg-muted font-telemetry text-[0.65rem] font-black",
          compact ? "size-9" : "size-10",
        )}
      >
        {initials}
        {driver.avatarUrl ? (
          <Image
            alt=""
            className="object-cover object-top"
            fill
            sizes={compact ? "36px" : "40px"}
            src={driver.avatarUrl}
          />
        ) : null}
      </span>
      <span
        aria-hidden="true"
        className="h-8 w-0.5 shrink-0 rounded-full"
        style={{ backgroundColor: driver.teamColor ?? "var(--border)" }}
      />
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold">{driver.name}</span>
        <span className="mt-0.5 block truncate text-[0.7rem] text-muted-foreground">
          {driver.team}{driver.number ? ` · №${driver.number}` : ""}
        </span>
      </span>
    </div>
  );
}

function formatShortDriverName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length < 2) {
    return name;
  }

  return `${parts[0][0]}.${parts.at(-1)}`;
}
