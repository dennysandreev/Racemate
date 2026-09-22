"use client";

import {
  Crosshair,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  RefreshCcw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import dynamic from "next/dynamic";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { TrackOrientationSphere } from "@/components/racemate/track-orientation-sphere";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TrackModelDefinition } from "@/data/track-model-types";
import {
  clampTrackModelPan,
  getTrackModelInitialZoom,
  normalizeDegrees,
  orbitTrackModelCamera,
  pinchTrackModelCamera,
  preserveTrackModelOrbitFocus,
  TRACK_MODEL_MAX_ZOOM,
  TRACK_MODEL_MIN_ZOOM,
  TRACK_MODEL_ZOOM_STEP,
  type TrackModelCameraState,
  type TrackModelPan,
  zoomTrackModelAtPoint,
} from "@/lib/track-model-camera";
import {
  createTrackModelScene,
  drawTrackModel,
  projectTrackModel,
  TRACK_MODEL_ROTATION_STEP,
  TRACK_MODEL_TILT_MAX,
  TRACK_MODEL_TILT_MIN,
  TRACK_MODEL_TILT_STEP,
  TRACK_MODEL_VIEW_SIZE,
  type TrackModelPalette,
} from "@/lib/track-model-renderer";
import { cn } from "@/lib/utils";

const TrackModelWebGL = dynamic(
  () => import("@/components/racemate/track-model-webgl").then((module) => module.TrackModelWebGL),
  {
    loading: () => null,
    ssr: false,
  },
);

export type TrackModel3DProps = {
  circuit: string;
  compact?: boolean;
  fill?: boolean;
  model: TrackModelDefinition;
};

const SECTOR_TOKEN_NAMES = [
  "--track-model-sector-1",
  "--track-model-sector-2",
  "--track-model-sector-3",
] as const;

