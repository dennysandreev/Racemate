"use client";

import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  CloudSun,
  Crosshair,
  Flag,
  Pause,
  Play,
  RadioTower,
  RotateCcw,
  ShieldAlert,
  Timer,
  Wrench,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  buildDriverMotion,
  pitLaneParamAt,
  trackProgressAt,
  type DriverMotion,
} from "@/features/race-replay/lib/motion";
import {
  buildPitGeometry,
  buildTrackGeometry,
  TRACK_WIDTH,
  type PitGeometry,
  type TrackGeometry,
} from "@/features/race-replay/lib/track-geometry";
import { cn } from "@/lib/utils";
import type {
  RaceReplaySnapshot,
  ReplayDriverState,
  ReplayPositionEvent,
  ReplayRaceEvent,
  TrackPoint,
} from "@/types/racemate";

type RaceReplayPlayerProps = {
  debug?: boolean;
  replay: RaceReplaySnapshot;
};

const speeds = [1, 2, 5, 10];
const staleTelemetryMs = 90_000;

type CurrentReplayPosition = ReplayPositionEvent & {
  isStale?: boolean;
  trailD?: string | null;
};

type TimingRow = ReplayDriverState & {
  lapDeficit: number | null;
  raceOrder: number;
};

type PitNotification = {
  driverNumber: number;
  abbreviation: string;
  pitLaneSeconds: number;
  pitStopSeconds: number | null;
  phase: "active" | "done";
  startMs: number;
  teamColor: string;
};

type PitWindow = {
  driverNumber: number;
  endMs: number;
  pitLaneSeconds: number | null;
  pitStopSeconds: number | null;
  startMs: number;
};

type PitLanePoint = {
  headingRad?: number;
  svgX: number;
  svgY: number;
  worldX?: number | null;
  worldY?: number | null;
  worldZ?: number | null;
};

type RaceStatus = {
  label: string;
  tone: "green" | "yellow" | "red" | "neutral";
  detail: string;
  event: ReplayRaceEvent | null;
};

type TimelineMarker = {
  offsetMs: number;
  tone: "yellow" | "red" | "neutral";
  label: string;
};

type PitHistoryItem = {
  abbreviation: string;
  driverNumber: number;
  isActive: boolean;
  pitLaneSeconds: number;
  pitStopSeconds: number | null;
  startMs: number;
  teamColor: string;
};

type TimingHighlights = {
  bestLapMs: number | null;
  bestSectorMs: [number | null, number | null, number | null];
};

type LapAnalytics = {
  bestRaceLap: LapAnalyticsRow | null;
  bestRecentLap: LapAnalyticsRow | null;
};

type LapAnalyticsRow = {
  abbreviation: string;
  compound: string | null;
  driverNumber: number;
  lapTime: string | null;
  lapTimeSeconds: number;
  teamColor: string;
};

type TyrePaceSummary = {
  averageLapSeconds: number;
  compound: string;
  count: number;
};

export function RaceReplayPlayer({ debug = false, replay }: RaceReplayPlayerProps) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<number | null>(
    replay.drivers[0]?.driverNumber ?? null,
  );
  const [speed, setSpeed] = useState(2);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [followMode, setFollowMode] = useState(false);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const lastTickRef = useRef<number | null>(null);
  const duration = Math.max(replay.durationMs, 1);
  const viewBox = replay.track.svg.viewBox;

  useEffect(() => {
    if (!isPlaying) {
      lastTickRef.current = null;
      return;
    }

    let frame = 0;

    const tick = (now: number) => {
      const previous = lastTickRef.current ?? now;
      lastTickRef.current = now;
      const delta = (now - previous) * speed;

      setElapsedMs((current) => {
        const next = Math.min(duration, current + delta);

        if (next >= duration) {
          setIsPlaying(false);
        }

        return next;
      });
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [duration, isPlaying, speed]);

  const handlePlayPause = useCallback(() => {
    setIsPlaying((value) => {
      if (value) {
        return false;
      }

      setElapsedMs((current) => (current >= duration - 250 ? 0 : current));
      lastTickRef.current = null;
      return true;
    });
  }, [duration]);

  const seekTo = useCallback((targetMs: number) => {
    setElapsedMs(clamp(targetMs, 0, duration));
  }, [duration]);

  const seekBy = useCallback((deltaMs: number) => {
    setElapsedMs((current) => clamp(current + deltaMs, 0, duration));
  }, [duration]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;

      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        handlePlayPause();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        seekBy(-15_000);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        seekBy(15_000);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlePlayPause, seekBy]);

  const positionsByDriver = useMemo(
    () => groupReplayPositionsByDriver(replay.positions),
    [replay.positions],
  );
  const pitLane = replay.track.pitLane ?? null;
  const displayPitLane = useMemo(
    () => buildDisplayPitLane(replay.track.centerline, pitLane?.points ?? [], replay.circuitName),
    [pitLane?.points, replay.circuitName, replay.track.centerline],
  );
  const pitSpan = useMemo(
    () => derivePitLaneSpan(replay.track.centerline, pitLane?.points ?? []),
    [pitLane?.points, replay.track.centerline],
  );
  const startFinishProgress = useMemo(
    () => deriveStartFinishProgress(pitSpan, replay.track.startFinish?.progress ?? 0),
    [pitSpan, replay.track.startFinish?.progress],
  );
  const geometry = useMemo(
    () => buildTrackGeometry(replay.track.centerline, startFinishProgress),
    [replay.track.centerline, startFinishProgress],
  );
  const pitGeometry = useMemo(() => buildPitGeometry(displayPitLane), [displayPitLane]);
  const motionByDriver = useMemo(() => {
    const map = new Map<number, DriverMotion>();

    for (const [driverNumber, events] of positionsByDriver.entries()) {
      map.set(driverNumber, buildDriverMotion(events));
    }

    return map;
  }, [positionsByDriver]);
  const pitWindows = useMemo(
    () => buildPitWindows(replay.positions),
    [replay.positions],
  );
  const [lateralOffsets] = useState(() => new Map<number, number>());
  const currentPositions = useMemo(
    () => getCurrentPositions(motionByDriver, elapsedMs, geometry, pitWindows, pitGeometry, lateralOffsets),
    [elapsedMs, geometry, lateralOffsets, motionByDriver, pitGeometry, pitWindows],
  );
  const timingRows = useMemo(
    () => buildTimingRows(replay.drivers, currentPositions),
    [currentPositions, replay.drivers],
  );
  const timingHighlights = useMemo(
    () => getTimingHighlights(timingRows),
    [timingRows],
  );
  const selected = selectedDriver ? timingRows.find((row) => row.driverNumber === selectedDriver) ?? null : null;
  const visibleEvents = useMemo(
    () => replay.raceEvents.filter((event) => event.offsetMs <= elapsedMs).reverse(),
    [elapsedMs, replay.raceEvents],
  );
  const currentLap = useMemo(() => {
    const laps = timingRows
      .map((row) => row.lapNumber)
      .filter((lap): lap is number => lap !== null && lap !== undefined && Number.isFinite(lap));

    return laps.length ? Math.max(...laps) : null;
  }, [timingRows]);
  const retiredRows = useMemo(
    () => timingRows.filter((row) => row.status === "OUT"),
    [timingRows],
  );
  const pitNotifications = useMemo(
    () => getPitNotifications(pitWindows, replay.drivers, elapsedMs),
    [elapsedMs, pitWindows, replay.drivers],
  );
  const lapAnalytics = useMemo(
    () => getLapAnalytics(timingRows),
    [timingRows],
  );
  const tyrePace = useMemo(
    () => getTyrePaceSummary(timingRows, pitWindows, elapsedMs),
    [elapsedMs, pitWindows, timingRows],
  );
  const showChequeredFlag = Boolean(
    replay.totalLaps && currentLap !== null && currentLap >= replay.totalLaps,
  ) || elapsedMs >= duration;
  const raceStatus = useMemo(
    () => getRaceStatus(replay.raceEvents, elapsedMs, showChequeredFlag),
    [elapsedMs, replay.raceEvents, showChequeredFlag],
  );
  const timelineMarkers = useMemo(
    () => buildTimelineMarkers(replay.raceEvents, duration),
    [duration, replay.raceEvents],
  );
  const pitHistory = useMemo(
    () => getPitHistory(pitWindows, replay.drivers, elapsedMs),
    [elapsedMs, pitWindows, replay.drivers],
  );
  const followTarget = followMode && selectedDriver !== null
    ? currentPositions.get(selectedDriver) ?? null
    : null;
  const effectiveZoom = followTarget ? Math.max(zoom, 2.2) : zoom;
  const scaledWidth = viewBox.width / effectiveZoom;
  const scaledHeight = viewBox.height / effectiveZoom;
  const viewX = followTarget
    ? clamp(followTarget.svgX - scaledWidth / 2, 0, Math.max(0, viewBox.width - scaledWidth))
    : pan.x;
  const viewY = followTarget
    ? clamp(followTarget.svgY - scaledHeight / 2, 0, Math.max(0, viewBox.height - scaledHeight))
    : pan.y;
  const svgViewBox = `${viewX} ${viewY} ${scaledWidth} ${scaledHeight}`;

  const handlePointerDown = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (followMode) {
      setFollowMode(false);
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      panX: pan.x,
      panY: pan.y,
      x: event.clientX,
      y: event.clientY,
    };
  }, [followMode, pan.x, pan.y]);

  const handlePointerMove = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;

    if (!drag) {
      return;
    }

    const factorX = scaledWidth / Math.max(event.currentTarget.clientWidth, 1);
    const factorY = scaledHeight / Math.max(event.currentTarget.clientHeight, 1);
    setPan({
      x: clamp(drag.panX - (event.clientX - drag.x) * factorX, 0, Math.max(0, viewBox.width - scaledWidth)),
      y: clamp(drag.panY - (event.clientY - drag.y) * factorY, 0, Math.max(0, viewBox.height - scaledHeight)),
    });
  }, [scaledHeight, scaledWidth, viewBox.height, viewBox.width]);

  const stopDrag = useCallback(() => {
    dragRef.current = null;
  }, []);

  return (
    <div className="grid gap-4">
      <section className="stitch-panel min-w-0 overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4 sm:px-5">
          <div className="min-w-0 flex-1">
            <Button asChild className="mb-2.5" size="sm" variant="secondary">
              <Link href="/weekend" prefetch={false}>
                <ArrowLeft aria-hidden="true" data-icon="inline-start" />
                Текущий этап
              </Link>
            </Button>
            <p className="font-telemetry flex items-center gap-2 text-[0.62rem] font-bold uppercase tracking-[0.12em] text-primary">
              <RadioTower aria-hidden="true" className="size-3.5" />
              Повтор гонки · {replay.sourceSeason}
            </p>
            <h1 className="mt-1.5 text-balance font-display text-2xl font-extrabold leading-tight tracking-[-0.04em] sm:text-3xl">
              {replay.raceName}
            </h1>
            <p className="mt-1.5 text-sm font-semibold text-muted-foreground">{replay.circuitName}</p>
          </div>
          <WeatherChips weather={replay.weather} />
        </div>
        <RaceStatusBanner status={raceStatus} />
      </section>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_21.5rem]">
        <section className="stitch-panel min-w-0 overflow-hidden p-0">
          <div className="relative h-[26rem] overflow-hidden bg-[radial-gradient(circle_at_20%_12%,rgb(225_6_0_/_0.14),transparent_24rem)] p-3 sm:h-[30rem] xl:h-[34rem]">
            <SelectedDriverOverlay driver={selected} followMode={followMode} />
            <RetiredDriversPanel rows={retiredRows} setSelectedDriver={setSelectedDriver} />
            <PitNotificationStack items={pitNotifications} />
            <TrackLegend />
            <div className="absolute right-5 top-5 z-10 grid gap-1.5">
              <Button
                aria-label="Увеличить карту"
                className="size-8"
                onClick={() => setZoom((value) => Math.min(2.5, value + 0.25))}
                size="icon"
                type="button"
                variant="secondary"
              >
                <ZoomIn aria-hidden="true" />
              </Button>
              <Button
                aria-label="Уменьшить карту"
                className="size-8"
                onClick={() => setZoom((value) => Math.max(1, value - 0.25))}
                size="icon"
                type="button"
                variant="secondary"
              >
                <ZoomOut aria-hidden="true" />
              </Button>
              <Button
                aria-label="Сбросить карту"
                className="size-8"
                onClick={() => {
                  setPan({ x: 0, y: 0 });
                  setZoom(1);
                  setFollowMode(false);
                }}
                size="icon"
                type="button"
                variant="secondary"
              >
                <RotateCcw aria-hidden="true" />
              </Button>
              <Button
                aria-label={followMode ? "Отключить камеру за пилотом" : "Следить за выбранным пилотом"}
                aria-pressed={followMode}
                className={cn("size-8", followMode && "ring-2 ring-primary")}
                onClick={() => setFollowMode((value) => !value)}
                size="icon"
                type="button"
                variant={followMode ? "default" : "secondary"}
              >
                <Crosshair aria-hidden="true" />
              </Button>
            </div>
          <svg
            aria-label={`Повтор гонки на трассе ${replay.circuitName}`}
            className="race-replay-map-stage h-full w-full cursor-grab touch-none rounded-lg border border-border/70 active:cursor-grabbing"
            onPointerCancel={stopDrag}
            onPointerDown={handlePointerDown}
            onPointerLeave={stopDrag}
            onPointerMove={handlePointerMove}
            onPointerUp={stopDrag}
            role="img"
            viewBox={svgViewBox}
          >
            <defs>
              <pattern id="race-replay-grid" height="42" patternUnits="userSpaceOnUse" width="42">
                <path d="M 42 0 L 0 0 0 42" fill="none" stroke="var(--race-replay-grid)" strokeWidth="1" />
              </pattern>
              <pattern id="race-replay-checker" height="7" patternUnits="userSpaceOnUse" width="7">
                <rect fill="#f5f7fa" height="7" width="7" />
                <rect fill="#101113" height="3.5" width="3.5" />
                <rect fill="#101113" height="3.5" width="3.5" x="3.5" y="3.5" />
              </pattern>
              <filter id="race-replay-track-shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="10" floodColor="rgba(0,0,0,0.55)" stdDeviation="12" />
              </filter>
              <filter id="race-replay-glow">
                <feGaussianBlur result="coloredBlur" stdDeviation="2.4" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <rect fill="url(#race-replay-grid)" height={viewBox.height} width={viewBox.width} x="0" y="0" />
            {geometry ? (
              <TrackSurface
                debug={debug}
                geometry={geometry}
                pitGeometry={pitGeometry}
                technicalPathD={replay.track.svg.technicalPathD}
              />
            ) : (
              <path
                d={replay.track.svg.visualPathD}
                fill="none"
                stroke="var(--race-replay-track-core)"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="24"
              />
            )}
            {[...currentPositions.values()]
              .filter((position) => !position.isStale && position.trailD)
              .map((position) => {
                const driver = replay.drivers.find((item) => item.driverNumber === position.driverNumber);

                return (
                  <path
                    d={position.trailD ?? ""}
                    fill="none"
                    key={`trail-${position.driverNumber}`}
                    opacity="0.32"
                    stroke={driver?.teamColor ?? "hsl(var(--primary))"}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="3.4"
                  />
                );
              })}
            {[...currentPositions.values()].filter((position) => !position.isStale).map((position) => {
              const driver = replay.drivers.find((item) => item.driverNumber === position.driverNumber);

              return (
                <CarMarker
                  abbreviation={driver?.abbreviation ?? String(position.driverNumber)}
                  fullName={driver?.fullName ?? String(position.driverNumber)}
                  isSelected={selectedDriver === position.driverNumber}
                  key={position.driverNumber}
                  onSelect={() => setSelectedDriver(position.driverNumber)}
                  position={position}
                  teamColor={driver?.teamColor ?? "hsl(var(--primary))"}
                />
              );
            })}
          </svg>
        </div>
          <div className="border-t stitch-divider p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={handlePlayPause}
                type="button"
              >
                {isPlaying ? <Pause aria-hidden="true" data-icon="inline-start" /> : <Play aria-hidden="true" data-icon="inline-start" />}
                {isPlaying ? "Пауза" : "Запустить"}
              </Button>
              <div className="flex rounded-md border border-border bg-secondary/45 p-1">
                {speeds.map((item) => (
                  <button
                    className={cn(
                      "font-telemetry rounded px-3 py-1.5 text-xs font-bold transition-colors",
                      speed === item ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                    key={item}
                    onClick={() => setSpeed(item)}
                    type="button"
                  >
                    {item}x
                  </button>
                ))}
              </div>
              <p className="hidden text-[0.62rem] font-semibold text-muted-foreground lg:block">
                Пробел — пауза · ← / → — 15 сек
              </p>
              <span className="font-telemetry ml-auto text-xs font-bold text-muted-foreground">
                {formatClock(elapsedMs)} / {formatClock(duration)}
              </span>
            </div>
            <ReplayTimeline
              duration={duration}
              elapsedMs={elapsedMs}
              markers={timelineMarkers}
              onJump={seekTo}
              onScrub={(value) => {
                setElapsedMs(value);
                setIsPlaying(false);
              }}
            />
          </div>
        </section>

        <TimingTowerCompact
          currentLap={currentLap}
          highlights={timingHighlights}
          rows={timingRows}
          selectedDriver={selectedDriver}
          setSelectedDriver={setSelectedDriver}
          totalLaps={replay.totalLaps}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <RaceEventFeed events={visibleEvents} onSeek={seekTo} />
        <PitStopsPanel items={pitHistory} />
        <PacePanel lapAnalytics={lapAnalytics} tyrePace={tyrePace} weather={replay.weather} />
      </div>

      <TimingTower
        highlights={timingHighlights}
        rows={timingRows}
        selectedDriver={selectedDriver}
        setSelectedDriver={setSelectedDriver}
      />
    </div>
  );
}

