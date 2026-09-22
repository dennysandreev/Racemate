"use client";
import dynamic from "next/dynamic";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useLive, useLiveStore } from "./live-provider";
import type {
  ReplayTrackCar,
  ReplayTrackId,
} from "@/features/race-replay/components/race-replay-zandvoort-3d";
import { Button } from "@/components/ui/button";
import {
  Crosshair,
  RotateCcw,
  RotateCw,
  ZoomIn,
  ZoomOut,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { TrackOrientationSphere } from "@/components/racemate/track-orientation-sphere";
import {
  clampTrackModelPan,
  normalizeDegrees,
  orbitTrackModelCamera,
  pinchTrackModelCamera,
  preserveTrackModelOrbitFocus,
  TRACK_MODEL_MIN_ZOOM,
  TRACK_MODEL_MAX_ZOOM,
  TRACK_MODEL_ZOOM_STEP,
  type TrackModelCameraState,
  zoomTrackModelAtPoint,
} from "@/lib/track-model-camera";
import { buildMarshalSectorPath } from "../lib/track-sectors";
const Track3D = dynamic(
  () =>
    import("@/features/race-replay/components/race-replay-zandvoort-3d").then(
      (m) => m.RaceReplayTrack3D,
    ),
  { ssr: false },
);
function modelId(name: string): ReplayTrackId | null {
  const matches: [RegExp, ReplayTrackId][] = [
    [/madr|ifema/i, "madring"],
    [/catal|barcel/i, "catalunya"],
    [/hungar|budapest/i, "hungaroring"],
    [/montreal|gilles/i, "montreal"],
    [/red bull|spielberg|austria/i, "red-bull-ring"],
    [/silverstone/i, "silverstone"],
    [/spa|francorchamps/i, "spa"],
    [/zandvoort/i, "zandvoort"],
  ];
  return matches.find(([pattern]) => pattern.test(name))?.[1] ?? null;
}
export const LiveTrack = memo(function LiveTrack({
  selected,
  onSelect,
}: {
  selected: number | null;
  onSelect: (n: number) => void;
}) {
  const track = useLive("track"),
    drivers = useLive("drivers"),
    flag = useLive("flag"),
    trackSectorCount = useLive("trackSectorCount"),
    yellowSectors = useLive("yellowSectors"),
    store = useLiveStore();
  const [mode, setMode] = useState("2d");
  const markers = useRef(new Map<number, SVGGElement>());
  useEffect(() => {
    let frame = 0;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let last = 0;
    const tick = (time: number) => {
      if (!reduced.matches || time - last > 250) {
        for (const [n, node] of markers.current) {
          const p = store.sample(n);
          if (!p) {
            node.style.visibility = "hidden";
            continue;
          }
          node.style.visibility = "visible";
          node.setAttribute("transform", `translate(${p.x},${p.y})`);
          node.style.opacity = p.stale ? "0.35" : "1";
        }
        last = time;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [store]);
  if (!track)
    return (
      <div className="live-empty">
        <p>Готовим карту трассы</p>
        <span>Тайминг и события появятся по мере поступления данных.</span>
      </div>
    );
  const id = modelId(`${track.circuitName} ${track.circuitKey}`);
  const mapPoints = [...track.centerline, ...(track.pitLane?.points ?? [])];
  const minX = Math.min(...mapPoints.map((p) => p.svgX)) - 65;
  const maxX = Math.max(...mapPoints.map((p) => p.svgX)) + 100;
  const minY = Math.min(...mapPoints.map((p) => p.svgY)) - 50;
  const maxY = Math.max(...mapPoints.map((p) => p.svgY)) + 50;
  const viewBox = mapPoints.length
    ? `${minX} ${minY} ${maxX - minX} ${maxY - minY}`
    : `0 0 ${track.svg.viewBox.width} ${track.svg.viewBox.height}`;
  const activeSectorPaths =
    flag === "YELLOW" && trackSectorCount
      ? yellowSectors
          .map((sector) => ({
            sector,
            path: buildMarshalSectorPath(
              track.centerline,
              sector,
              trackSectorCount,
              track.startFinish.progress,
            ),
          }))
          .filter((item) => item.path)
      : [];
  return (
    <div className="live-map">
      <div className="live-map-mode">
        <Button
          size="sm"
          variant={mode === "2d" ? "secondary" : "ghost"}
          onClick={() => setMode("2d")}
          aria-pressed={mode === "2d"}
        >
          2D
        </Button>
        {id && (
          <Button
            size="sm"
            variant={mode === "3d" ? "secondary" : "ghost"}
            onClick={() => setMode("3d")}
            aria-pressed={mode === "3d"}
          >
            3D
          </Button>
        )}
      </div>
      {mode === "3d" && id ? (
        <Animated3D trackId={id} selected={selected} onSelect={onSelect} />
      ) : (
        <svg
          viewBox={viewBox}
          aria-label={
            activeSectorPaths.length
              ? `Положение автомобилей на трассе. Жёлтый флаг: ${activeSectorPaths.map(({ sector }) => `сектор ${sector}`).join(", ")}`
              : "Положение автомобилей на трассе"
          }
          role="group"
        >
          <path
            d={track.svg.technicalPathD || track.svg.visualPathD}
            fill="none"
            stroke="var(--border)"
            strokeWidth="24"
            strokeLinejoin="round"
          />
          <path
            d={track.svg.technicalPathD || track.svg.visualPathD}
            fill="none"
            stroke="var(--muted-foreground)"
            strokeWidth="2"
            opacity=".6"
          />
          {activeSectorPaths.map(({ sector, path }) => (
            <g key={sector} aria-hidden="true">
              <path
                d={path}
                fill="none"
                stroke="#ffd400"
                strokeWidth="18"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity=".28"
              />
              <path
                d={path}
                fill="none"
                stroke="#ffe45c"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          ))}
          {track.pitLane && (
            <path
              d={track.pitLane.visualPathD}
              fill="none"
              stroke="var(--muted-foreground)"
              strokeWidth="3"
              strokeDasharray="5 5"
            />
          )}
          <circle
            cx={track.startFinish.svgX}
            cy={track.startFinish.svgY}
            r="5"
            fill="var(--foreground)"
          />
          {Object.values(drivers)
            .filter((d) => !["DNF", "DNS", "RETIRED", "DSQ"].includes(d.status))
            .map((d) => (
              <g
                key={d.driverNumber}
                ref={(node) => {
                  if (node) markers.current.set(d.driverNumber, node);
                  else markers.current.delete(d.driverNumber);
                }}
                role="button"
                tabIndex={0}
                aria-label={`Выбрать ${d.fullName}`}
                aria-pressed={d.driverNumber === selected}
                onClick={() => onSelect(d.driverNumber)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(d.driverNumber);
                  }
                }}
                className="live-car"
              >
                <circle
                  r={d.driverNumber === selected ? 13 : 9}
                  fill={d.teamColour}
                  stroke={
                    d.driverNumber === selected
                      ? "var(--foreground)"
                      : "var(--background)"
                  }
                  strokeWidth="3"
                />
                <text
                  x="16"
                  y="5"
                  fill="var(--foreground)"
                  stroke="var(--background)"
                  strokeWidth="5"
                  paintOrder="stroke"
                  fontSize="16"
                  fontWeight="700"
                >
                  {d.acronym}
                </text>
              </g>
            ))}
        </svg>
      )}
      <div className="live-map-caption">{track.circuitName}</div>
    </div>
  );
});
function Animated3D({
  trackId,
  selected,
  onSelect,
}: {
  trackId: ReplayTrackId;
  selected: number | null;
  onSelect: (n: number) => void;
}) {
  const store = useLiveStore();
  type LiveCameraState = {
    zoom: number;
    rotation: number;
    tilt: number;
    pan: { x: number; y: number };
  };
  const initialCamera: LiveCameraState = {
    zoom: 1,
    rotation: 0,
    tilt: 48,
    pan: { x: 0, y: 0 },
  };
  const [camera, setCamera] = useState(initialCamera);
  const [follow, setFollow] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    mode: "orbit" | "pan";
    pointerId: number;
    startPan: LiveCameraState["pan"];
    startRotation: number;
    startTilt: number;
    startX: number;
    startY: number;
  } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{
    startAngle: number;
    startCenter: { x: number; y: number };
    startDistance: number;
    startState: TrackModelCameraState;
  } | null>(null);
  const cameraRef = useRef(camera);
  const moved = useRef(false);
  const applyCamera = useCallback((next: LiveCameraState) => {
    cameraRef.current = next;
    setCamera(next);
  }, []);
  const zoomTo = useCallback(
    (requestedZoom: number, focalPoint = { x: 0, y: 0 }) => {
      const current = cameraRef.current;
      const nextZoom = Math.min(
        TRACK_MODEL_MAX_ZOOM,
        Math.max(TRACK_MODEL_MIN_ZOOM, requestedZoom),
      );
      if (nextZoom === current.zoom) return;
      const zoomed = zoomTrackModelAtPoint(current, nextZoom, focalPoint);
      applyCamera({ ...current, pan: zoomed.pan, zoom: zoomed.zoom });
    },
    [applyCamera],
  );
  const zoomBy = useCallback(
    (amount: number) => zoomTo(cameraRef.current.zoom + amount),
    [zoomTo],
  );
  const setOrbit = useCallback(
    (rotation: number, tilt: number) => {
      const current = cameraRef.current;
      const bounds = stage.current?.getBoundingClientRect();
      const pan = preserveTrackModelOrbitFocus({
        nextRotationDeg: rotation,
        nextTiltDeg: tilt,
        pan: current.pan,
        startRotationDeg: current.rotation,
        startTiltDeg: current.tilt,
        viewportAspectRatio: bounds ? bounds.width / bounds.height : 1,
        zoom: current.zoom,
      });
      applyCamera({ ...current, pan, rotation, tilt });
    },
    [applyCamera],
  );
  useEffect(() => {
    const node = stage.current;
    if (!node) return;
    const wheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      const bounds = node.getBoundingClientRect();
      const deltaUnit =
        e.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : e.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? bounds.height
            : 1;
      zoomTo(cameraRef.current.zoom * Math.exp(-e.deltaY * deltaUnit * 0.0015), {
        x: (e.clientX - bounds.left) / bounds.width - 0.5,
        y: (e.clientY - bounds.top) / bounds.height - 0.5,
      });
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, [zoomTo]);
  const beginDrag = (
    pointerId: number,
    pointer: { x: number; y: number },
    mode: "orbit" | "pan",
  ) => {
    const current = cameraRef.current;
    drag.current = {
      mode,
      pointerId,
      startPan: current.pan,
      startRotation: current.rotation,
      startTilt: current.tilt,
      startX: pointer.x,
      startY: pointer.y,
    };
  };
  const endPointer = (pointerId: number, element: HTMLDivElement) => {
    if (element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
    pointers.current.delete(pointerId);
    pinch.current = null;
    drag.current = null;
    if (pointers.current.size === 1) {
      const [remainingId, remainingPointer] = pointers.current.entries().next()
        .value as [number, { x: number; y: number }];
      beginDrag(remainingId, remainingPointer, "pan");
    }
  };
  const sampleCar = useCallback(
    (driverNumber: number): ReplayTrackCar | null => {
      const d = store.state.drivers[driverNumber];
      const p = store.sample(driverNumber);
      if (!d || !p) return null;
      return {
        abbreviation: d.acronym,
        driverNumber,
        fullName: d.fullName,
        isPitLane: p.pitLaneProgress != null,
        isSelected: driverNumber === selected,
        lateralOffset: 0,
        pitLaneProgress: p.pitLaneProgress ?? null,
        pitTrackProgress: p.pitTrackProgress,
        progress: p.progress,
        teamColor: d.teamColour,
      };
    },
    [store, selected],
  );
  const [cars, setCars] = useState<ReplayTrackCar[]>([]);
  useEffect(() => {
    const update = () =>
      setCars(
        Object.keys(store.state.drivers).flatMap((n) => {
          const car = sampleCar(Number(n));
          return car ? [car] : [];
        }),
      );
    const first = requestAnimationFrame(update);
    const timer = setInterval(update, 250);
    return () => {
      cancelAnimationFrame(first);
      clearInterval(timer);
    };
  }, [store, sampleCar]);
  return (
    <div
      ref={stage}
      className="live-3d-stage"
      tabIndex={0}
      aria-label="Интерактивная 3D-карта. Перетаскивайте пальцем или левой кнопкой мыши, чтобы двигать трассу. Правая кнопка или Shift и перетаскивание поворачивают модель. Колесо мыши или щипок меняют масштаб."
      onContextMenu={(e) => e.preventDefault()}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest("button, a")) return;
        const bounds = e.currentTarget.getBoundingClientRect();
        zoomTo(cameraRef.current.zoom + TRACK_MODEL_ZOOM_STEP * 2, {
          x: (e.clientX - bounds.left) / bounds.width - 0.5,
          y: (e.clientY - bounds.top) / bounds.height - 0.5,
        });
      }}
      onPointerDown={(e) => {
        if (
          (e.pointerType === "mouse" && e.button !== 0 && e.button !== 2) ||
          (e.target as Element).closest("button, a")
        )
          return;
        if (follow) setFollow(false);
        e.currentTarget.setPointerCapture(e.pointerId);
        moved.current = false;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.current.size >= 2) {
          const gesture = readPointerGesture(
            pointers.current,
            e.currentTarget.getBoundingClientRect(),
          );
          pinch.current = {
            startAngle: gesture.angle,
            startCenter: gesture.center,
            startDistance: gesture.distance,
            startState: {
              pan: cameraRef.current.pan,
              rotationDeg: cameraRef.current.rotation,
              zoom: cameraRef.current.zoom,
            },
          };
          drag.current = null;
          return;
        }
        beginDrag(
          e.pointerId,
          { x: e.clientX, y: e.clientY },
          e.pointerType === "mouse" && (e.button === 2 || e.shiftKey)
            ? "orbit"
            : "pan",
        );
      }}
      onPointerMove={(e) => {
        if (!pointers.current.has(e.pointerId)) return;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.current.size >= 2 && pinch.current) {
          const gesture = readPointerGesture(
            pointers.current,
            e.currentTarget.getBoundingClientRect(),
          );
          const next = pinchTrackModelCamera({
            currentAngle: gesture.angle,
            currentCenter: gesture.center,
            currentDistance: gesture.distance,
            maximumZoom: TRACK_MODEL_MAX_ZOOM,
            minimumZoom: TRACK_MODEL_MIN_ZOOM,
            startAngle: pinch.current.startAngle,
            startCenter: pinch.current.startCenter,
            startDistance: pinch.current.startDistance,
            startState: pinch.current.startState,
          });
          moved.current = true;
          applyCamera({
            ...cameraRef.current,
            pan: next.pan,
            rotation: next.rotationDeg,
            zoom: next.zoom,
          });
          return;
        }
        const start = drag.current;
        if (!start || start.pointerId !== e.pointerId) return;
        const dx = e.clientX - start.startX,
          dy = e.clientY - start.startY;
        if (Math.hypot(dx, dy) < 4) return;
        moved.current = true;
        if (start.mode === "pan") {
          const bounds = e.currentTarget.getBoundingClientRect();
          const pan = clampTrackModelPan(
            {
              x: start.startPan.x + dx / bounds.width,
              y: start.startPan.y + dy / bounds.height,
            },
            cameraRef.current.zoom,
          );
          applyCamera({ ...cameraRef.current, pan });
          return;
        }
        const next = orbitTrackModelCamera({
          deltaX: dx,
          deltaY: dy,
          startRotationDeg: start.startRotation,
          startTiltDeg: start.startTilt,
          minimumTiltDeg: 15,
          maximumTiltDeg: 85,
        });
        setOrbit(next.rotationDeg, next.tiltDeg);
      }}
      onPointerUp={(e) => {
        endPointer(e.pointerId, e.currentTarget);
      }}
      onPointerCancel={(e) => {
        endPointer(e.pointerId, e.currentTarget);
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (
          [
            "+",
            "=",
            "-",
            "ArrowLeft",
            "ArrowRight",
            "ArrowUp",
            "ArrowDown",
          ].includes(e.key)
        )
          e.preventDefault();
        if (e.key === "+" || e.key === "=") zoomBy(TRACK_MODEL_ZOOM_STEP);
        if (e.key === "-") zoomBy(-TRACK_MODEL_ZOOM_STEP);
        if (e.key.startsWith("Arrow"))
          setOrbit(
            normalizeDegrees(
              cameraRef.current.rotation +
                (e.key === "ArrowLeft" ? -15 : e.key === "ArrowRight" ? 15 : 0),
            ),
            Math.min(
              85,
              Math.max(
                15,
                cameraRef.current.tilt +
                  (e.key === "ArrowUp" ? -5 : e.key === "ArrowDown" ? 5 : 0),
              ),
            ),
          );
      }}
    >
      <Track3D
        cars={cars}
        sampleCar={sampleCar}
        followDriver={follow ? selected : null}
        onSelectDriver={(n) => {
          if (!moved.current) onSelect(n);
        }}
        panX={camera.pan.x}
        panY={camera.pan.y}
        rotationDeg={camera.rotation}
        tiltDeg={camera.tilt}
        trackId={trackId}
        zoom={camera.zoom}
      />
      <div className="live-camera-controls" aria-label="Камера">
        <Button
          size="icon"
          variant="secondary"
          title="Приблизить"
          aria-label="Приблизить трассу"
          disabled={camera.zoom >= TRACK_MODEL_MAX_ZOOM}
          onClick={() => zoomBy(TRACK_MODEL_ZOOM_STEP)}
        >
          <ZoomIn />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          title="Отдалить"
          aria-label="Отдалить трассу"
          disabled={camera.zoom <= TRACK_MODEL_MIN_ZOOM}
          onClick={() => zoomBy(-TRACK_MODEL_ZOOM_STEP)}
        >
          <ZoomOut />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          title="Повернуть влево"
          aria-label="Повернуть влево"
          onClick={() =>
            setOrbit(
              normalizeDegrees(cameraRef.current.rotation - 20),
              cameraRef.current.tilt,
            )
          }
        >
          <RotateCcw />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          title="Повернуть вправо"
          aria-label="Повернуть вправо"
          onClick={() =>
            setOrbit(
              normalizeDegrees(cameraRef.current.rotation + 20),
              cameraRef.current.tilt,
            )
          }
        >
          <RotateCw />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          title="Вид сверху"
          aria-label="Поднять камеру"
          onClick={() =>
            setOrbit(
              cameraRef.current.rotation,
              Math.min(85, cameraRef.current.tilt + 10),
            )
          }
        >
          <ChevronUp />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          title="Опустить камеру"
          aria-label="Опустить камеру"
          onClick={() =>
            setOrbit(
              cameraRef.current.rotation,
              Math.max(15, cameraRef.current.tilt - 10),
            )
          }
        >
          <ChevronDown />
        </Button>
        <Button
          size="icon"
          variant={follow ? "default" : "secondary"}
          aria-pressed={follow}
          disabled={selected === null}
          title="Следить за пилотом"
          aria-label="Следить за выбранным пилотом"
          onClick={() => setFollow((value) => !value)}
        >
          <Crosshair />
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            applyCamera(initialCamera);
            setFollow(false);
          }}
        >
          Сброс
        </Button>
      </div>
      <TrackOrientationSphere
        initialRotationDeg={0}
        initialTiltDeg={48}
        rotationDeg={camera.rotation}
        tiltDeg={camera.tilt}
        onChange={setOrbit}
      />
      <div className="live-camera-status" aria-live="polite">
        {follow
          ? `Камера за ${store.state.drivers[selected!]?.acronym ?? "пилотом"} · `
          : ""}
        {Math.round(camera.zoom * 100)}%
      </div>
    </div>
  );
}

function readPointerGesture(
  pointers: Map<number, { x: number; y: number }>,
  bounds: DOMRect,
) {
  const [first, second] = Array.from(pointers.values());
  const centerX = (first.x + second.x) / 2;
  const centerY = (first.y + second.y) / 2;

  return {
    angle: Math.atan2(second.y - first.y, second.x - first.x),
    center: {
      x: (centerX - bounds.left) / bounds.width - 0.5,
      y: (centerY - bounds.top) / bounds.height - 0.5,
    },
    distance: Math.hypot(second.x - first.x, second.y - first.y),
  };
}