export function TrackModel3D({
  circuit,
  compact = false,
  fill = false,
  model,
}: TrackModel3DProps) {
  const initialZoom = getTrackModelInitialZoom(
    Boolean(model.webgl),
    typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches,
  );
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [rotationDeg, setRotationDeg] = useState(model.camera.rotationDeg);
  const [tiltDeg, setTiltDeg] = useState(model.camera.tiltDeg);
  const [zoom, setZoom] = useState(initialZoom);
  const [pan, setPan] = useState<TrackModelPan>({ x: 0, y: 0 });

  const sharedViewportProps = {
    circuit,
    compact,
    initialZoom,
    model,
    pan,
    rotationDeg,
    setPan,
    setRotationDeg,
    setTiltDeg,
    setZoom,
    tiltDeg,
    zoom,
  };

  return (
    <>
      <TrackModelViewport
        {...sharedViewportProps}
        fill={fill}
        onFullscreenToggle={() => setIsFullscreenOpen(true)}
      />

      <Dialog onOpenChange={setIsFullscreenOpen} open={isFullscreenOpen}>
        <DialogContent
          className="h-[100dvh] w-screen max-w-none gap-0 overflow-hidden rounded-none border-0 bg-[var(--track-model-stage)] p-0 sm:max-w-none"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">Трасса {circuit} на весь экран</DialogTitle>
          <DialogDescription className="sr-only">
            Перемещай, поворачивай и приближай интерактивную модель трассы.
          </DialogDescription>
          <TrackModelViewport
            {...sharedViewportProps}
            fill
            fullscreen
            onFullscreenToggle={() => setIsFullscreenOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

type TrackModelViewportProps = TrackModel3DProps & {
  fullscreen?: boolean;
  initialZoom: number;
  onFullscreenToggle: () => void;
  pan: TrackModelPan;
  rotationDeg: number;
  setPan: Dispatch<SetStateAction<TrackModelPan>>;
  setRotationDeg: Dispatch<SetStateAction<number>>;
  setTiltDeg: Dispatch<SetStateAction<number>>;
  setZoom: Dispatch<SetStateAction<number>>;
  tiltDeg: number;
  zoom: number;
};

function TrackModelViewport({
  circuit,
  compact = false,
  fill = false,
  fullscreen = false,
  initialZoom,
  model,
  onFullscreenToggle,
  pan,
  rotationDeg,
  setPan,
  setRotationDeg,
  setTiltDeg,
  setZoom,
  tiltDeg,
  zoom,
}: TrackModelViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{
    mode: "orbit" | "pan";
    pointerId: number;
    startPan: TrackModelPan;
    startRotation: number;
    startTilt: number;
    startX: number;
    startY: number;
  } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{
    startAngle: number;
    startCenter: TrackModelPan;
    startDistance: number;
    startState: TrackModelCameraState;
  } | null>(null);
  const cameraStateRef = useRef<TrackModelCameraState>({ pan, rotationDeg, zoom });
  const tiltRef = useRef(tiltDeg);
  cameraStateRef.current = { pan, rotationDeg, zoom };
  tiltRef.current = tiltDeg;
  const [isDragging, setIsDragging] = useState(false);
  const scene = useMemo(() => createTrackModelScene(model), [model]);
  const projection = useMemo(
    () => projectTrackModel(scene, rotationDeg, zoom, tiltDeg, pan.x, pan.y),
    [pan.x, pan.y, rotationDeg, scene, tiltDeg, zoom],
  );
  const annotationOffsets = model.rendering.annotationOffsets;
  const rotationLabel = Math.round(normalizeDegrees(rotationDeg - model.camera.rotationDeg));
  const zoomLabel = Math.round(zoom * 100);
  const zoomTo = useCallback(
    (requestedZoom: number, focalPoint: TrackModelPan = { x: 0, y: 0 }) => {
      const current = cameraStateRef.current;
      const nextZoom = Math.min(
        TRACK_MODEL_MAX_ZOOM,
        Math.max(TRACK_MODEL_MIN_ZOOM, requestedZoom),
      );

      if (nextZoom === current.zoom) return;

      const next = zoomTrackModelAtPoint(current, nextZoom, focalPoint);
      cameraStateRef.current = { ...current, ...next };
      setPan(next.pan);
      setZoom(next.zoom);
    },
    [setPan, setZoom],
  );
  const changeZoom = useCallback(
    (delta: number, focalPoint: TrackModelPan = { x: 0, y: 0 }) => {
      zoomTo(cameraStateRef.current.zoom + delta, focalPoint);
    },
    [zoomTo],
  );

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const render = () =>
      drawTrackModel(
        canvas,
        scene,
        rotationDeg,
        readPalette(),
        zoom,
        tiltDeg,
        pan.x,
        pan.y,
      );
    const resizeObserver = new ResizeObserver(render);
    const themeObserver = new MutationObserver(render);

    resizeObserver.observe(canvas);
    themeObserver.observe(document.documentElement, {
      attributeFilter: ["data-theme"],
      attributes: true,
    });
    render();

    return () => {
      resizeObserver.disconnect();
      themeObserver.disconnect();
    };
  }, [pan.x, pan.y, rotationDeg, scene, tiltDeg, zoom]);

  useEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) {
        return;
      }

      event.preventDefault();
      const bounds = viewport.getBoundingClientRect();
      const deltaUnit = event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? bounds.height
          : 1;
      const zoomFactor = Math.exp(-event.deltaY * deltaUnit * 0.0015);
      zoomTo(cameraStateRef.current.zoom * zoomFactor, {
        x: (event.clientX - bounds.left) / bounds.width - 0.5,
        y: (event.clientY - bounds.top) / bounds.height - 0.5,
      });
    };

    viewport.addEventListener("wheel", handleWheel, { passive: false });

    return () => viewport.removeEventListener("wheel", handleWheel);
  }, [zoomTo]);

  function rotate(delta: number) {
    const nextRotation = normalizeDegrees(cameraStateRef.current.rotationDeg + delta);
    cameraStateRef.current = { ...cameraStateRef.current, rotationDeg: nextRotation };
    setRotationDeg(nextRotation);
  }

  function setOrbit(nextRotationDeg: number, nextTiltDeg: number) {
    const current = cameraStateRef.current;
    const viewportBounds = viewportRef.current?.getBoundingClientRect();
    const nextPan = preserveTrackModelOrbitFocus({
      nextRotationDeg,
      nextTiltDeg,
      pan: current.pan,
      startRotationDeg: current.rotationDeg,
      startTiltDeg: tiltRef.current,
      viewportAspectRatio: model.webgl && viewportBounds
        ? viewportBounds.width / viewportBounds.height
        : 1,
      zoom: current.zoom,
    });
    cameraStateRef.current = {
      ...current,
      pan: nextPan,
      rotationDeg: nextRotationDeg,
    };
    tiltRef.current = nextTiltDeg;
    setPan(nextPan);
    setRotationDeg(nextRotationDeg);
    setTiltDeg(nextTiltDeg);
  }

  function endPointer(pointerId: number, element: HTMLElement) {
    if (element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }

    pointersRef.current.delete(pointerId);
    pinchRef.current = null;
    dragRef.current = null;

    if (pointersRef.current.size === 1) {
      const [remainingId, remainingPointer] = pointersRef.current.entries().next().value as [
        number,
        { x: number; y: number },
      ];
      beginSingleDrag(remainingId, remainingPointer, "pan");
      return;
    }

    setIsDragging(false);
  }

  function beginSingleDrag(
    pointerId: number,
    pointer: { x: number; y: number },
    mode: "orbit" | "pan",
  ) {
    const current = cameraStateRef.current;
    dragRef.current = {
      mode,
      pointerId,
      startPan: current.pan,
      startRotation: current.rotationDeg,
      startTilt: tiltRef.current,
      startX: pointer.x,
      startY: pointer.y,
    };
    setIsDragging(true);
  }

  function resetView() {
    const reset = {
      pan: { x: 0, y: 0 },
      rotationDeg: model.camera.rotationDeg,
      zoom: initialZoom,
    };
    cameraStateRef.current = reset;
    tiltRef.current = model.camera.tiltDeg;
    setPan(reset.pan);
    setRotationDeg(reset.rotationDeg);
    setTiltDeg(model.camera.tiltDeg);
    setZoom(reset.zoom);
  }

  return (
    <figure
      aria-label={`Интерактивная 3D-модель трассы ${circuit} в реальном масштабе. Перетаскивай, чтобы перемещать трассу. Колесо мыши или щипок меняют масштаб; сфера ракурса, правая кнопка или Shift и перетаскивание поворачивают модель.`}
      className={cn(
        "@container/track relative isolate h-full min-h-0 w-full touch-none select-none overflow-hidden rounded bg-[var(--track-model-stage)] cursor-grab focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        isDragging && "cursor-grabbing",
        !fill && !compact && "min-h-[22rem] sm:min-h-[27rem]",
        fullscreen && "rounded-none",
      )}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          rotate(-TRACK_MODEL_ROTATION_STEP);
        }

        if (event.key === "ArrowRight") {
          event.preventDefault();
          rotate(TRACK_MODEL_ROTATION_STEP);
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          setTiltDeg((current) => Math.max(TRACK_MODEL_TILT_MIN, current - TRACK_MODEL_TILT_STEP));
        }

        if (event.key === "ArrowDown") {
          event.preventDefault();
          setTiltDeg((current) => Math.min(TRACK_MODEL_TILT_MAX, current + TRACK_MODEL_TILT_STEP));
        }

        if (event.key === "Home") {
          event.preventDefault();
          resetView();
        }

        if (event.key === "+" || event.key === "=") {
          event.preventDefault();
          changeZoom(TRACK_MODEL_ZOOM_STEP);
        }

        if (event.key === "-") {
          event.preventDefault();
          changeZoom(-TRACK_MODEL_ZOOM_STEP);
        }
      }}
      onContextMenu={(event) => event.preventDefault()}
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).closest("button, a")) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        changeZoom(TRACK_MODEL_ZOOM_STEP * 2, {
          x: (event.clientX - bounds.left) / bounds.width - 0.5,
          y: (event.clientY - bounds.top) / bounds.height - 0.5,
        });
      }}
      onPointerCancel={(event) => endPointer(event.pointerId, event.currentTarget)}
      onPointerDown={(event) => {
        if (
          (event.pointerType === "mouse" && event.button !== 0 && event.button !== 2) ||
          (event.target as HTMLElement).closest("button, a")
        ) {
          return;
        }

        event.currentTarget.setPointerCapture(event.pointerId);
        pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

        if (pointersRef.current.size >= 2) {
          const gesture = readPointerGesture(
            pointersRef.current,
            event.currentTarget.getBoundingClientRect(),
          );
          pinchRef.current = {
            startAngle: gesture.angle,
            startCenter: gesture.center,
            startDistance: gesture.distance,
            startState: cameraStateRef.current,
          };
          dragRef.current = null;
          setIsDragging(true);
          return;
        }

        beginSingleDrag(
          event.pointerId,
          { x: event.clientX, y: event.clientY },
          event.pointerType === "mouse" && (event.button === 2 || event.shiftKey)
            ? "orbit"
            : "pan",
        );
      }}
      onPointerMove={(event) => {
        if (!pointersRef.current.has(event.pointerId)) return;

        pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

        if (pointersRef.current.size >= 2 && pinchRef.current) {
          const gesture = readPointerGesture(
            pointersRef.current,
            event.currentTarget.getBoundingClientRect(),
          );
          const next = pinchTrackModelCamera({
            currentAngle: gesture.angle,
            currentCenter: gesture.center,
            currentDistance: gesture.distance,
            maximumZoom: TRACK_MODEL_MAX_ZOOM,
            minimumZoom: TRACK_MODEL_MIN_ZOOM,
            startAngle: pinchRef.current.startAngle,
            startCenter: pinchRef.current.startCenter,
            startDistance: pinchRef.current.startDistance,
            startState: pinchRef.current.startState,
          });
          cameraStateRef.current = next;
          setPan(next.pan);
          setRotationDeg(next.rotationDeg);
          setZoom(next.zoom);
          return;
        }

        const drag = dragRef.current;

        if (!drag || drag.pointerId !== event.pointerId) {
          return;
        }

        if (drag.mode === "pan") {
          const bounds = event.currentTarget.getBoundingClientRect();
          const nextPan = clampTrackModelPan(
            {
              x: drag.startPan.x + (event.clientX - drag.startX) / bounds.width,
              y: drag.startPan.y + (event.clientY - drag.startY) / bounds.height,
            },
            cameraStateRef.current.zoom,
          );
          cameraStateRef.current = { ...cameraStateRef.current, pan: nextPan };
          setPan(nextPan);
          return;
        }

        const next = orbitTrackModelCamera({
          deltaX: event.clientX - drag.startX,
          deltaY: event.clientY - drag.startY,
          maximumTiltDeg: TRACK_MODEL_TILT_MAX,
          minimumTiltDeg: TRACK_MODEL_TILT_MIN,
          startRotationDeg: drag.startRotation,
          startTiltDeg: drag.startTilt,
        });
        setOrbit(next.rotationDeg, next.tiltDeg);
      }}
      onPointerUp={(event) => endPointer(event.pointerId, event.currentTarget)}
      ref={viewportRef}
      tabIndex={0}
    >
      {model.webgl ? (
        <TrackModelWebGL
          assetPath={model.webgl.assetPath}
          camera={model.webgl.camera}
          circuit={circuit}
          elevationDatumLabel={model.webgl.elevationDatumLabel}
          panX={pan.x}
          panY={pan.y}
          previewPath={model.webgl.previewPath}
          rotationDeg={rotationDeg}
          showElevationAnchors={fullscreen}
          tiltDeg={tiltDeg}
          turnCount={model.webgl.turnCount}
          zoom={zoom}
        />
      ) : (
        <canvas aria-hidden="true" className="absolute inset-0 size-full" ref={canvasRef} />
      )}

      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0",
          model.webgl && "hidden",
        )}
      >
        <span
          aria-label="Спид-трап"
          className="absolute flex -translate-x-1/2 -translate-y-[210%] items-center gap-1 rounded-sm border border-[var(--track-model-speed-trap)] bg-[var(--track-model-speed-trap-bg)] px-1.5 py-1 font-mono text-[0.56rem] font-bold text-[var(--track-model-speed-trap-text)] shadow-sm sm:-translate-y-[150%]"
          style={{
            left: annotationPosition(
              projection.speedTrap.x,
              annotationOffsets?.speedTrap?.[0],
            ),
            top: annotationPosition(
              projection.speedTrap.y,
              annotationOffsets?.speedTrap?.[1],
            ),
          }}
          title="Спид-трап"
        >
          <Crosshair aria-hidden="true" className="size-3" />
          ST
        </span>

        <span
          className={cn(
            "absolute translate-x-[10%] -translate-y-[220%] whitespace-nowrap rounded border border-[var(--track-model-height-border)] bg-[var(--track-model-height-bg)] px-2 py-1.5 text-left text-[0.6rem] font-semibold leading-tight text-[var(--track-model-height-text)] shadow-sm sm:-translate-y-[180%]",
            model.webgl && "hidden @md/track:block",
          )}
          style={{
            left: annotationPosition(
              projection.highPoint.x,
              annotationOffsets?.highPoint?.[0],
            ),
            top: annotationPosition(
              projection.highPoint.y,
              annotationOffsets?.highPoint?.[1],
            ),
          }}
        >
          <strong className="block font-mono text-xs">+{model.data.elevationChangeM} м</strong>
        </span>

        <span
          className={cn(
            "absolute whitespace-nowrap rounded border border-[var(--track-model-height-border)] bg-[var(--track-model-height-bg)] px-2 py-1.5 text-left text-[0.6rem] font-semibold leading-tight text-[var(--track-model-height-text)] shadow-sm",
            model.webgl ? "hidden" : "hidden @md/track:block",
          )}
          style={{
            left: annotationPosition(
              projection.lowPoint.x,
              annotationOffsets?.lowPoint?.[0],
            ),
            top: annotationPosition(
              projection.lowPoint.y,
              annotationOffsets?.lowPoint?.[1],
            ),
            transform: "translate(-110%, 18%)",
          }}
        >
          <strong className="block font-mono text-xs">0 м</strong>
        </span>
      </div>

      <TrackOrientationSphere
        initialRotationDeg={model.camera.rotationDeg}
        initialTiltDeg={model.camera.tiltDeg}
        onChange={setOrbit}
        rotationDeg={rotationDeg}
        tiltDeg={tiltDeg}
      />

      <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
        <Button
          aria-label="Отдалить трассу"
          className="size-11 sm:size-10"
          disabled={zoom <= TRACK_MODEL_MIN_ZOOM}
          onClick={() => changeZoom(-TRACK_MODEL_ZOOM_STEP)}
          size="icon"
          type="button"
          variant="secondary"
        >
          <Minus aria-hidden="true" data-icon="inline-start" />
        </Button>
        <Button
          aria-label="Вернуть исходный ракурс"
          className="size-11 sm:size-10"
          disabled={
            rotationDeg === model.camera.rotationDeg &&
            tiltDeg === model.camera.tiltDeg &&
            zoom === initialZoom &&
            pan.x === 0 &&
            pan.y === 0
          }
          onClick={resetView}
          size="icon"
          type="button"
          variant="secondary"
        >
          <RefreshCcw aria-hidden="true" data-icon="inline-start" />
        </Button>
        <Button
          aria-label="Приблизить трассу"
          className="size-11 sm:size-10"
          disabled={zoom >= TRACK_MODEL_MAX_ZOOM}
          onClick={() => changeZoom(TRACK_MODEL_ZOOM_STEP)}
          size="icon"
          type="button"
          variant="secondary"
        >
          <Plus aria-hidden="true" data-icon="inline-start" />
        </Button>
        <Button
          aria-label={fullscreen ? "Закрыть полноэкранный просмотр" : "Открыть трассу на весь экран"}
          className="size-11 sm:size-10"
          onClick={onFullscreenToggle}
          size="icon"
          type="button"
          variant="secondary"
        >
          {fullscreen ? (
            <Minimize2 aria-hidden="true" data-icon="inline-start" />
          ) : (
            <Maximize2 aria-hidden="true" data-icon="inline-start" />
          )}
        </Button>
      </div>

      <figcaption className="absolute bottom-1 left-2 right-2 z-30 flex flex-wrap items-end gap-1.5 @sm/track:flex-nowrap sm:gap-2">
        <div className="flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded border border-border bg-background/90 px-2 text-[0.68rem] font-bold text-foreground shadow-sm sm:px-2.5">
          {SECTOR_TOKEN_NAMES.map((token, index) => (
            <span className="flex items-center gap-1.5" key={token}>
              <span
                aria-hidden="true"
                className="size-2 rounded-sm"
                style={{ backgroundColor: `var(${token})` }}
              />
              S{index + 1}
            </span>
          ))}
        </div>

        <div className="flex h-9 min-w-0 basis-full grow items-center justify-center gap-1.5 rounded border border-border bg-background/90 px-2 text-xs font-semibold text-foreground shadow-sm @sm/track:basis-0 @md/track:min-w-64 @md/track:basis-[17rem] @md/track:px-2.5">
          <span className="shrink-0 whitespace-nowrap font-mono font-bold">
            {model.data.lapLengthKm.toLocaleString("ru-RU", {
              maximumFractionDigits: 3,
              minimumFractionDigits: 3,
            })} км
          </span>
          <span aria-hidden="true" className="h-4 w-px shrink-0 bg-border" />
          <ElevationProfile approximate={model.webgl?.elevationApproximate} scene={scene} />
          {!model.webgl?.elevationApproximate && <>
          <span className="hidden shrink-0 items-center gap-1 whitespace-nowrap @lg/track:flex">
            <TrendingUp aria-hidden="true" className="size-3.5" />
            {model.data.maxUphillPercent.toLocaleString("ru-RU")}%
          </span>
          <span className="hidden shrink-0 items-center gap-1 whitespace-nowrap @lg/track:flex">
            <TrendingDown aria-hidden="true" className="size-3.5" />
            {model.data.maxDownhillPercent.toLocaleString("ru-RU")}%
          </span>
          </>}
        </div>
      </figcaption>

      <span aria-live="polite" className="sr-only">
        Ракурс повёрнут на {rotationLabel}°, наклон {Math.round(tiltDeg)}°, масштаб {zoomLabel}%
      </span>
    </figure>
  );
}