function SelectedDriverOverlay({ driver, followMode }: { driver: TimingRow | null; followMode: boolean }) {
  return (
    <div className="pointer-events-none absolute bottom-5 left-5 z-10 min-w-[14.5rem] max-w-[18rem] rounded-md border border-border/70 bg-background/92 px-3.5 py-2.5 shadow-xl ring-1 ring-primary/25 backdrop-blur-md">
      {driver ? (
        <>
          <div className="flex items-center gap-3">
            <span
              className="h-10 w-1.5 rounded-full"
              style={{ backgroundColor: driver.teamColor }}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-display text-2xl font-extrabold leading-none">{driver.abbreviation}</p>
                <span className="font-telemetry rounded border border-border/70 px-1.5 py-0.5 text-[0.58rem] font-extrabold">
                  P{driver.position ?? "—"}
                </span>
                {followMode ? (
                  <span className="font-telemetry rounded border border-primary/45 bg-primary/12 px-1.5 py-0.5 text-[0.52rem] font-extrabold uppercase tracking-[0.08em] text-primary">
                    Камера
                  </span>
                ) : null}
              </div>
              <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">{driver.teamName}</p>
            </div>
            <div className="ml-auto grid justify-items-end gap-1">
              <TyreBadge compound={driver.compound} tyreAge={driver.tyreAge} />
              <p className="font-telemetry text-[0.65rem] font-bold text-muted-foreground">
                {driver.status === "PIT" ? "Пит" : driver.status === "OUT" ? "Сход" : formatTimingInterval(driver)}
              </p>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 border-t border-border/60 pt-2">
            <div>
              <p className="stitch-label text-[0.48rem] text-muted-foreground">Посл. круг</p>
              <p className="font-telemetry mt-0.5 text-[0.68rem] font-extrabold">{driver.lastLapTime ?? "—"}</p>
            </div>
            <div>
              <p className="stitch-label text-[0.48rem] text-muted-foreground">Лучший</p>
              <p className="font-telemetry mt-0.5 text-[0.68rem] font-extrabold">{driver.bestLapTime ?? "—"}</p>
            </div>
            <div>
              <p className="stitch-label text-[0.48rem] text-muted-foreground">Питы</p>
              <p className="font-telemetry mt-0.5 text-[0.68rem] font-extrabold">{driver.pitStops}</p>
            </div>
          </div>
        </>
      ) : (
        <p className="text-xs font-semibold text-muted-foreground">Выбери машину на карте или в тайминге</p>
      )}
    </div>
  );
}

