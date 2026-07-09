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
const maxReplayInterpolationGapMs = 180_000;
const staleTelemetryMs = 90_000;

type CurrentReplayPosition = ReplayPositionEvent & {
  isStale?: boolean;
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
  tone: "green" | "yellow" | "red" | "neutral";
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
  const pitWindows = useMemo(
    () => buildPitWindows(replay.positions),
    [replay.positions],
  );
  const currentPositions = useMemo(
    () => getCurrentPositions(positionsByDriver, elapsedMs, replay.track.centerline, pitWindows, displayPitLane),
    [displayPitLane, elapsedMs, pitWindows, positionsByDriver, replay.track.centerline],
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
    () => replay.raceEvents.filter((event) => event.offsetMs <= elapsedMs).slice(-8).reverse(),
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
  const trackDecor = useMemo(
    () => buildTrackDecor(replay.track.centerline),
    [replay.track.centerline],
  );
  const pitLaneVisualPath = useMemo(
    () => buildPitLaneVisualPath(displayPitLane),
    [displayPitLane],
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
            <p className="font-telemetry flex items-center gap-2 text-[0.62rem] font-bold uppercase tracking-[0.12em] text-primary">
              <RadioTower aria-hidden="true" className="size-3.5" />
              Повтор гонки · {replay.sourceSeason}
            </p>
            <h1 className="mt-1.5 text-balance font-display text-2xl font-extrabold leading-tight tracking-[-0.04em] sm:text-3xl">
              {replay.raceName}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <p className="text-sm font-semibold text-muted-foreground">{replay.circuitName}</p>
              <Button asChild size="sm" variant="secondary">
                <Link href="/weekend" prefetch={false}>
                  <ArrowLeft aria-hidden="true" data-icon="inline-start" />
                  Текущий этап
                </Link>
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-stretch gap-2">
            <div className="rounded-md border border-border/70 bg-secondary/30 px-3.5 py-2 text-right">
              <p className="stitch-label text-[0.56rem] text-muted-foreground">Круг</p>
              <p className="font-telemetry text-xl font-extrabold leading-tight">
                {currentLap ?? "—"}
                {replay.totalLaps ? (
                  <span className="text-sm font-bold text-muted-foreground"> / {replay.totalLaps}</span>
                ) : null}
              </p>
            </div>
            <WeatherChips weather={replay.weather} />
          </div>
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
            <path
              d={replay.track.svg.visualPathD}
              fill="none"
              filter="url(#race-replay-track-shadow)"
              stroke="var(--race-replay-track-aura)"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="42"
            />
            {trackDecor.sectorPaths.map((sector) => (
              <path
                d={sector.pathD}
                fill="none"
                key={sector.label}
                stroke={sector.color}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="46"
              />
            ))}
            {pitLaneVisualPath ? (
              <g>
                <path
                d={pitLaneVisualPath}
                fill="none"
                  stroke="var(--race-replay-track-outer)"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="24"
                />
                <path
                d={pitLaneVisualPath}
                fill="none"
                  stroke="var(--race-replay-track-edge)"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="14"
                />
                <path
                d={pitLaneVisualPath}
                fill="none"
                  stroke="var(--race-replay-track-core)"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="10"
                />
              </g>
            ) : null}
            <path
              d={replay.track.svg.visualPathD}
              fill="none"
              stroke="var(--race-replay-track-outer)"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="30"
            />
            <path
              d={replay.track.svg.visualPathD}
              fill="none"
              stroke="var(--race-replay-track-edge)"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="18"
            />
            <path
              d={replay.track.svg.visualPathD}
              fill="none"
              stroke="var(--race-replay-track-core)"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="14"
            />
            <g transform={`translate(${trackDecor.start.svgX} ${trackDecor.start.svgY})`}>
              <line stroke="var(--race-replay-track-start)" strokeWidth="2.5" x1="-18" x2="18" y1="-8" y2="8" />
              <text fill="var(--race-replay-track-label)" fontSize="10" fontWeight="900" textAnchor="end" x="-18" y="-12">
                START
              </text>
            </g>
            {debug ? (
              <path
                d={replay.track.svg.technicalPathD}
                fill="none"
                stroke="hsl(var(--success))"
                strokeDasharray="2 4"
                strokeWidth="1"
              />
            ) : null}
            {[...currentPositions.values()].filter((position) => !position.isStale).map((position) => {
              const driver = replay.drivers.find((item) => item.driverNumber === position.driverNumber);
              const isSelected = selectedDriver === position.driverNumber;
              const markerPosition = position;

              return (
                <g
                  aria-label={`Выбрать пилота ${driver?.fullName ?? position.driverNumber}`}
                  className="cursor-pointer outline-none"
                  filter={isSelected ? "url(#race-replay-glow)" : undefined}
                  key={position.driverNumber}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedDriver(position.driverNumber);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedDriver(position.driverNumber);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  transform={`translate(${markerPosition.svgX} ${markerPosition.svgY}) rotate(${(markerPosition.headingRad * 180) / Math.PI})`}
                >
                  <circle fill="transparent" r="18" />
                  <rect
                    fill={driver?.teamColor ?? "hsl(var(--primary))"}
                    height={isSelected ? 14 : 11}
                    opacity={position.isStale ? 0.78 : 1}
                    rx={isSelected ? 7 : 5.5}
                    stroke={position.isPitLane ? "var(--race-replay-pit-marker)" : "var(--race-replay-marker-stroke)"}
                    strokeWidth={isSelected ? 3 : position.isPitLane ? 2.5 : 2}
                    width={isSelected ? 29 : 24}
                    x={isSelected ? -14.5 : -12}
                    y={isSelected ? -7 : -5.5}
                  />
                  <text
                    fill="var(--race-replay-marker-text)"
                    fontSize={isSelected ? "6.4" : "5.5"}
                    fontWeight="900"
                    textAnchor="middle"
                    transform={`rotate(${-(markerPosition.headingRad * 180) / Math.PI})`}
                    y="2"
                  >
                    {driver?.abbreviation ?? position.driverNumber}
                  </text>
                </g>
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
            style={{ width: `${lapProgress * 100}%` }}
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
    green: "bg-[rgb(57,255,20)]",
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
          style={{ left: `${clamp(marker.offsetMs / duration, 0, 1) * 100}%` }}
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
        Контроль гонки
      </p>
      <div className="mt-3 grid gap-1.5">
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
        <p className="mt-2 text-[0.6rem] font-semibold text-muted-foreground">Клик по событию — перейти к моменту</p>
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
  eventsByDriver: Map<number, ReplayPositionEvent[]>,
  elapsedMs: number,
  centerline: TrackPoint[],
  pitWindows: PitWindow[],
  pitLanePoints: PitLanePoint[],
) {
  const byDriver = new Map<number, CurrentReplayPosition>();

  for (const [driverNumber, driverEvents] of eventsByDriver.entries()) {
    const currentIndex = findReplayEventIndexAt(driverEvents, elapsedMs);
    const previous = currentIndex >= 0 ? driverEvents[currentIndex] : null;
    const next = driverEvents[currentIndex + 1] ?? (currentIndex < 0 ? driverEvents[0] : null);
    const isRetired = previous ? isDriverRetiredOnTrack(driverEvents, elapsedMs) : false;
    const pitWindow = pitWindows.find((window) =>
      window.driverNumber === driverNumber && elapsedMs >= window.startMs && elapsedMs <= window.endMs,
    ) ?? null;

    if (pitWindow && pitLanePoints.length) {
      const base = previous && next && next.offsetMs - previous.offsetMs <= maxReplayInterpolationGapMs
        ? interpolateReplayPosition(previous, next, elapsedMs, centerline)
        : previous ?? next;
      const pitPoint = sampleReplayPitLanePoint(pitLanePoints, pitWindow, elapsedMs);

      if (base && pitPoint) {
        byDriver.set(driverNumber, {
          ...base,
          headingRad: pitPoint.headingRad,
          isPitLane: true,
          isStale: false,
          offsetMs: elapsedMs,
          pitLaneDuration: pitWindow.pitLaneSeconds,
          pitStopDuration: pitWindow.pitStopSeconds,
          svgX: pitPoint.svgX,
          svgY: pitPoint.svgY,
        });
        continue;
      }
    }

    if (previous && next && next.offsetMs - previous.offsetMs <= maxReplayInterpolationGapMs) {
      byDriver.set(driverNumber, {
        ...interpolateReplayPosition(previous, next, elapsedMs, centerline),
        isStale: isRetired,
      });
    } else if (previous) {
      byDriver.set(driverNumber, {
        ...previous,
        isStale: isRetired || elapsedMs - previous.offsetMs > staleTelemetryMs,
      });
    } else if (next) {
      byDriver.set(driverNumber, next);
    }
  }

  return byDriver;
}

function interpolateReplayPosition(
  previous: ReplayPositionEvent,
  next: ReplayPositionEvent,
  elapsedMs: number,
  centerline: TrackPoint[],
) {
  const span = Math.max(1, next.offsetMs - previous.offsetMs);
  const t = clamp((elapsedMs - previous.offsetMs) / span, 0, 1);
  const shouldUseRawPosition = Boolean(previous.isPitLane && next.isPitLane);

  if (shouldUseRawPosition) {
    return {
      ...previous,
      gapToLeader: next.gapToLeader ?? previous.gapToLeader,
      headingRad: getRawHeading(previous, next),
      intervalToAhead: next.intervalToAhead ?? previous.intervalToAhead,
      isPitLane: Boolean(previous.isPitLane || next.isPitLane),
      lapNumber: next.lapNumber ?? previous.lapNumber,
      lastLapDuration: next.lastLapDuration ?? previous.lastLapDuration,
      lastLapTime: next.lastLapTime ?? previous.lastLapTime,
      normalizedZ: lerp(previous.normalizedZ, next.normalizedZ, t),
      offsetMs: elapsedMs,
      pitLaneDuration: next.pitLaneDuration ?? previous.pitLaneDuration,
      pitStopDuration: next.pitStopDuration ?? previous.pitStopDuration,
      position: next.position ?? previous.position,
      progress: previous.progress,
      sector1Time: next.sector1Time ?? previous.sector1Time,
      sector2Time: next.sector2Time ?? previous.sector2Time,
      sector3Time: next.sector3Time ?? previous.sector3Time,
      svgX: lerp(previous.svgX, next.svgX, t),
      svgY: lerp(previous.svgY, next.svgY, t),
      timestamp: new Date(new Date(previous.timestamp).getTime() + span * t).toISOString(),
      tyreAge: next.tyreAge ?? previous.tyreAge,
      z: lerp(previous.z, next.z, t),
    };
  }

  const progressDelta = getProgressDelta(previous.progress, next.progress);
  const safeTrackPoint =
    progressDelta === null ? getTrackPointAtProgress(centerline, previous.progress) : null;
  const progress =
    progressDelta === null
      ? previous.progress
      : (previous.progress + progressDelta * t + 1) % 1;
  const trackPoint = progressDelta === null ? safeTrackPoint : getTrackPointAtProgress(centerline, progress);

  return {
    ...previous,
    gapToLeader: next.gapToLeader ?? previous.gapToLeader,
    headingRad: trackPoint?.headingRad ?? previous.headingRad,
    intervalToAhead: next.intervalToAhead ?? previous.intervalToAhead,
    lapNumber: next.lapNumber ?? previous.lapNumber,
    lastLapDuration: next.lastLapDuration ?? previous.lastLapDuration,
    lastLapTime: next.lastLapTime ?? previous.lastLapTime,
    normalizedZ: trackPoint?.normalizedZ ?? lerp(previous.normalizedZ, next.normalizedZ, t),
    offsetMs: elapsedMs,
    position: next.position ?? previous.position,
    progress,
    sector1Time: next.sector1Time ?? previous.sector1Time,
    sector2Time: next.sector2Time ?? previous.sector2Time,
    sector3Time: next.sector3Time ?? previous.sector3Time,
    svgX: trackPoint?.svgX ?? previous.svgX,
    svgY: trackPoint?.svgY ?? previous.svgY,
    timestamp: new Date(new Date(previous.timestamp).getTime() + span * t).toISOString(),
    tyreAge: next.tyreAge ?? previous.tyreAge,
    z: trackPoint?.z ?? lerp(previous.z, next.z, t),
  };
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

  return windows.sort((a, b) => a.startMs - b.startMs);
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
    } else if (isTrackClearEvent(text)) {
      markers.push({ label: "Зеленый флаг", offsetMs: event.offsetMs, tone: "green" });
    }
  }

  // Схлопываем маркеры ближе 0.8% длительности, чтобы таймлайн не превращался в частокол.
  const minGapMs = durationMs * 0.008;
  const collapsed: TimelineMarker[] = [];

  for (const marker of markers.sort((a, b) => a.offsetMs - b.offsetMs)) {
    const last = collapsed.at(-1);

    if (last && marker.offsetMs - last.offsetMs < minGapMs && last.tone === marker.tone) {
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

function buildTrackDecor(centerline: TrackPoint[]) {
  const progressPoint = (progress: number) => getTrackPointAtProgress(centerline, progress);
  const sectorPaths = [
    { color: "var(--race-replay-sector-1)", end: 0.333, label: "Сектор 1", start: 0 },
    { color: "var(--race-replay-sector-2)", end: 0.666, label: "Сектор 2", start: 0.333 },
    { color: "var(--race-replay-sector-3)", end: 1, label: "Сектор 3", start: 0.666 },
  ].map((sector) => ({
    ...sector,
    pathD: buildSectorPath(centerline, sector.start, sector.end),
  }));
  const start = progressPoint(0) ?? { svgX: centerline[0]?.svgX ?? 0, svgY: centerline[0]?.svgY ?? 0 };

  return { sectorPaths, start };
}

function buildSectorPath(centerline: TrackPoint[], start: number, end: number) {
  const points = centerline.filter((point) => point.progress >= start && point.progress <= end);
  const startPoint = getTrackPointAtProgress(centerline, start);
  const endPoint = getTrackPointAtProgress(centerline, end);
  const sectorPoints = [
    startPoint ? { svgX: startPoint.svgX, svgY: startPoint.svgY } : null,
    ...points,
    endPoint ? { svgX: endPoint.svgX, svgY: endPoint.svgY } : null,
  ].filter(Boolean) as { svgX: number; svgY: number }[];

  return sectorPoints
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.svgX.toFixed(1)} ${point.svgY.toFixed(1)}`)
    .join(" ");
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
  const sideSign = override.sideSign ?? inferPitLaneSideSign(centerline, snapshotPoints);
  const offset = override.offset;
  const count = 78;
  const points: PitLanePoint[] = [];

  for (let index = 0; index < count; index += 1) {
    const ratio = count <= 1 ? 0 : index / (count - 1);
    const progress = override.startProgress + (override.endProgress - override.startProgress) * ratio;
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

function sampleReplayPitLanePoint(points: PitLanePoint[], pitWindow: PitWindow, elapsedMs: number) {
  if (!points.length) {
    return null;
  }

  const durationMs = Math.max(1, pitWindow.endMs - pitWindow.startMs);
  const progress = clamp((elapsedMs - pitWindow.startMs) / durationMs, 0, 1);
  const segmentLengths = [];
  let totalLength = 0;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const length = Math.hypot(current.svgX - previous.svgX, current.svgY - previous.svgY);
    segmentLengths.push(length);
    totalLength += length;
  }

  const targetDistance = totalLength * progress;
  let traversed = 0;

  for (let index = 1; index < points.length; index += 1) {
    const segmentLength = segmentLengths[index - 1] ?? 0;

    if (traversed + segmentLength < targetDistance) {
      traversed += segmentLength;
      continue;
    }

    const previous = points[index - 1];
    const current = points[index];
    const ratio = segmentLength > 0 ? clamp((targetDistance - traversed) / segmentLength, 0, 1) : 0;

    return {
      headingRad: Math.atan2(current.svgY - previous.svgY, current.svgX - previous.svgX),
      svgX: lerp(previous.svgX, current.svgX, ratio),
      svgY: lerp(previous.svgY, current.svgY, ratio),
    };
  }

  const last = points.at(-1);
  const previous = points.at(-2) ?? last;

  return last && previous
    ? {
        headingRad: Math.atan2(last.svgY - previous.svgY, last.svgX - previous.svgX),
        svgX: last.svgX,
        svgY: last.svgY,
      }
    : null;
}

function buildPitLaneVisualPath(points: PitLanePoint[]) {
  if (!points.length) {
    return "";
  }

  const visualPoints = points;

  if (visualPoints.length < 3) {
    return visualPoints
      .map((point, index) => `${index === 0 ? "M" : "L"}${point.svgX.toFixed(1)} ${point.svgY.toFixed(1)}`)
      .join(" ");
  }

  const commands = [`M${visualPoints[0].svgX.toFixed(1)} ${visualPoints[0].svgY.toFixed(1)}`];

  for (let index = 1; index < visualPoints.length - 1; index += 1) {
    const current = visualPoints[index];
    const next = visualPoints[index + 1];
    const midpoint = {
      svgX: (current.svgX + next.svgX) / 2,
      svgY: (current.svgY + next.svgY) / 2,
    };

    commands.push(
      `Q${current.svgX.toFixed(1)} ${current.svgY.toFixed(1)} ${midpoint.svgX.toFixed(1)} ${midpoint.svgY.toFixed(1)}`,
    );
  }

  const last = visualPoints[visualPoints.length - 1];
  commands.push(`T${last.svgX.toFixed(1)} ${last.svgY.toFixed(1)}`);

  return commands.join(" ");
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

function getProgressDelta(previous: number, next: number) {
  let delta = next - previous;

  if (delta < -0.5) {
    delta += 1;
  }

  if (delta > 0.5) {
    return null;
  }

  if (delta < 0) {
    return null;
  }

  return delta;
}

function lerp(previous: number, next: number, t: number) {
  return previous + (next - previous) * t;
}

function getRawHeading(previous: ReplayPositionEvent, next: ReplayPositionEvent) {
  const heading = Math.atan2(next.svgY - previous.svgY, next.svgX - previous.svgX);

  return Number.isFinite(heading) ? heading : previous.headingRad;
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