function ElevationProfile({ approximate = false, scene }: { approximate?: boolean; scene: ReturnType<typeof createTrackModelScene> }) {
  const width = 122;
  const height = 30;
  const minElevation = scene.lowPoint.elevationM;
  const maxElevation = scene.highPoint.elevationM;
  const range = Math.max(maxElevation - minElevation, 1);
  const samples = scene.track.filter((_, index) => index % 5 === 0);
  const line = samples
    .map((point, index) => {
      const x = (index / Math.max(samples.length - 1, 1)) * width;
      const y = height - 3 - ((point.elevationM - minElevation) / range) * (height - 7);
      return `${index === 0 ? "M" : "L"}${round(x)} ${round(y)}`;
    })
    .join(" ");

  return (
    <span className="flex min-w-0 shrink-0 items-center gap-1.5" title={approximate ? "Высоты приблизительные: по спутниковой модели рельефа" : undefined}>
      {approximate && <span aria-label="Приблизительный перепад высот">≈</span>}
      <span className="hidden text-muted-foreground @md/track:inline">Перепад</span>
      <svg
        aria-hidden="true"
        className="h-5 w-16 min-w-12 @md/track:h-6 @md/track:w-28"
        viewBox={`0 0 ${width} ${height}`}
      >
        <path
          d={`${line} L${width} ${height} L0 ${height} Z`}
          fill="var(--track-model-profile-fill)"
        />
        <path
          d={line}
          fill="none"
          stroke="var(--track-model-profile-line)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
      <strong className="shrink-0 whitespace-nowrap font-mono">
        {scene.definition.data.elevationChangeM} м
      </strong>
    </span>
  );
}