function WeatherChips({ weather }: { weather: RaceReplaySnapshot["weather"] }) {
  if (!weather) {
    return null;
  }

  const items = [
    { label: "Воздух", value: formatMaybeNumber(weather.airTemperatureC, "°C") },
    { label: "Трасса", value: formatMaybeNumber(weather.trackTemperatureC, "°C") },
    { label: "Дождь", value: formatMaybeNumber(weather.rainfall, " мм") },
    { label: "Ветер", value: formatMaybeNumber(weather.windSpeedKmh, " км/ч") },
  ];

  return (
    <div className="hidden grid-cols-2 gap-x-4 gap-y-1 rounded-md border border-border/70 bg-secondary/30 px-3.5 py-2 sm:grid">
      {items.map((item) => (
        <div className="flex items-baseline justify-between gap-2" key={item.label}>
          <span className="text-[0.6rem] font-semibold text-muted-foreground">{item.label}</span>
          <span className="font-telemetry text-[0.68rem] font-extrabold">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function TrackSurface({
  debug,
  geometry,
  pitGeometry,
  technicalPathD,
}: {
  debug: boolean;
  geometry: TrackGeometry;
  pitGeometry: PitGeometry | null;
  technicalPathD: string;
}) {
  const startAngle = ((geometry.startFinish.headingRad * 180) / Math.PI).toFixed(2);

  return (
    <g>
      <path
        d={geometry.pathD}
        fill="none"
        filter="url(#race-replay-track-shadow)"
        stroke="var(--race-replay-track-aura)"
        strokeLinejoin="round"
        strokeWidth={TRACK_WIDTH + 22}
      />
      {geometry.sectorPaths.map((sector) => (
        <path
          d={sector.pathD}
          fill="none"
          key={sector.label}
          stroke={sector.color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={TRACK_WIDTH + 16}
        />
      ))}
      {pitGeometry ? (
        <g>
          <path
            d={pitGeometry.pathD}
            fill="none"
            stroke="var(--race-replay-track-outer)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="15"
          />
          <path
            d={pitGeometry.pathD}
            fill="none"
            stroke="var(--race-replay-track-core)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="10"
          />
          <path
            d={pitGeometry.pathD}
            fill="none"
            stroke="var(--race-replay-track-edge)"
            strokeDasharray="5 6"
            strokeLinecap="round"
            strokeWidth="1.1"
          />
          <text
            fill="var(--race-replay-track-label)"
            fontSize="8.5"
            fontWeight="800"
            textAnchor="middle"
            x={pitGeometry.label.x}
            y={pitGeometry.label.y}
          >
            PIT
          </text>
        </g>
      ) : null}
      <path
        d={geometry.pathD}
        fill="none"
        stroke="var(--race-replay-track-outer)"
        strokeLinejoin="round"
        strokeWidth={TRACK_WIDTH + 7}
      />
      <path
        d={geometry.pathD}
        fill="none"
        stroke="var(--race-replay-track-core)"
        strokeLinejoin="round"
        strokeWidth={TRACK_WIDTH}
      />
      <path
        d={geometry.edgeLeftD}
        fill="none"
        opacity="0.75"
        stroke="var(--race-replay-track-edge)"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path
        d={geometry.edgeRightD}
        fill="none"
        opacity="0.75"
        stroke="var(--race-replay-track-edge)"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      {geometry.corners.map((corner) => (
        <g key={corner.number}>
          <path d={corner.kerbPathD} fill="none" stroke="#f5f7fa" strokeLinecap="round" strokeWidth="4.6" />
          <path
            d={corner.kerbPathD}
            fill="none"
            stroke="#e10600"
            strokeDasharray="7 7"
            strokeLinecap="round"
            strokeWidth="4.6"
          />
          <text
            fill="var(--race-replay-track-label)"
            fontSize="10.5"
            fontWeight="800"
            textAnchor="middle"
            x={corner.labelX}
            y={corner.labelY + 3.5}
          >
            T{corner.number}
          </text>
        </g>
      ))}
      <g transform={`translate(${geometry.startFinish.x} ${geometry.startFinish.y})`}>
        <g transform={`rotate(${startAngle})`}>
          <rect
            fill="url(#race-replay-checker)"
            height={TRACK_WIDTH + 6}
            rx="1.5"
            stroke="rgba(0,0,0,0.4)"
            strokeWidth="0.8"
            width="9"
            x="-4.5"
            y={-(TRACK_WIDTH + 6) / 2}
          />
        </g>
        <text
          fill="var(--race-replay-track-label)"
          fontSize="9"
          fontWeight="900"
          textAnchor="middle"
          y={-(TRACK_WIDTH / 2) - 12}
        >
          СТАРТ / ФИНИШ
        </text>
      </g>
      {debug ? (
        <path d={technicalPathD} fill="none" stroke="hsl(var(--success))" strokeDasharray="2 4" strokeWidth="1" />
      ) : null}
    </g>
  );
}

function CarMarker({
  abbreviation,
  fullName,
  isSelected,
  onSelect,
  position,
  teamColor,
}: {
  abbreviation: string;
  fullName: string;
  isSelected: boolean;
  onSelect: () => void;
  position: CurrentReplayPosition;
  teamColor: string;
}) {
  const angle = (position.headingRad * 180) / Math.PI;

  return (
    <g
      aria-label={`Выбрать пилота ${fullName}`}
      className="cursor-pointer outline-none"
      filter={isSelected ? "url(#race-replay-glow)" : undefined}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
      transform={`translate(${position.svgX.toFixed(2)} ${position.svgY.toFixed(2)})`}
    >
      <circle fill="transparent" r="17" />
      <g transform={`rotate(${angle.toFixed(2)})${isSelected ? " scale(1.22)" : ""}`}>
        {isSelected ? (
          <circle fill="none" opacity="0.85" r="13.5" stroke={teamColor} strokeDasharray="3 3" strokeWidth="1.2" />
        ) : null}
        <rect fill={teamColor} height="8.6" opacity="0.95" rx="1.1" width="2.6" x="-11" y="-4.3" />
        <rect
          fill={teamColor}
          height="6.6"
          rx="3.2"
          stroke={position.isPitLane ? "var(--race-replay-pit-marker)" : "var(--race-replay-marker-stroke)"}
          strokeWidth={position.isPitLane ? 1.9 : 1.4}
          width="19"
          x="-9.5"
          y="-3.3"
        />
        <rect
          fill={teamColor}
          height="9.2"
          rx="1.1"
          stroke="var(--race-replay-marker-stroke)"
          strokeWidth="0.7"
          width="2.4"
          x="7.8"
          y="-4.6"
        />
        <circle cx="1.2" fill="rgba(8,8,10,0.72)" r="1.7" />
      </g>
      <text
        fill="var(--race-replay-track-label)"
        fontSize={isSelected ? "6.6" : "5.6"}
        fontWeight="900"
        paintOrder="stroke"
        stroke="rgba(0,0,0,0.7)"
        strokeWidth="1.6"
        textAnchor="middle"
        y={isSelected ? -15 : -12.5}
      >
        {abbreviation}
      </text>
    </g>
  );
}

function TrackLegend() {
  const items = [
    { color: "var(--race-replay-sector-1)", label: "С1" },
    { color: "var(--race-replay-sector-2)", label: "С2" },
    { color: "var(--race-replay-sector-3)", label: "С3" },
  ];

  return (
    <div className="pointer-events-none absolute bottom-5 right-5 z-10 hidden items-center gap-2.5 rounded-md border border-border/70 bg-background/85 px-2.5 py-1.5 shadow-xl backdrop-blur-md sm:flex">
      {items.map((item) => (
        <span className="flex items-center gap-1" key={item.label}>
          <span className="h-1.5 w-4 rounded-full" style={{ backgroundColor: item.color }} />
          <span className="font-telemetry text-[0.55rem] font-extrabold text-muted-foreground">{item.label}</span>
        </span>
      ))}
      <span className="flex items-center gap-1">
        <span className="h-1.5 w-4 rounded-full bg-[var(--race-replay-track-edge)]" />
        <span className="font-telemetry text-[0.55rem] font-extrabold text-muted-foreground">Пит-лейн</span>
      </span>
    </div>
  );
}

function RetiredDriversPanel({
  rows,
  setSelectedDriver,
}: {
  rows: TimingRow[];
  setSelectedDriver: (driver: number) => void;
}) {
  if (!rows.length) {
    return null;
  }

  return (
    <div className="absolute left-5 top-5 z-10 w-[13rem] rounded-md border border-border/70 bg-background/88 p-2 shadow-xl backdrop-blur-md sm:w-[15rem]">
      <p className="stitch-label text-[0.55rem] text-muted-foreground">Сходы</p>
      <div className="mt-2 grid max-h-[9rem] grid-cols-2 gap-1 overflow-y-auto pr-1">
        {rows.map((row) => (
          <button
            className="flex min-w-0 items-center justify-between gap-1.5 rounded border border-border/50 bg-secondary/30 px-1.5 py-1 text-left transition-colors hover:bg-accent/60"
            key={row.driverNumber}
            onClick={() => setSelectedDriver(row.driverNumber)}
            type="button"
          >
            <span className="flex min-w-0 items-center gap-1">
              <span className="size-1.5 rounded-full" style={{ backgroundColor: row.teamColor }} />
              <span className="font-telemetry text-[0.66rem] font-extrabold">{row.abbreviation}</span>
            </span>
            <span className="font-telemetry text-[0.5rem] font-bold text-primary">OUT</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PitNotificationStack({ items }: { items: PitNotification[] }) {
  if (!items.length) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute left-5 top-1/2 z-10 grid w-[13.5rem] -translate-y-1/2 grid-cols-2 gap-1">
      {items.map((item) => (
        <div
          className={cn(
            "min-w-0 rounded border px-1.5 py-1 shadow-xl backdrop-blur-md",
            item.phase === "active"
              ? "border-amber-300/55 bg-[rgba(30,20,8,0.9)]"
              : "border-border/70 bg-background/88",
          )}
          key={`${item.driverNumber}-${item.startMs}`}
        >
          <p className={cn(
            "font-telemetry text-[0.46rem] font-extrabold uppercase tracking-[0.08em]",
            item.phase === "active" ? "text-amber-200" : "text-muted-foreground",
          )}>
            {item.phase === "active" ? "Пит" : "Готово"}
          </p>
          <div className="mt-0.5 flex items-center justify-between gap-1">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="h-3.5 w-1 rounded-full" style={{ backgroundColor: item.teamColor }} />
              <span className="font-telemetry text-[0.68rem] font-extrabold leading-none">{item.abbreviation}</span>
            </span>
            <span className={cn(
              "whitespace-nowrap font-telemetry text-[0.58rem] font-extrabold",
              item.phase === "active" ? "text-amber-100" : "text-foreground",
            )}>
              {item.pitLaneSeconds.toFixed(1)}с
              {item.phase === "done" ? (
                <span className="ml-0.5 text-[0.5rem] text-muted-foreground">
                  ({item.pitStopSeconds !== null ? `${item.pitStopSeconds.toFixed(1)}с` : "—"})
                </span>
              ) : null}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function PacePanel({
  lapAnalytics,
  tyrePace,
  weather,
}: {
  lapAnalytics: LapAnalytics;
  tyrePace: TyrePaceSummary[];
  weather: RaceReplaySnapshot["weather"];
}) {
  return (
    <section className="stitch-panel p-4">
      <p className="stitch-label flex items-center gap-2 text-muted-foreground">
        <Activity aria-hidden="true" className="size-3.5 text-primary" />
        Темп и условия
      </p>
      <div className="mt-3 grid gap-3">
        <div className="rounded-md border border-border/70 p-2.5">
          <p className="stitch-label text-[0.52rem] text-muted-foreground">Темп круга</p>
          <LapAnalyticsLine label="Лучший в гонке" row={lapAnalytics.bestRaceLap} />
          <LapAnalyticsLine label="Лучший последний" row={lapAnalytics.bestRecentLap} />
        </div>
        <div className="rounded-md border border-border/70 p-2.5">
          <p className="stitch-label text-[0.52rem] text-muted-foreground">Темп шин · последний круг</p>
          {tyrePace.length ? (
            <div className="mt-1.5 grid gap-1">
              {tyrePace.map((item) => (
                <div className="flex items-center justify-between gap-2 text-[0.72rem]" key={item.compound}>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <TyreDot compound={item.compound} />
                    <span className="font-semibold text-muted-foreground">{item.count} пил.</span>
                  </span>
                  <span className="font-telemetry font-extrabold">{formatLapSeconds(item.averageLapSeconds)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-1.5 font-telemetry text-[0.68rem] font-bold text-muted-foreground">—</p>
          )}
        </div>
        {weather ? (
          <div className="rounded-md border border-border/70 p-2.5">
            <p className="stitch-label flex items-center gap-1.5 text-[0.52rem] text-muted-foreground">
              <CloudSun aria-hidden="true" className="size-3" />
              Погода
            </p>
            <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-[0.72rem]">
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-muted-foreground">Воздух</span>
                <span className="font-telemetry font-extrabold">{formatMaybeNumber(weather.airTemperatureC, "°C")}</span>
              </span>
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-muted-foreground">Трасса</span>
                <span className="font-telemetry font-extrabold">{formatMaybeNumber(weather.trackTemperatureC, "°C")}</span>
              </span>
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-muted-foreground">Дождь</span>
                <span className="font-telemetry font-extrabold">{formatMaybeNumber(weather.rainfall, " мм")}</span>
              </span>
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-muted-foreground">Ветер</span>
                <span className="font-telemetry font-extrabold">{formatMaybeNumber(weather.windSpeedKmh, " км/ч")}</span>
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function LapAnalyticsLine({ label, row }: { label: string; row: LapAnalyticsRow | null }) {
  return (
    <div className="mt-1.5 flex items-center justify-between gap-2">
      <span className="text-[0.66rem] font-semibold text-muted-foreground">{label}</span>
      {row ? (
        <span className="flex min-w-0 items-center justify-end gap-1.5">
          <span className="size-1.5 rounded-full" style={{ backgroundColor: row.teamColor }} />
          <span className="font-telemetry text-[0.68rem] font-extrabold">{row.abbreviation}</span>
          <TyreDot compound={row.compound} />
          <span className="font-telemetry text-[0.68rem] font-extrabold">{row.lapTime ?? formatLapSeconds(row.lapTimeSeconds)}</span>
        </span>
      ) : (
        <span className="font-telemetry text-[0.68rem] font-bold text-muted-foreground">—</span>
      )}
    </div>
  );
}

function TyreDot({ compound }: { compound: string | null | undefined }) {
  const visual = getTyreVisual(compound);

  return (
    <span
      aria-label={visual.label}
      className="grid size-4 shrink-0 place-items-center rounded-full border text-[0.5rem] font-black leading-none"
      style={{
        backgroundColor: visual.background,
        borderColor: visual.border,
        color: visual.color,
      }}
      title={visual.label}
    >
      {visual.letter}
    </span>
  );
}

function TimingTowerCompact({
  currentLap,
  highlights,
  rows,
  selectedDriver,
  setSelectedDriver,
  totalLaps,
}: {
  currentLap: number | null;
  highlights: TimingHighlights;
  rows: TimingRow[];
  selectedDriver: number | null;
  setSelectedDriver: (driver: number) => void;
  totalLaps: number | null;
}) {
  const lapProgress = totalLaps && currentLap ? clamp(currentLap / totalLaps, 0, 1) : 0;

  return (
    <section className="stitch-panel flex min-h-0 flex-col overflow-hidden p-0">
      <div className="border-b stitch-divider p-3.5">
        <div className="flex items-center justify-between gap-3">
          <p className="stitch-label flex items-center gap-2 text-muted-foreground">
            <Timer aria-hidden="true" className="size-3.5 text-primary" />
            Live-тайминг
          </p>
          <p className="font-telemetry text-xs font-extrabold">
            Круг {currentLap ?? "—"}
            {totalLaps ? <span className="text-muted-foreground"> / {totalLaps}</span> : null}
          </p>
        </div>
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-secondary/60">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${(lapProgress * 100).toFixed(2)}%` }}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto xl:max-h-none">
        {rows.map((row, index) => {
          const isSelected = selectedDriver === row.driverNumber;
          const hasBestLap = isSameTimingValue(parseTimingMs(row.bestLapTime), highlights.bestLapMs);

          return (
            <button
              className={cn(
                "flex w-full items-center gap-2 border-b stitch-divider px-3 py-1.5 text-left transition-colors hover:bg-accent/60",
                isSelected && "bg-primary/10",
                row.status === "OUT" && "opacity-60",
              )}
              key={row.driverNumber}
              onClick={() => setSelectedDriver(row.driverNumber)}
              type="button"
            >
              <span className="font-telemetry w-6 shrink-0 text-right text-xs font-extrabold text-muted-foreground">
                {row.position ?? index + 1}
              </span>
              <span className="h-5 w-1 shrink-0 rounded-full" style={{ backgroundColor: row.teamColor }} />
              <span className="font-telemetry w-11 shrink-0 text-sm font-extrabold">{row.abbreviation}</span>
              <TyreDot compound={row.compound} />
              <span className="font-telemetry w-6 shrink-0 text-[0.62rem] font-bold text-muted-foreground">
                {typeof row.tyreAge === "number" && Number.isFinite(row.tyreAge) ? row.tyreAge : ""}
              </span>
              <span className="min-w-0 flex-1" />
              {hasBestLap ? (
                <span aria-label="Лучший круг гонки" className="size-1.5 shrink-0 rounded-full bg-[#c084fc]" title="Лучший круг гонки" />
              ) : null}
              <span
                className={cn(
                  "font-telemetry shrink-0 text-xs font-bold",
                  row.status === "OUT" ? "text-primary" : row.status === "PIT" ? "text-amber-400" : "text-muted-foreground",
                )}
              >
                {formatTimingInterval(row)}
              </span>
            </button>
          );
        })}
      </div>
      <p className="border-t stitch-divider px-3.5 py-2 text-[0.6rem] font-semibold text-muted-foreground">
        Клик по строке — выбрать пилота на карте
      </p>
    </section>
  );
}

function ReplayTimeline({
  duration,
  elapsedMs,
  markers,
  onJump,
  onScrub,
}: {
  duration: number;
  elapsedMs: number;
  markers: TimelineMarker[];
  onJump: (offsetMs: number) => void;
  onScrub: (offsetMs: number) => void;
}) {
  const markerTone = {
    neutral: "bg-foreground/70",
    red: "bg-[#E10600]",
    yellow: "bg-[#FFD60A]",
  };

  return (
    <div className="relative mt-5 pt-3.5">
      {markers.map((marker) => (
        <button
          aria-label={`${marker.label} — ${formatClock(marker.offsetMs)}`}
          className="absolute top-0 z-10 -translate-x-1/2 p-0.5"
          key={`${marker.offsetMs}-${marker.label}`}
          onClick={() => onJump(marker.offsetMs)}
          style={{ left: `${(clamp(marker.offsetMs / duration, 0, 1) * 100).toFixed(3)}%` }}
          title={`${formatClock(marker.offsetMs)} · ${marker.label}`}
          type="button"
        >
          <span className={cn("block h-2.5 w-1 rounded-sm transition-transform hover:scale-125", markerTone[marker.tone])} />
        </button>
      ))}
      <input
        aria-label="Позиция повтора"
        className="h-2 w-full accent-primary"
        max={duration}
        min={0}
        onChange={(event) => onScrub(Number(event.target.value))}
        type="range"
        value={Math.round(elapsedMs)}
      />
    </div>
  );
}

function PitStopsPanel({ items }: { items: PitHistoryItem[] }) {
  return (
    <section className="stitch-panel p-4">
      <p className="stitch-label flex items-center gap-2 text-muted-foreground">
        <Wrench aria-hidden="true" className="size-3.5 text-primary" />
        Пит-стопы · {items.length}
      </p>
      <div className="mt-3 grid gap-1.5">
        {items.length ? items.slice(0, 8).map((item) => (
          <div
            className={cn(
              "flex items-center gap-2 rounded-md border px-2.5 py-1.5",
              item.isActive ? "border-amber-300/55 bg-amber-400/10" : "border-border/70",
            )}
            key={`${item.driverNumber}-${item.startMs}`}
          >
            <span className="h-4 w-1 shrink-0 rounded-full" style={{ backgroundColor: item.teamColor }} />
            <span className="font-telemetry w-11 shrink-0 text-xs font-extrabold">{item.abbreviation}</span>
            <span className="font-telemetry shrink-0 text-[0.62rem] font-bold text-muted-foreground">
              {formatClock(item.startMs)}
            </span>
            <span className="min-w-0 flex-1" />
            {item.isActive ? (
              <span className="font-telemetry shrink-0 text-xs font-extrabold text-amber-300">
                {item.pitLaneSeconds.toFixed(1)}с…
              </span>
            ) : (
              <span className="font-telemetry shrink-0 text-xs font-bold">
                {item.pitLaneSeconds.toFixed(1)}с
                <span className="ml-1 text-[0.62rem] text-muted-foreground">
                  ({item.pitStopSeconds !== null ? `${item.pitStopSeconds.toFixed(1)}с` : "—"})
                </span>
              </span>
            )}
          </div>
        )) : (
          <p className="text-sm leading-6 text-muted-foreground">Пит-стопов пока не было.</p>
        )}
      </div>
      {items.length ? (
        <p className="mt-2 text-[0.6rem] font-semibold text-muted-foreground">Время в пит-лейне (в скобках — сам пит-стоп)</p>
      ) : null}
    </section>
  );
}

function TimingTower({
  highlights,
  rows,
  selectedDriver,
  setSelectedDriver,
}: {
  highlights: TimingHighlights;
  rows: TimingRow[];
  selectedDriver: number | null;
  setSelectedDriver: (driver: number) => void;
}) {
  return (
    <section className="stitch-panel overflow-hidden p-0">
      <div className="flex items-center justify-between gap-3 border-b stitch-divider p-4">
        <div>
          <p className="stitch-label text-muted-foreground">Тайминг</p>
          <h3 className="mt-1 font-display text-xl font-bold">Детальная таблица: сектора и темп</h3>
        </div>
        <Timer aria-hidden="true" className="size-5 text-primary" />
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[68rem]">
          <div className="grid grid-cols-[2.6rem_minmax(12rem,1.35fr)_5.6rem_5.8rem_5.6rem_3.3rem_5.4rem_4.4rem_4.4rem_4.4rem_5.4rem] gap-2 border-b stitch-divider px-4 py-2 font-telemetry text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">
            <span>Поз</span>
            <span>Пилот</span>
            <span>Шины</span>
            <span>Лучший</span>
            <span>Интервал</span>
            <span>Питы</span>
            <span>Посл.</span>
            <span>S1</span>
            <span>S2</span>
            <span>S3</span>
            <span>Темп</span>
          </div>
          <div>
        {rows.map((row) => (
          <button
            className={cn(
              "grid w-full grid-cols-[2.6rem_minmax(12rem,1.35fr)_5.6rem_5.8rem_5.6rem_3.3rem_5.4rem_4.4rem_4.4rem_4.4rem_5.4rem] items-center gap-2 border-b stitch-divider px-4 py-2 text-left transition-colors hover:bg-accent/60",
              selectedDriver === row.driverNumber && "bg-primary/10",
            )}
            key={row.driverNumber}
            onClick={() => setSelectedDriver(row.driverNumber)}
            type="button"
          >
            <span className="font-telemetry text-sm font-extrabold">P{row.position ?? "—"}</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{row.fullName}</span>
              <span className="block truncate text-xs text-muted-foreground">{row.teamName}</span>
            </span>
            <TyreBadge compound={row.compound} tyreAge={row.tyreAge} />
            <span className={cn(
              "font-telemetry text-xs font-bold text-muted-foreground",
              isSameTimingValue(parseTimingMs(row.bestLapTime), highlights.bestLapMs) && "text-[#c084fc]",
            )}>
              {row.bestLapTime ?? "—"}
            </span>
            <span className={cn(
              "truncate font-telemetry text-xs",
              row.status === "OUT" ? "text-primary" : row.status === "PIT" ? "text-amber-400" : "text-muted-foreground",
            )}>
              {formatTimingInterval(row)}
            </span>
            <span className="font-telemetry text-xs font-bold text-muted-foreground">{row.pitStops}</span>
            <span className={cn(
              "font-telemetry text-xs font-bold",
              isSameTimingValue(parseTimingMs(row.lastLapTime), highlights.bestLapMs) && "text-[#c084fc]",
            )}>
              {row.lastLapTime ?? "—"}
            </span>
            <span className={cn(
              "font-telemetry text-xs text-muted-foreground",
              isSameTimingValue(parseTimingMs(row.sector1Time), highlights.bestSectorMs[0]) && "font-extrabold text-[#c084fc]",
            )}>
              {row.sector1Time ?? "—"}
            </span>
            <span className={cn(
              "font-telemetry text-xs text-muted-foreground",
              isSameTimingValue(parseTimingMs(row.sector2Time), highlights.bestSectorMs[1]) && "font-extrabold text-[#c084fc]",
            )}>
              {row.sector2Time ?? "—"}
            </span>
            <span className={cn(
              "font-telemetry text-xs text-muted-foreground",
              isSameTimingValue(parseTimingMs(row.sector3Time), highlights.bestSectorMs[2]) && "font-extrabold text-[#c084fc]",
            )}>
              {row.sector3Time ?? "—"}
            </span>
            <LapDelta rows={rows} row={row} />
          </button>
        ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function getTimingHighlights(rows: TimingRow[]): TimingHighlights {
  return {
    bestLapMs: minTimingMs(rows.map((row) => parseTimingMs(row.bestLapTime))),
    bestSectorMs: [
      minTimingMs(rows.map((row) => parseTimingMs(row.sector1Time))),
      minTimingMs(rows.map((row) => parseTimingMs(row.sector2Time))),
      minTimingMs(rows.map((row) => parseTimingMs(row.sector3Time))),
    ],
  };
}

function minTimingMs(values: Array<number | null>) {
  const finiteValues = values.filter((value): value is number => (
    typeof value === "number" && Number.isFinite(value) && value > 0
  ));

  return finiteValues.length ? Math.min(...finiteValues) : null;
}

function parseTimingMs(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const match = value.replace(",", ".").match(/(?:(\d+):)?(\d{1,2}(?:\.\d+)?)/);

  if (!match) {
    return null;
  }

  const minutes = match[1] ? Number(match[1]) : 0;
  const seconds = Number(match[2]);

  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null;
  }

  return minutes * 60_000 + seconds * 1000;
}

function isSameTimingValue(value: number | null, bestValue: number | null) {
  return value !== null && bestValue !== null && Math.abs(value - bestValue) <= 2;
}

function formatTimingInterval(row: TimingRow) {
  if (row.status === "OUT") {
    return "OUT";
  }

  if (row.status === "PIT") {
    return "PIT";
  }

  if (row.lapDeficit && row.lapDeficit > 0) {
    return `+${row.lapDeficit} ${getLapWord(row.lapDeficit)}`;
  }

  return row.intervalToAhead ?? row.gapToLeader ?? "—";
}

function LapDelta({ row, rows }: { row: TimingRow; rows: TimingRow[] }) {
  const index = rows.findIndex((item) => item.driverNumber === row.driverNumber);
  const ahead = index > 0 ? rows[index - 1] : null;
  const delta =
    typeof ahead?.lastLapDuration === "number" && Number.isFinite(ahead.lastLapDuration) &&
    typeof row.lastLapDuration === "number" && Number.isFinite(row.lastLapDuration)
      ? row.lastLapDuration - ahead.lastLapDuration
      : null;

  if (delta === null) {
    return <span className="font-telemetry text-xs text-muted-foreground">—</span>;
  }

  return (
    <span className={cn(
      "font-telemetry text-xs font-extrabold",
      delta <= 0 ? "text-[rgb(57,255,20)]" : "text-primary",
    )}>
      {delta <= 0 ? "-" : "+"}{Math.abs(delta).toFixed(3)}
    </span>
  );
}

function TyreBadge({ compound, tyreAge }: { compound: string | null | undefined; tyreAge?: number | null }) {
  const visual = getTyreVisual(compound);
  const age = typeof tyreAge === "number" && Number.isFinite(tyreAge) ? tyreAge : null;

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-label={visual.label}
        className="grid size-6 place-items-center rounded-full border text-[0.62rem] font-black leading-none"
        style={{
          backgroundColor: visual.background,
          borderColor: visual.border,
          color: visual.color,
        }}
        title={visual.label}
      >
        {visual.letter}
      </span>
      <span className="font-telemetry text-[0.68rem] font-bold text-muted-foreground">
        {age !== null ? `(${age})` : ""}
      </span>
    </span>
  );
}

function RaceEventFeed({ events, onSeek }: { events: ReplayRaceEvent[]; onSeek: (offsetMs: number) => void }) {
  return (
    <section className="stitch-panel p-4">
      <p className="stitch-label flex items-center gap-2 text-muted-foreground">
        <Flag aria-hidden="true" className="size-3.5 text-primary" />
        Контроль гонки · {events.length}
      </p>
      <div className="mt-3 grid max-h-[24rem] content-start gap-1.5 overflow-y-auto pr-1">
        {events.length ? events.map((event) => (
          <button
            className="rounded-md border border-border/70 p-2.5 text-left transition-colors hover:bg-accent/60"
            key={`${event.offsetMs}-${event.message}`}
            onClick={() => onSeek(event.offsetMs)}
            title="Перейти к этому моменту повтора"
            type="button"
          >
            <p className="flex items-center gap-2">
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  event.severity === "CRITICAL" ? "bg-[#E10600]" : event.severity === "IMPORTANT" ? "bg-[#FFD60A]" : "bg-muted-foreground/60",
                )}
              />
              <span className="font-telemetry text-xs font-bold text-primary">{formatClock(event.offsetMs)}</span>
              {typeof event.lapNumber === "number" ? (
                <span className="font-telemetry text-[0.62rem] font-bold text-muted-foreground">круг {event.lapNumber}</span>
              ) : null}
            </p>
            <p className="mt-1 text-sm leading-5">{event.message}</p>
          </button>
        )) : (
          <p className="text-sm leading-6 text-muted-foreground">События появятся по ходу повтора.</p>
        )}
      </div>
      {events.length ? (
        <p className="mt-2 text-[0.6rem] font-semibold text-muted-foreground">
          Клик по событию — перейти к моменту · список листается
        </p>
      ) : null}
    </section>
  );
}

function RaceStatusBanner({ status }: { status: RaceStatus }) {
  const toneClass = {
    green: "border-[rgba(57,255,20,0.4)] bg-[rgba(57,255,20,0.1)] text-[rgb(97,255,75)]",
    neutral: "border-border/70 bg-secondary/30 text-foreground",
    red: "border-[rgba(225,6,0,0.6)] bg-[rgba(225,6,0,0.16)] text-primary",
    yellow: "border-[rgba(255,214,10,0.55)] bg-[rgba(255,214,10,0.14)] text-[rgb(255,214,10)]",
  }[status.tone];

  return (
    <div className={cn("flex items-center gap-2.5 border-t px-4 py-2 sm:px-5", toneClass)}>
      {status.tone === "green" ? (
        <Flag aria-hidden="true" className="size-4 shrink-0" />
      ) : (
        <ShieldAlert
          aria-hidden="true"
          className={cn("size-4 shrink-0", (status.tone === "yellow" || status.tone === "red") && "animate-pulse")}
        />
      )}
      <p className="font-telemetry shrink-0 text-[0.62rem] font-extrabold uppercase tracking-[0.14em]">{status.label}</p>
      <p className="min-w-0 truncate text-xs font-semibold leading-4 text-foreground">{status.detail}</p>
    </div>
  );
}

/*
 * Пит-лейн в жизни всегда обрамляет линию старт/финиш. Если «ноль»
 * параметризации трассы из снапшота лежит далеко от реального пит-лейна
 * (такое бывает, когда телеметрия сессии начинается не на линии), ставим
 * стартовую отметку в середину пит-лейна.
 */
function deriveStartFinishProgress(
  pitSpan: { startProgress: number; endProgress: number } | null,
  fallback: number,
) {
  if (!pitSpan) {
    return fallback;
  }

  const start = ((pitSpan.startProgress % 1) + 1) % 1;
  const span = pitSpan.endProgress - pitSpan.startProgress;
  const relative = ((fallback - start) % 1 + 1) % 1;

  if (relative <= span + 0.06 || relative >= 1 - 0.06) {
    return fallback;
  }

  return ((start + span / 2) % 1 + 1) % 1;
}

function groupReplayPositionsByDriver(events: ReplayPositionEvent[]) {
  const grouped = new Map<number, ReplayPositionEvent[]>();

  for (const event of events) {
    const driverEvents = grouped.get(event.driverNumber) ?? [];
    driverEvents.push(event);
    grouped.set(event.driverNumber, driverEvents);
  }

  return grouped;
}

function getCurrentPositions(
  motionByDriver: Map<number, DriverMotion>,
  elapsedMs: number,
  geometry: TrackGeometry | null,
  pitWindows: PitWindow[],
  pitGeometry: PitGeometry | null,
  lateralOffsets: Map<number, number>,
) {
  const byDriver = new Map<number, CurrentReplayPosition>();

  for (const [driverNumber, motion] of motionByDriver.entries()) {
    const driverEvents = motion.events;

    if (!driverEvents.length) {
      continue;
    }

    const currentIndex = findReplayEventIndexAt(driverEvents, elapsedMs);
    const stateEvent = currentIndex >= 0 ? driverEvents[currentIndex] : driverEvents[0];
    const isRetired = currentIndex >= 0 ? isDriverRetiredOnTrack(driverEvents, elapsedMs) : false;
    const pitWindow = pitWindows.find((window) =>
      window.driverNumber === driverNumber && elapsedMs >= window.startMs && elapsedMs <= window.endMs,
    ) ?? null;

    let svgX = stateEvent.svgX;
    let svgY = stateEvent.svgY;
    let headingRad = stateEvent.headingRad;
    let progress = stateEvent.progress;
    let isPitLane = false;
    let hold = true;
    let trailD: string | null = null;

    if (pitWindow && pitGeometry) {
      const point = pitGeometry.pointAt(pitLaneParamAt(pitWindow, elapsedMs));
      svgX = point.x;
      svgY = point.y;
      headingRad = point.headingRad;
      isPitLane = true;
      hold = false;
    } else if (geometry) {
      const sample = trackProgressAt(motion, elapsedMs);

      if (sample) {
        progress = ((sample.unwrapped % 1) + 1) % 1;
        const point = geometry.pointAt(progress);
        svgX = point.x;
        svgY = point.y;
        headingRad = point.headingRad;
        hold = sample.hold;

        if (!sample.hold && !isRetired) {
          trailD = buildTrailPath(motion, elapsedMs, geometry, svgX, svgY);
        }
      }
    }

    const isStale = isRetired || (hold && currentIndex >= 0 && elapsedMs - stateEvent.offsetMs > staleTelemetryMs);

    byDriver.set(driverNumber, {
      ...stateEvent,
      headingRad,
      isPitLane,
      isStale,
      offsetMs: elapsedMs,
      pitLaneDuration: pitWindow ? pitWindow.pitLaneSeconds : stateEvent.pitLaneDuration,
      pitStopDuration: pitWindow ? pitWindow.pitStopSeconds : stateEvent.pitStopDuration,
      progress,
      svgX,
      svgY,
      trailD,
    });
  }

  applyLateralSeparation(byDriver, lateralOffsets);

  return byDriver;
}

function buildTrailPath(
  motion: DriverMotion,
  elapsedMs: number,
  geometry: TrackGeometry,
  headX: number,
  headY: number,
) {
  const commands: string[] = [];

  for (let step = 6; step >= 1; step -= 1) {
    const sample = trackProgressAt(motion, elapsedMs - step * 240);

    if (!sample) {
      continue;
    }

    const point = geometry.pointAt(((sample.unwrapped % 1) + 1) % 1);
    commands.push(`${commands.length === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`);
  }

  if (!commands.length) {
    return null;
  }

  commands.push(`L${headX.toFixed(1)} ${headY.toFixed(1)}`);

  return commands.join(" ");
}

/*
 * Машины, идущие борт в борт, разводятся поперёк трассы, чтобы маркеры
 * не накладывались друг на друга; смещение сглаживается между кадрами.
 */
function applyLateralSeparation(
  byDriver: Map<number, CurrentReplayPosition>,
  lateralOffsets: Map<number, number>,
) {
  const active = [...byDriver.values()]
    .filter((position) => !position.isStale && !position.isPitLane)
    .sort((a, b) => a.progress - b.progress);
  const targets = new Map<number, number>();
  let cluster: CurrentReplayPosition[] = [];

  const flushCluster = () => {
    if (cluster.length > 1) {
      const ordered = [...cluster].sort((a, b) => a.driverNumber - b.driverNumber);

      ordered.forEach((position, index) => {
        targets.set(position.driverNumber, clamp((index - (ordered.length - 1) / 2) * 8, -12, 12));
      });
    }

    cluster = [];
  };

  for (const position of active) {
    const previous = cluster[cluster.length - 1];

    if (previous && position.progress - previous.progress < 0.0045) {
      cluster.push(position);
    } else {
      flushCluster();
      cluster = [position];
    }
  }

  flushCluster();

  for (const position of byDriver.values()) {
    const target = targets.get(position.driverNumber) ?? 0;
    const current = lateralOffsets.get(position.driverNumber) ?? 0;
    const next = current + (target - current) * 0.18;
    lateralOffsets.set(position.driverNumber, next);

    if (!position.isPitLane && Math.abs(next) > 0.05) {
      position.svgX += -Math.sin(position.headingRad) * next;
      position.svgY += Math.cos(position.headingRad) * next;
    }
  }
}

function isDriverRetiredOnTrack(events: ReplayPositionEvent[], elapsedMs: number) {
  if (elapsedMs < 6 * 60_000 || events.length < 4) {
    return false;
  }

  const currentIndex = findReplayEventIndexAt(events, elapsedMs);

  if (currentIndex < 0) {
    return false;
  }

  const current = events[currentIndex];

  if (hasFutureMovement(events, currentIndex, 18)) {
    return false;
  }

  const stoppedSince = findStoppedSinceOffset(events, currentIndex, 18);

  return current.offsetMs - stoppedSince >= 120_000;
}

function findReplayEventIndexAt(events: ReplayPositionEvent[], elapsedMs: number) {
  let low = 0;
  let high = events.length - 1;
  let indexAt = -1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);

    if (events[middle].offsetMs <= elapsedMs) {
      indexAt = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return indexAt;
}

function hasFutureMovement(events: ReplayPositionEvent[], index: number, threshold: number) {
  const origin = events[index];

  for (let nextIndex = index + 1; nextIndex < events.length; nextIndex += 1) {
    if (distanceBetweenReplayPoints(origin, events[nextIndex]) > threshold) {
      return true;
    }
  }

  return false;
}

function findStoppedSinceOffset(events: ReplayPositionEvent[], index: number, threshold: number) {
  const current = events[index];
  let stoppedSince = current.offsetMs;

  for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
    if (distanceBetweenReplayPoints(current, events[previousIndex]) > threshold) {
      break;
    }

    stoppedSince = events[previousIndex].offsetMs;
  }

  return stoppedSince;
}

function distanceBetweenReplayPoints(a: ReplayPositionEvent, b: ReplayPositionEvent) {
  return Math.hypot(a.svgX - b.svgX, a.svgY - b.svgY);
}

function buildPitWindows(events: ReplayPositionEvent[]): PitWindow[] {
  const eventsByDriver = groupReplayPositionsByDriver(events);
  const windows: PitWindow[] = [];

  for (const [driverNumber, driverEvents] of eventsByDriver.entries()) {
    let active:
      | {
          driverNumber: number;
          lastPitMs: number;
          reportedPitLaneSeconds: number | null;
          reportedPitStopSeconds: number | null;
          startMs: number;
        }
      | null = null;

    for (const event of driverEvents) {
      const reportedPitLaneSeconds = getPitLaneDurationSeconds(event);
      const reportedPitStopSeconds = getPitStopDurationSeconds(event);

      if (event.isPitLane) {
        if (!active) {
          active = {
            driverNumber,
            lastPitMs: event.offsetMs,
            reportedPitLaneSeconds,
            reportedPitStopSeconds,
            startMs: event.offsetMs,
          };
        } else {
          active.lastPitMs = event.offsetMs;
          active.reportedPitLaneSeconds = reportedPitLaneSeconds ?? active.reportedPitLaneSeconds;
          active.reportedPitStopSeconds = reportedPitStopSeconds ?? active.reportedPitStopSeconds;
        }

        continue;
      }

      if (active) {
        const pitLaneEndMs = getPitLaneEndMs(active.startMs, active.lastPitMs, event.offsetMs, active.reportedPitLaneSeconds);

        windows.push({
          driverNumber: active.driverNumber,
          endMs: pitLaneEndMs,
          pitLaneSeconds:
            active.reportedPitLaneSeconds ?? Math.max(0, (pitLaneEndMs - active.startMs) / 1000),
          pitStopSeconds: active.reportedPitStopSeconds,
          startMs: active.startMs,
        });
        active = null;
        continue;
      }

      if (reportedPitLaneSeconds !== null || reportedPitStopSeconds !== null) {
        const fallbackDuration = reportedPitLaneSeconds ?? reportedPitStopSeconds ?? 0;
        const durationMs = fallbackDuration * 1000;

        windows.push({
          driverNumber,
          endMs: event.offsetMs,
          pitLaneSeconds: reportedPitLaneSeconds,
          pitStopSeconds: reportedPitStopSeconds,
          startMs: Math.max(0, event.offsetMs - durationMs),
        });
      }
    }

    if (active) {
      const pitLaneEndMs = getPitLaneEndMs(active.startMs, active.lastPitMs, active.lastPitMs, active.reportedPitLaneSeconds);

      windows.push({
        driverNumber: active.driverNumber,
        endMs: pitLaneEndMs,
        pitLaneSeconds:
          active.reportedPitLaneSeconds ?? Math.max(0, (pitLaneEndMs - active.startMs) / 1000),
        pitStopSeconds: active.reportedPitStopSeconds,
        startMs: active.startMs,
      });
    }
  }

  return normalizePitStopDurations(windows.sort((a, b) => a.startMs - b.startMs));
}

/*
 * В части сезонов OpenF1 не отдает stop_duration, а pit_duration дублирует время
 * пит-лейна — такие значения не являются временем стоянки. Тогда стоянку оцениваем
 * через транзит пит-лейна: самый быстрый пит гонки ~ транзит + 2.2с стоянки.
 */
function normalizePitStopDurations(windows: PitWindow[]): PitWindow[] {
  const laneValues = windows
    .map((window) => window.pitLaneSeconds)
    .filter((value): value is number => typeof value === "number" && value > 0);
  const transitSeconds = laneValues.length >= 3 ? Math.min(...laneValues) - 2.2 : null;

  return windows.map((window) => {
    const isDegenerate =
      window.pitStopSeconds === null ||
      (window.pitLaneSeconds !== null && window.pitStopSeconds >= window.pitLaneSeconds - 0.5);

    if (!isDegenerate) {
      return window;
    }

    if (transitSeconds === null || window.pitLaneSeconds === null || window.pitLaneSeconds <= transitSeconds) {
      return { ...window, pitStopSeconds: null };
    }

    return { ...window, pitStopSeconds: Math.max(1.5, window.pitLaneSeconds - transitSeconds) };
  });
}

function getPitNotifications(
  pitWindows: PitWindow[],
  drivers: ReplayDriverState[],
  elapsedMs: number,
): PitNotification[] {
  return pitWindows
    .filter((window) => elapsedMs >= window.startMs && elapsedMs <= window.endMs + 15_000)
    .sort((a, b) => a.startMs - b.startMs || a.driverNumber - b.driverNumber)
    .map((window) => {
      const driver = drivers.find((item) => item.driverNumber === window.driverNumber);
      const isActive = elapsedMs < window.endMs;

      return {
        abbreviation: driver?.abbreviation ?? String(window.driverNumber),
        driverNumber: window.driverNumber,
        phase: isActive ? "active" : "done",
        pitLaneSeconds: isActive
          ? Math.max(0, (elapsedMs - window.startMs) / 1000)
          : window.pitLaneSeconds ?? Math.max(0, (window.endMs - window.startMs) / 1000),
        pitStopSeconds: window.pitStopSeconds,
        startMs: window.startMs,
        teamColor: driver?.teamColor ?? "hsl(var(--primary))",
      };
    });
}

function getPitHistory(
  pitWindows: PitWindow[],
  drivers: ReplayDriverState[],
  elapsedMs: number,
): PitHistoryItem[] {
  return pitWindows
    .filter((window) => elapsedMs >= window.startMs)
    .sort((a, b) => b.startMs - a.startMs)
    .map((window) => {
      const driver = drivers.find((item) => item.driverNumber === window.driverNumber);
      const isActive = elapsedMs < window.endMs;

      return {
        abbreviation: driver?.abbreviation ?? String(window.driverNumber),
        driverNumber: window.driverNumber,
        isActive,
        pitLaneSeconds: isActive
          ? Math.max(0, (elapsedMs - window.startMs) / 1000)
          : window.pitLaneSeconds ?? Math.max(0, (window.endMs - window.startMs) / 1000),
        pitStopSeconds: window.pitStopSeconds,
        startMs: window.startMs,
        teamColor: driver?.teamColor ?? "hsl(var(--primary))",
      };
    });
}

function buildTimelineMarkers(events: ReplayRaceEvent[], durationMs: number): TimelineMarker[] {
  const markers: TimelineMarker[] = [];

  for (const event of events) {
    if (event.offsetMs < 0 || event.offsetMs > durationMs) {
      continue;
    }

    const text = normalizeRaceControlText(event);

    if (isPenaltyOrInvestigationEvent(text)) {
      continue;
    }

    if (isRedFlagStartEvent(text)) {
      markers.push({ label: "Красный флаг", offsetMs: event.offsetMs, tone: "red" });
    } else if (isSafetyCarStartEvent(text)) {
      markers.push({
        label: text.includes("virtual safety car") || text.includes("vsc") ? "VSC" : "Пейс-кар",
        offsetMs: event.offsetMs,
        tone: "yellow",
      });
    } else if (isChequeredEvent(event)) {
      markers.push({ label: "Финиш", offsetMs: event.offsetMs, tone: "neutral" });
    } else if (isActiveLocalYellowEvent(event)) {
      markers.push({
        label: text.includes("double yellow") ? "Двойной желтый" : "Желтый флаг",
        offsetMs: event.offsetMs,
        tone: "yellow",
      });
    }
  }

  // Схлопываем только повторы одного и того же события, идущие почти подряд.
  const minGapMs = durationMs * 0.004;
  const collapsed: TimelineMarker[] = [];

  for (const marker of markers.sort((a, b) => a.offsetMs - b.offsetMs)) {
    const last = collapsed.at(-1);

    if (last && marker.offsetMs - last.offsetMs < minGapMs && last.label === marker.label) {
      continue;
    }

    collapsed.push(marker);
  }

  return collapsed;
}

function getPitLaneEndMs(
  startMs: number,
  lastPitMs: number,
  firstNonPitMs: number,
  reportedPitLaneSeconds: number | null,
) {
  if (reportedPitLaneSeconds !== null && reportedPitLaneSeconds > 0) {
    return startMs + reportedPitLaneSeconds * 1000;
  }

  return Math.max(startMs, Math.min(firstNonPitMs, lastPitMs));
}

function getPitStopDurationSeconds(event: ReplayPositionEvent) {
  if (typeof event.pitStopDuration === "number" && Number.isFinite(event.pitStopDuration)) {
    return event.pitStopDuration;
  }

  return null;
}

function getPitLaneDurationSeconds(event: ReplayPositionEvent) {
  if (typeof event.pitLaneDuration === "number" && Number.isFinite(event.pitLaneDuration)) {
    return event.pitLaneDuration;
  }

  return null;
}

function getTrackPointAtProgress(centerline: TrackPoint[], progress: number) {
  if (!centerline.length) {
    return null;
  }

  progress = ((progress % 1) + 1) % 1;
  const sorted = centerline;
  let previous = sorted[0];
  let next = sorted[0];

  for (let index = 1; index < sorted.length; index += 1) {
    const point = sorted[index];

    if (point.progress >= progress) {
      next = point;
      break;
    }

    previous = point;
  }

  if (next === sorted[0] && progress > sorted[sorted.length - 1].progress) {
    next = sorted[0];
  }

  const segmentProgress =
    next.progress >= previous.progress
      ? next.progress - previous.progress
      : 1 - previous.progress + next.progress;
  const progressIntoSegment =
    progress >= previous.progress
      ? progress - previous.progress
      : 1 - previous.progress + progress;
  const t = segmentProgress > 0 ? clamp(progressIntoSegment / segmentProgress, 0, 1) : 0;
  const svgX = lerp(previous.svgX, next.svgX, t);
  const svgY = lerp(previous.svgY, next.svgY, t);
  const z = lerp(previous.worldZ, next.worldZ, t);
  const maxZ = Math.max(...centerline.map((point) => point.worldZ));
  const minZ = Math.min(...centerline.map((point) => point.worldZ));

  return {
    headingRad: Math.atan2(next.svgY - previous.svgY, next.svgX - previous.svgX),
    normalizedZ: maxZ === minZ ? 0.5 : (z - minZ) / (maxZ - minZ),
    svgX,
    svgY,
    z,
  };
}

function buildDisplayPitLane(
  centerline: TrackPoint[],
  snapshotPoints: PitLanePoint[],
  circuitName: string,
): PitLanePoint[] {
  if (centerline.length < 4) {
    return snapshotPoints ?? [];
  }

  const override = getPitLaneDisplayOverride(circuitName);
  const derived = derivePitLaneSpan(centerline, snapshotPoints);
  const sideSign = override.sideSign ?? inferPitLaneSideSign(centerline, snapshotPoints);
  const startProgress = derived?.startProgress ?? override.startProgress;
  const endProgress = derived?.endProgress ?? override.endProgress;
  const offset = derived?.offset ?? override.offset;
  const count = 78;
  const points: PitLanePoint[] = [];

  for (let index = 0; index < count; index += 1) {
    const ratio = count <= 1 ? 0 : index / (count - 1);
    const progress = startProgress + (endProgress - startProgress) * ratio;
    const trackPoint = getTrackPointAtProgress(centerline, progress);

    if (!trackPoint) {
      continue;
    }

    const before = getTrackPointAtProgress(centerline, progress - 0.0025) ?? trackPoint;
    const after = getTrackPointAtProgress(centerline, progress + 0.0025) ?? trackPoint;
    const tangentX = after.svgX - before.svgX;
    const tangentY = after.svgY - before.svgY;
    const length = Math.hypot(tangentX, tangentY) || 1;
    const normalX = (-tangentY / length) * sideSign;
    const normalY = (tangentX / length) * sideSign;
    const fade = override.isStraight ? 1 : Math.sin(Math.PI * ratio);
    const pointOffset = offset * Math.max(0, fade);

    points.push({
      headingRad: Math.atan2(tangentY, tangentX),
      svgX: trackPoint.svgX + normalX * pointOffset,
      svgY: trackPoint.svgY + normalY * pointOffset,
      worldZ: trackPoint.z,
    });
  }

  if (override.isStraight && points.length >= 2) {
    return buildStraightPitLanePoints(points[0], points.at(-1) ?? points[0], count);
  }

  return points.length >= 2 ? points : snapshotPoints ?? [];
}

function buildStraightPitLanePoints(start: PitLanePoint, end: PitLanePoint, count: number): PitLanePoint[] {
  const headingRad = Math.atan2(end.svgY - start.svgY, end.svgX - start.svgX);

  return Array.from({ length: count }, (_, index) => {
    const ratio = count <= 1 ? 0 : index / (count - 1);

    return {
      headingRad,
      svgX: lerp(start.svgX, end.svgX, ratio),
      svgY: lerp(start.svgY, end.svgY, ratio),
      worldZ: start.worldZ ?? end.worldZ ?? null,
    };
  });
}

/*
 * Въезд и выезд пит-лейна берем из реальной телеметрии снапшота: границы —
 * это прогресс ближайших точек трассы к первой и последней точке пит-лейна,
 * по которым машины реально ехали. Фолбэк — ручные пресеты по трассам.
 */
function derivePitLaneSpan(centerline: TrackPoint[], snapshotPoints: PitLanePoint[]) {
  if (snapshotPoints.length < 20 || centerline.length < 8) {
    return null;
  }

  const nearestTo = (point: PitLanePoint) => {
    let best: { distance: number; progress: number } | null = null;

    for (const candidate of centerline) {
      const distance = Math.hypot(candidate.svgX - point.svgX, candidate.svgY - point.svgY);

      if (!best || distance < best.distance) {
        best = { distance, progress: candidate.progress };
      }
    }

    return best;
  };

  const entry = nearestTo(snapshotPoints[0]);
  const exit = nearestTo(snapshotPoints[snapshotPoints.length - 1]);

  if (!entry || !exit || entry.distance > 60 || exit.distance > 60) {
    return null;
  }

  let span = exit.progress - entry.progress;

  if (span <= -0.5) {
    span += 1;
  }

  if (span < 0.03 || span > 0.22) {
    return null;
  }

  const midOffsets = [0.3, 0.5, 0.7]
    .map((ratio) => nearestTo(snapshotPoints[Math.floor(snapshotPoints.length * ratio)])?.distance ?? 0)
    .sort((a, b) => a - b);

  return {
    endProgress: entry.progress + span,
    offset: clamp(midOffsets[1] ?? 0, 20, 40),
    startProgress: entry.progress,
  };
}

function getPitLaneDisplayOverride(circuitName: string) {
  const key = circuitName.toLowerCase();
  const base = {
    endProgress: 0.075,
    isStraight: false,
    offset: 32,
    sideSign: null as number | null,
    startProgress: -0.07,
  };

  if (key.includes("shanghai") || key.includes("chinese")) {
    return { ...base, endProgress: 0.06, offset: 34, sideSign: 1 };
  }

  if (key.includes("gilles") || key.includes("canadian")) {
    return {
      ...base,
      endProgress: 0.035,
      isStraight: true,
      offset: 28,
      startProgress: -0.03,
    };
  }

  if (key.includes("monaco")) {
    return { ...base, endProgress: 0.07, offset: 26 };
  }

  if (key.includes("red bull") || key.includes("austrian")) {
    return { ...base, endProgress: 0.08, offset: 34 };
  }

  return base;
}

function inferPitLaneSideSign(centerline: TrackPoint[], pitLanePoints: PitLanePoint[]) {
  const sample = pitLanePoints[Math.floor((pitLanePoints?.length ?? 0) / 2)];

  if (!sample) {
    return -1;
  }

  const nearest = centerline
    .map((point, index) => ({ index, point, distance: Math.hypot(point.svgX - sample.svgX, point.svgY - sample.svgY) }))
    .sort((a, b) => a.distance - b.distance)[0];

  if (!nearest) {
    return -1;
  }

  const previous = centerline[Math.max(0, nearest.index - 1)] ?? nearest.point;
  const next = centerline[Math.min(centerline.length - 1, nearest.index + 1)] ?? nearest.point;
  const tangentX = next.svgX - previous.svgX;
  const tangentY = next.svgY - previous.svgY;
  const toPitX = sample.svgX - nearest.point.svgX;
  const toPitY = sample.svgY - nearest.point.svgY;
  const cross = tangentX * toPitY - tangentY * toPitX;

  return cross >= 0 ? 1 : -1;
}

function getRaceStatus(events: ReplayRaceEvent[], elapsedMs: number, hasChequeredFlag: boolean): RaceStatus {
  const pastEvents = events.filter((event) => event.offsetMs <= elapsedMs);
  const latest = pastEvents.at(-1) ?? null;
  const latestChequered = [...pastEvents].reverse().find(isChequeredEvent) ?? null;

  if (!latest && !hasChequeredFlag) {
    return {
      detail: "Ожидание старта повтора",
      event: null,
      label: "Перед стартом",
      tone: "neutral",
    };
  }

  const raceState = getActiveRaceControlState(pastEvents);
  const localYellow = getActiveLocalYellowEvent(pastEvents);

  if (hasChequeredFlag || latestChequered) {
    const activeState = raceState ?? (
      localYellow
        ? {
            detail: localYellow.message,
            event: localYellow,
            label: normalizeRaceControlText(localYellow).includes("double yellow") ? "Двойной желтый" : "Желтый флаг",
            tone: "yellow" as const,
          }
        : null
    );

    if (activeState) {
      return {
        ...activeState,
        detail: activeState.detail || latestChequered?.message || "Финиш гонки",
        label: `Финиш · ${activeState.label}`,
      };
    }

    return {
      detail: latestChequered?.message ?? "Гонка завершена",
      event: latestChequered ?? latest,
      label: "Клетчатый флаг",
      tone: "neutral",
    };
  }

  if (raceState) {
    return raceState;
  }

  if (latest && isChequeredEvent(latest)) {
    return {
      detail: latest.message,
      event: latest,
      label: "Финиш",
      tone: "neutral",
    };
  }

  if (localYellow) {
    return {
      detail: localYellow.message,
      event: localYellow,
      label: normalizeRaceControlText(localYellow).includes("double yellow") ? "Двойной желтый" : "Желтый флаг",
      tone: "yellow",
    };
  }

  return {
    detail: "Гонка идет в зеленом режиме",
    event: latest,
    label: "Зеленый флаг",
    tone: "green",
  };
}

function normalizeRaceControlText(event: ReplayRaceEvent) {
  return [event.type, event.message, event.severity].filter(Boolean).join(" ").toLowerCase();
}

function getActiveRaceControlState(events: ReplayRaceEvent[]): RaceStatus | null {
  let active: RaceStatus | null = null;

  for (const event of events) {
    const text = normalizeRaceControlText(event);

    if (isPenaltyOrInvestigationEvent(text)) {
      continue;
    }

    if (isRedFlagStartEvent(text)) {
      active = {
        detail: event.message,
        event,
        label: "Красный флаг",
        tone: "red",
      };
      continue;
    }

    if (isSafetyCarEndEvent(text)) {
      active = null;
      continue;
    }

    if (isSafetyCarEndingNotice(text) && active) {
      active = {
        ...active,
        detail: event.message,
        event,
      };
      continue;
    }

    if (isSafetyCarStartEvent(text)) {
      active = {
        detail: event.message,
        event,
        label: text.includes("virtual safety car") || text.includes("vsc") ? "VSC" : "Пейс-кар",
        tone: "yellow",
      };
      continue;
    }

    if (isTrackClearEvent(text) && active?.tone !== "red") {
      active = null;
    }
  }

  return active;
}

function getActiveLocalYellowEvent(events: ReplayRaceEvent[]) {
  const activeBySector = new Map<string, ReplayRaceEvent>();

  for (const event of events) {
    const text = normalizeRaceControlText(event);

    if (isPenaltyOrInvestigationEvent(text)) {
      continue;
    }

    if (isTrackClearEvent(text)) {
      activeBySector.clear();
      continue;
    }

    const sector = getTrackSectorKey(text);

    if (text.includes("clear") && sector) {
      activeBySector.delete(sector);
      continue;
    }

    if (isActiveLocalYellowEvent(event)) {
      activeBySector.set(sector ?? "track", event);
    }
  }

  return [...activeBySector.values()].sort((a, b) => b.offsetMs - a.offsetMs)[0] ?? null;
}

function isPenaltyOrInvestigationEvent(text: string) {
  return /penalty|infringement|investigation|reviewed|stewards|incident involving/.test(text);
}

function isSafetyCarStartEvent(text: string) {
  return /(?:virtual safety car|vsc|safety car)\s+deployed/.test(text);
}

function isSafetyCarEndEvent(text: string) {
  return text.includes("track clear") || text.includes("green flag");
}

function isSafetyCarEndingNotice(text: string) {
  return /(?:virtual safety car|vsc|safety car)\s+(?:ending|in this lap)/.test(text);
}

function isRedFlagStartEvent(text: string) {
  return text.includes("red flag") && !text.includes("cleared") && !text.includes("clear");
}

function isTrackClearEvent(text: string) {
  return text.includes("track clear") || text.includes("green flag");
}

function isActiveLocalYellowEvent(event: ReplayRaceEvent) {
  const text = normalizeRaceControlText(event);

  return text.includes("yellow") && !text.includes("clear") && !isPenaltyOrInvestigationEvent(text);
}

function getTrackSectorKey(text: string) {
  const sector = text.match(/track sector\s+(\d+)/)?.[1];

  return sector ? `sector-${sector}` : null;
}

function isChequeredEvent(event: ReplayRaceEvent) {
  const text = normalizeRaceControlText(event);

  return text.includes("chequered") || text.includes("checkered");
}

function lerp(previous: number, next: number, t: number) {
  return previous + (next - previous) * t;
}

function buildTimingRows(drivers: ReplayDriverState[], positions: Map<number, CurrentReplayPosition>) {
  const rows = drivers
    .map((driver): TimingRow => {
      const current = positions.get(driver.driverNumber);

      return {
        ...driver,
        compound: current?.compound ?? driver.compound,
        gapToLeader: current?.gapToLeader ?? driver.gapToLeader,
        intervalToAhead: current?.intervalToAhead ?? driver.intervalToAhead,
        lapNumber: current?.lapNumber ?? driver.lapNumber,
        lastLapDuration: current?.lastLapDuration ?? driver.lastLapDuration,
        lastLapTime: current?.lastLapTime ?? driver.lastLapTime,
        position: current?.position ?? driver.position,
        sector1Time: current?.sector1Time ?? driver.sector1Time,
        sector2Time: current?.sector2Time ?? driver.sector2Time,
        sector3Time: current?.sector3Time ?? driver.sector3Time,
        status: current?.isPitLane ? "PIT" : current && "isStale" in current && current.isStale ? "OUT" : driver.status,
        tyreAge: current?.tyreAge ?? driver.tyreAge,
        lapDeficit: null,
        raceOrder: 99,
      };
    });
  const leaderLap = rows.reduce(
    (max, row) => typeof row.lapNumber === "number" && Number.isFinite(row.lapNumber) ? Math.max(max, row.lapNumber) : max,
    0,
  );

  return rows
    .map((row) => {
      const lapDeficit =
        leaderLap > 0 && typeof row.lapNumber === "number" && Number.isFinite(row.lapNumber)
          ? Math.max(0, leaderLap - row.lapNumber)
          : null;

      return {
        ...row,
        lapDeficit,
        raceOrder: (lapDeficit ?? 0) * 100 + (row.position ?? 99),
      };
    })
    .sort((a, b) => a.raceOrder - b.raceOrder || (a.position ?? 99) - (b.position ?? 99));
}

function getLapAnalytics(rows: TimingRow[]): LapAnalytics {
  const bestRaceLap = rows
    .map((row) => ({
      lapMs: parseTimingMs(row.bestLapTime),
      row,
    }))
    .filter((item): item is { lapMs: number; row: TimingRow } => (
      item.lapMs !== null && Number.isFinite(item.lapMs) && item.lapMs > 0
    ))
    .sort((a, b) => a.lapMs - b.lapMs)[0];
  const bestRecentLap = rows
    .filter((row) => row.status !== "PIT" && row.status !== "OUT")
    .map((row) => ({
      lapSeconds: row.lastLapDuration,
      row,
    }))
    .filter((item): item is { lapSeconds: number; row: TimingRow } => (
      typeof item.lapSeconds === "number" &&
      Number.isFinite(item.lapSeconds) &&
      item.lapSeconds > 0
    ))
    .sort((a, b) => a.lapSeconds - b.lapSeconds)[0];

  return {
    bestRaceLap: bestRaceLap
      ? buildLapAnalyticsRow(bestRaceLap.row, bestRaceLap.lapMs / 1000, bestRaceLap.row.bestLapTime)
      : null,
    bestRecentLap: bestRecentLap
      ? buildLapAnalyticsRow(
          bestRecentLap.row,
          bestRecentLap.lapSeconds,
          bestRecentLap.row.lastLapTime ?? formatLapSeconds(bestRecentLap.lapSeconds),
        )
      : null,
  };
}

function buildLapAnalyticsRow(row: TimingRow, lapTimeSeconds: number, lapTime: string | null): LapAnalyticsRow {
  return {
    abbreviation: row.abbreviation,
    compound: row.compound,
    driverNumber: row.driverNumber,
    lapTime,
    lapTimeSeconds,
    teamColor: row.teamColor,
  };
}

function getTyrePaceSummary(
  rows: TimingRow[],
  pitWindows: PitWindow[],
  elapsedMs: number,
): TyrePaceSummary[] {
  const byCompound = new Map<string, { count: number; totalSeconds: number }>();

  for (const row of rows) {
    const compound = getCompoundKey(row.compound);

    if (!compound || row.status === "PIT" || row.status === "OUT") {
      continue;
    }

    if (
      typeof row.lastLapDuration !== "number" ||
      !Number.isFinite(row.lastLapDuration) ||
      row.lastLapDuration <= 0
    ) {
      continue;
    }

    if (isPitAffectedLastLap(row, pitWindows, elapsedMs)) {
      continue;
    }

    const current = byCompound.get(compound) ?? { count: 0, totalSeconds: 0 };
    current.count += 1;
    current.totalSeconds += row.lastLapDuration;
    byCompound.set(compound, current);
  }

  return [...byCompound.entries()]
    .map(([compound, value]) => ({
      averageLapSeconds: value.totalSeconds / value.count,
      compound,
      count: value.count,
    }))
    .sort((a, b) => getCompoundSortValue(a.compound) - getCompoundSortValue(b.compound));
}

function isPitAffectedLastLap(row: TimingRow, pitWindows: PitWindow[], elapsedMs: number) {
  if (
    typeof row.lastLapDuration !== "number" ||
    !Number.isFinite(row.lastLapDuration) ||
    row.lastLapDuration <= 0
  ) {
    return true;
  }

  const lapEndMs = elapsedMs;
  const lapStartMs = Math.max(0, elapsedMs - row.lastLapDuration * 1000);

  return pitWindows.some((window) => (
    window.driverNumber === row.driverNumber &&
    window.startMs <= lapEndMs &&
    window.endMs >= lapStartMs
  ));
}

function getCompoundKey(compound: string | null | undefined) {
  const key = String(compound ?? "").toLowerCase();

  if (key.includes("soft")) {
    return "soft";
  }

  if (key.includes("medium")) {
    return "medium";
  }

  if (key.includes("hard")) {
    return "hard";
  }

  if (key.includes("inter")) {
    return "intermediate";
  }

  if (key.includes("wet")) {
    return "wet";
  }

  return null;
}

function getCompoundSortValue(compound: string) {
  const order: Record<string, number> = {
    hard: 2,
    intermediate: 3,
    medium: 1,
    soft: 0,
    wet: 4,
  };

  return order[compound] ?? 9;
}

function formatLapSeconds(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "—";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds - minutes * 60;

  if (minutes > 0) {
    return `${minutes}:${remainingSeconds.toFixed(3).padStart(6, "0")}`;
  }

  return remainingSeconds.toFixed(3);
}

function getTyreVisual(compound: string | null | undefined) {
  const key = String(compound ?? "").toLowerCase();

  if (key.includes("soft")) {
    return { background: "#E10600", border: "rgba(255,255,255,0.42)", color: "#fff", label: "Soft", letter: "S" };
  }

  if (key.includes("medium")) {
    return { background: "#FFD60A", border: "rgba(0,0,0,0.25)", color: "#111", label: "Medium", letter: "M" };
  }

  if (key.includes("hard")) {
    return { background: "#F8FAFC", border: "rgba(0,0,0,0.28)", color: "#111", label: "Hard", letter: "H" };
  }

  if (key.includes("inter")) {
    return { background: "#21A65B", border: "rgba(255,255,255,0.32)", color: "#fff", label: "Intermediate", letter: "I" };
  }

  if (key.includes("wet")) {
    return { background: "#2F7DFF", border: "rgba(255,255,255,0.32)", color: "#fff", label: "Wet", letter: "W" };
  }

  return { background: "hsl(var(--secondary))", border: "hsl(var(--border))", color: "hsl(var(--muted-foreground))", label: "Состав неизвестен", letter: "—" };
}

function getLapWord(value: number) {
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return "круг";
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return "круга";
  }

  return "кругов";
}

function formatClock(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatMaybeNumber(value: number | null | undefined, suffix: string) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(1)}${suffix}` : "—";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