function readPalette(): TrackModelPalette {
  const styles = getComputedStyle(document.documentElement);
  const value = (token: string) => styles.getPropertyValue(token).trim();

  return {
    asphalt: value("--track-model-asphalt"),
    asphaltEdge: value("--track-model-asphalt-edge"),
    asphaltHighlight: value("--track-model-asphalt-highlight"),
    contour: value("--track-model-contour"),
    curbRed: value("--track-model-curb-red"),
    curbWhite: value("--track-model-curb-white"),
    fog: value("--track-model-fog"),
    grassHigh: value("--track-model-grass-high"),
    grassLow: value("--track-model-grass-low"),
    gravel: value("--track-model-gravel"),
    runoff: value("--track-model-runoff"),
    sectorOne: value("--track-model-sector-1"),
    sectorThree: value("--track-model-sector-3"),
    sectorTwo: value("--track-model-sector-2"),
    shadow: value("--track-model-shadow"),
    skyBottom: value("--track-model-sky-bottom"),
    skyTop: value("--track-model-sky-top"),
    slab: value("--track-model-slab"),
    speedTrap: value("--track-model-speed-trap"),
    turnBackground: value("--track-model-turn-bg"),
    turnBorder: value("--track-model-turn-line"),
    turnText: value("--track-model-turn-text"),
  };
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

function annotationPosition(projectedPosition: number, offset = 0) {
  const percentage = (projectedPosition / TRACK_MODEL_VIEW_SIZE) * 100;

  return offset === 0 ? `${percentage}%` : `calc(${percentage}% + ${offset}px)`;
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}
