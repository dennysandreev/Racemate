"use client";

import * as Sentry from "@sentry/nextjs";
import { Line } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CanvasTexture,
  Color,
  MathUtils,
  NoColorSpace,
  PerspectiveCamera,
  Quaternion,
  SRGBColorSpace,
  type Sprite,
  type SpriteMaterial,
  Spherical,
  Texture,
  TextureLoader,
  Vector3,
} from "three";

import {
  SEASON_GLOBE_MARKER_RADIUS,
  buildSeasonGlobeRouteSegments,
  getSeasonGlobeCameraDistances,
  getSeasonGlobeMarkerOpacity,
  getSeasonGlobeMarkerHoverScale,
  getSeasonGlobeMarkerScaleFactor,
  getSeasonGlobeMarkerViewportScale,
  getSeasonGlobeZoomSensitivity,
  hasGlobeCoordinates,
  latLngToVector3,
} from "@/lib/season-globe-geometry";
import type { SeasonGlobeEvent, SeasonGlobePhase } from "@/types/racemate";

type SeasonGlobeSceneProps = {
  events: SeasonGlobeEvent[];
  onFailure: () => void;
  onOpenSelected: () => void;
  onSelectRelative: (offset: number) => void;
  onSelectRound: (round: number) => void;
  onSelectNext: () => void;
  selectedRound: number;
  season: number;
};

type CameraRigHandle = {
  rotateBy: (deltaX: number, deltaY: number) => void;
  zoomBy: (delta: number) => void;
};

type MarkerPickerHandle = {
  pickRound: (
    clientX: number,
    clientY: number,
    bounds: Pick<DOMRect, "height" | "left" | "top" | "width">,
    hitRadius: number,
  ) => number | null;
};

type PointerSnapshot = {
  pointerType: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
};

type GestureMode = "idle" | "pending" | "rotate" | "pinch";

type GlobePalette = {
  border: string;
  hostLand: string;
  land: string;
  markerCompleted: string;
  markerCompletedText: string;
  markerNext: string;
  markerNextText: string;
  markerSelected: string;
  markerUpcoming: string;
  markerUpcomingText: string;
  ocean: string;
  routeCompleted: string;
  routeNext: string;
  routeUpcoming: string;
  routeUpcomingOutline: string;
};

const defaultPalette: GlobePalette = {
  border: "#a49f9d",
  hostLand: "#82504c",
  land: "#5b605f",
  markerCompleted: "#9b9f9e",
  markerCompletedText: "#0b0d0d",
  markerNext: "#e10600",
  markerNextText: "#fff7f6",
  markerSelected: "#f2ecea",
  markerUpcoming: "#d6aaa2",
  markerUpcomingText: "#231817",
  ocean: "#101718",
  routeCompleted: "#6d7372",
  routeNext: "#e10600",
  routeUpcoming: "#9b625d",
  routeUpcomingOutline: "#271b1a",
};

const worldUp = new Vector3(0, 1, 0);

export function SeasonGlobeScene({
  events,
  onFailure,
  onOpenSelected,
  onSelectRelative,
  onSelectRound,
  onSelectNext,
  selectedRound,
  season,
}: SeasonGlobeSceneProps) {
  const cameraRigRef = useRef<CameraRigHandle>(null);
  const markerPickerRef = useRef<MarkerPickerHandle>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef(new Map<number, PointerSnapshot>());
  const gestureModeRef = useRef<GestureMode>("idle");
  const lastPinchDistanceRef = useRef<number | null>(null);
  const didDragRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredRound, setHoveredRound] = useState<number | null>(null);
  const palette = useSeasonGlobePalette();
  const reduceMotion = useReducedMotionPreference();
  const initialCue = useMemo(() => shouldRunInitialCue(season), [season]);
  const selectedEvent = events.find((event) => event.round === selectedRound) ?? null;

  useEffect(() => {
    const element = rootRef.current;

    if (!element) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      cameraRigRef.current?.zoomBy(event.deltaY * 0.0018);
    };

    element.addEventListener("wheel", handleWheel, { passive: false });

    return () => element.removeEventListener("wheel", handleWheel);
  }, []);

  const endPointer = (
    event: React.PointerEvent<HTMLDivElement>,
    allowSelection: boolean,
  ) => {
    const pointer = pointersRef.current.get(event.pointerId);
    const canSelect =
      allowSelection &&
      pointer !== undefined &&
      pointersRef.current.size === 1 &&
      !didDragRef.current &&
      Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) < 5;

    if (canSelect) {
      const bounds = event.currentTarget.getBoundingClientRect();
      const round = markerPickerRef.current?.pickRound(
        event.clientX,
        event.clientY,
        bounds,
        event.pointerType === "touch" ? 28 : 20,
      );

      if (round !== null && round !== undefined) {
        onSelectRound(round);
      }
    }

    pointersRef.current.delete(event.pointerId);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (!pointersRef.current.size) {
      gestureModeRef.current = "idle";
      lastPinchDistanceRef.current = null;
      setIsDragging(false);
      window.setTimeout(() => {
        didDragRef.current = false;
      }, 0);
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    didDragRef.current = false;
    setHoveredRound(null);
    pointersRef.current.set(event.pointerId, {
      pointerType: event.pointerType,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
    });

    if (pointersRef.current.size === 2) {
      gestureModeRef.current = "pinch";
      lastPinchDistanceRef.current = getPointerDistance(pointersRef.current);
      didDragRef.current = true;
      setIsDragging(true);
      capturePointer(event.currentTarget, event.pointerId);
      return;
    }

    gestureModeRef.current = "pending";

    if (event.pointerType === "mouse") {
      capturePointer(event.currentTarget, event.pointerId);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const pointer = pointersRef.current.get(event.pointerId);

    if (!pointer) {
      if (event.pointerType === "mouse") {
        const bounds = event.currentTarget.getBoundingClientRect();
        const round = markerPickerRef.current?.pickRound(
          event.clientX,
          event.clientY,
          bounds,
          20,
        );
        setHoveredRound(round ?? null);
      }

      return;
    }

    const previousX = pointer.x;
    const previousY = pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;

    if (pointersRef.current.size >= 2) {
      event.preventDefault();
      gestureModeRef.current = "pinch";
      didDragRef.current = true;
      setIsDragging(true);
      capturePointer(event.currentTarget, event.pointerId);

      const distance = getPointerDistance(pointersRef.current);
      const previousDistance = lastPinchDistanceRef.current ?? distance;
      cameraRigRef.current?.zoomBy((previousDistance - distance) * 0.008);
      lastPinchDistanceRef.current = distance;
      return;
    }

    const totalX = event.clientX - pointer.startX;
    const totalY = event.clientY - pointer.startY;

    if (gestureModeRef.current === "pending") {
      if (Math.hypot(totalX, totalY) < 5) {
        return;
      }

      gestureModeRef.current = "rotate";
      didDragRef.current = true;
      setIsDragging(true);
      capturePointer(event.currentTarget, event.pointerId);
    }

    if (gestureModeRef.current !== "rotate") {
      return;
    }

    event.preventDefault();
    cameraRigRef.current?.rotateBy(event.clientX - previousX, event.clientY - previousY);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      onSelectRelative(event.key === "ArrowLeft" ? -1 : 1);
      return;
    }

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      cameraRigRef.current?.zoomBy(event.key === "ArrowUp" ? -0.24 : 0.24);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      onSelectNext();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      onOpenSelected();
      return;
    }

    if (event.key === "Escape") {
      event.currentTarget.blur();
    }
  };

  return (
    <div
      aria-label={`Маршрут сезона Formula 1 ${season}. Используйте стрелки, чтобы выбрать этап.`}
      className="season-globe-focus-target relative h-full min-h-0 w-full focus-visible:outline-none"
      onKeyDown={handleKeyDown}
      onPointerCancel={(event) => endPointer(event, false)}
      onPointerDown={handlePointerDown}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") {
          setHoveredRound(null);
        }
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => endPointer(event, true)}
      ref={rootRef}
      role="application"
      style={{
        cursor: isDragging ? "grabbing" : hoveredRound !== null ? "pointer" : "grab",
        touchAction: "none",
      }}
      tabIndex={0}
    >
      <Canvas
        camera={{ far: 100, fov: 38, near: 0.1, position: [0, 0, 3.25] }}
        dpr={[1, 1.5]}
        frameloop="demand"
        gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
        style={{ background: "transparent" }}
      >
        <ContextLossMonitor onFailure={onFailure} />
        <GlobeSurface palette={palette} />
        <SeasonRoute events={events} palette={palette} />
        <MarkerPicker events={events} ref={markerPickerRef} />
        <GrandPrixMarkers
          events={events}
          hoveredRound={hoveredRound}
          palette={palette}
          reduceMotion={reduceMotion}
          selectedRound={selectedRound}
        />
        <CameraRig
          event={selectedEvent}
          initialCue={initialCue}
          ref={cameraRigRef}
        />
      </Canvas>
    </div>
  );
}

function GlobeSurface({ palette }: { palette: GlobePalette }) {
  const { invalidate } = useThree();
  const [maskTexture, setMaskTexture] = useState<Texture | null>(null);
  const uniforms = useMemo(
    () => ({
      borderColor: { value: new Color(palette.border) },
      hasMask: { value: Boolean(maskTexture) },
      hostLandColor: { value: new Color(palette.hostLand) },
      landColor: { value: new Color(palette.land) },
      maskMap: { value: maskTexture },
      oceanColor: { value: new Color(palette.ocean) },
    }),
    [maskTexture, palette.border, palette.hostLand, palette.land, palette.ocean],
  );

  useEffect(() => {
    let active = true;
    const loader = new TextureLoader();

    loader.load(
      "/geo/world-admin0-110m-mask.webp",
      (texture) => {
        if (!active) {
          texture.dispose();
          return;
        }

        texture.colorSpace = NoColorSpace;
        texture.anisotropy = 4;
        setMaskTexture(texture);
        invalidate();
      },
      undefined,
      (error) => {
        Sentry.captureException(error, { tags: { asset: "season-globe-country-mask" } });
        invalidate();
      },
    );

    return () => {
      active = false;
    };
  }, [invalidate]);

  useEffect(() => invalidate(), [invalidate, uniforms]);

  useEffect(
    () => () => {
      maskTexture?.dispose();
    },
    [maskTexture],
  );

  return (
    <mesh>
      <sphereGeometry args={[1, 72, 48]} />
      <shaderMaterial
        fragmentShader={globeFragmentShader}
        toneMapped={false}
        uniforms={uniforms}
        vertexShader={globeVertexShader}
      />
    </mesh>
  );
}

function SeasonRoute({ events, palette }: { events: SeasonGlobeEvent[]; palette: GlobePalette }) {
  const segments = useMemo(() => buildSeasonGlobeRouteSegments(events), [events]);

  return segments.map((segment) => {
    const style = getRouteStyle(segment.phase, palette);

    return (
      <group key={`${segment.fromRound}:${segment.toRound}`}>
        {segment.phase === "upcoming" ? (
          <Line
            color={palette.routeUpcomingOutline}
            dashSize={style.dashSize}
            dashed
            depthTest
            depthWrite={false}
            gapSize={style.gapSize}
            lineWidth={style.width + 1.8}
            opacity={0.92}
            points={segment.points}
            renderOrder={1}
            transparent
          />
        ) : null}
        <Line
          color={style.color}
          dashSize={style.dashSize}
          dashed={style.dashed}
          depthTest
          depthWrite={false}
          gapSize={style.gapSize}
          lineWidth={style.width}
          opacity={style.opacity}
          points={segment.points}
          renderOrder={1.1}
          transparent
        />
      </group>
    );
  });
}

function GrandPrixMarkers({
  events,
  hoveredRound,
  palette,
  reduceMotion,
  selectedRound,
}: {
  events: SeasonGlobeEvent[];
  hoveredRound: number | null;
  palette: GlobePalette;
  reduceMotion: boolean;
  selectedRound: number;
}) {
  return events
    .filter(
      (event): event is SeasonGlobeEvent & { latitude: number; longitude: number } =>
        hasGlobeCoordinates(event),
    )
    .map((event) => (
      <GrandPrixMarker
        event={event}
        hovered={event.round === hoveredRound}
        key={event.id}
        palette={palette}
        reduceMotion={reduceMotion}
        selected={event.round === selectedRound}
      />
    ));
}

function GrandPrixMarker({
  event,
  hovered,
  palette,
  reduceMotion,
  selected,
}: {
  event: SeasonGlobeEvent & { latitude: number; longitude: number };
  hovered: boolean;
  palette: GlobePalette;
  reduceMotion: boolean;
  selected: boolean;
}) {
  const { invalidate } = useThree();
  const cameraSpacePositionRef = useRef(new Vector3());
  const hoverScaleRef = useRef(1);
  const materialRef = useRef<SpriteMaterial>(null);
  const spriteRef = useRef<Sprite>(null);
  const position = useMemo(
    () => latLngToVector3(event.latitude, event.longitude, SEASON_GLOBE_MARKER_RADIUS),
    [event.latitude, event.longitude],
  );
  const surfaceNormal = useMemo(() => position.clone().normalize(), [position]);
  const color = getMarkerColor(event.phase, palette);
  const labelColor = getMarkerLabelColor(event.phase, palette);
  const markerSize = selected ? 0.07 : event.phase === "next" ? 0.06 : 0.05;
  const markerTexture = useSeasonGlobeMarkerTexture({
    backgroundColor: color,
    borderColor: palette.markerSelected,
    labelColor,
    round: event.round,
    selected,
  });

  useEffect(() => invalidate(), [hovered, invalidate]);

  useFrame(({ camera, size }, delta) => {
    const cameraDistance = camera.position.length();
    const markerDepth = -cameraSpacePositionRef.current
      .copy(position)
      .applyMatrix4(camera.matrixWorldInverse).z;
    const baseScale =
      markerSize *
      getSeasonGlobeMarkerScaleFactor(markerDepth) *
      getSeasonGlobeMarkerViewportScale(size.height);
    const targetHoverScale = getSeasonGlobeMarkerHoverScale(hovered);
    const hoverScale = reduceMotion
      ? targetHoverScale
      : MathUtils.damp(hoverScaleRef.current, targetHoverScale, 20, delta);
    const scale = baseScale * hoverScale;
    const opacity = getSeasonGlobeMarkerOpacity(
      cameraDistance,
      surfaceNormal.dot(camera.position) / cameraDistance,
    );

    if (spriteRef.current) {
      spriteRef.current.visible = opacity > 0.01;

      if (Math.abs(spriteRef.current.scale.x - scale) > 0.0001) {
        spriteRef.current.scale.set(scale, scale, 1);
      }
    }

    hoverScaleRef.current = hoverScale;

    if (!reduceMotion && Math.abs(hoverScale - targetHoverScale) > 0.001) {
      invalidate();
    }

    if (materialRef.current) {
      materialRef.current.opacity = opacity;
    }
  });

  return (
    <sprite
      position={position}
      ref={spriteRef}
      renderOrder={event.phase === "next" ? 4 : selected || hovered ? 3 : 2}
      scale={[markerSize, markerSize, 1]}
    >
      <spriteMaterial
        alphaTest={0.04}
        depthTest={false}
        depthWrite={false}
        map={markerTexture}
        ref={materialRef}
        toneMapped={false}
        transparent
      />
    </sprite>
  );
}

const MarkerPicker = forwardRef<MarkerPickerHandle, { events: SeasonGlobeEvent[] }>(
  function MarkerPicker({ events }, ref) {
    const { camera } = useThree();
    const positionedEvents = useMemo(
      () =>
        events
          .filter(
            (event): event is SeasonGlobeEvent & { latitude: number; longitude: number } =>
              hasGlobeCoordinates(event),
          )
          .map((event) => ({
            position: latLngToVector3(
              event.latitude,
              event.longitude,
              SEASON_GLOBE_MARKER_RADIUS,
            ),
            round: event.round,
          })),
      [events],
    );

    useImperativeHandle(
      ref,
      () => ({
        pickRound(clientX, clientY, bounds, hitRadius) {
          camera.updateMatrixWorld();
          const cameraDirection = camera.position.clone().normalize();
          const cameraDistance = camera.position.length();
          let closest: { distance: number; round: number } | null = null;

          for (const event of positionedEvents) {
            const facing = event.position.clone().normalize().dot(cameraDirection);

            if (getSeasonGlobeMarkerOpacity(cameraDistance, facing) <= 0.05) {
              continue;
            }

            const projected = event.position.clone().project(camera);

            if (projected.z < -1 || projected.z > 1) {
              continue;
            }

            const x = bounds.left + ((projected.x + 1) / 2) * bounds.width;
            const y = bounds.top + ((1 - projected.y) / 2) * bounds.height;
            const distance = Math.hypot(clientX - x, clientY - y);

            if (distance <= hitRadius && (!closest || distance < closest.distance)) {
              closest = { distance, round: event.round };
            }
          }

          return closest?.round ?? null;
        },
      }),
      [camera, positionedEvents],
    );

    return null;
  },
);

function useSeasonGlobeMarkerTexture({
  backgroundColor,
  borderColor,
  labelColor,
  round,
  selected,
}: {
  backgroundColor: string;
  borderColor: string;
  labelColor: string;
  round: number;
  selected: boolean;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    canvas.height = 128;
    canvas.width = 128;

    if (!context) {
      return new CanvasTexture(canvas);
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.beginPath();
    context.arc(64, 64, selected ? 57 : 54, 0, Math.PI * 2);
    context.fillStyle = backgroundColor;
    context.fill();

    context.lineWidth = selected ? 8 : 4;
    context.strokeStyle = borderColor;
    context.stroke();

    context.fillStyle = labelColor;
    context.font = `900 ${round >= 10 ? 56 : 64}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(String(round), 64, 67);

    const markerTexture = new CanvasTexture(canvas);
    markerTexture.colorSpace = SRGBColorSpace;
    markerTexture.needsUpdate = true;

    return markerTexture;
  }, [backgroundColor, borderColor, labelColor, round, selected]);

  useEffect(() => () => texture.dispose(), [texture]);

  return texture;
}

const CameraRig = forwardRef<CameraRigHandle, { event: SeasonGlobeEvent | null; initialCue: boolean }>(
  function CameraRig({ event, initialCue }, ref) {
    const { camera, invalidate, size } = useThree();
    const fitDistance = useMemo(
      () => getCameraFitDistance(camera as PerspectiveCamera, size.width, size.height),
      [camera, size.height, size.width],
    );
    const cameraDistances = useMemo(
      () => getSeasonGlobeCameraDistances(fitDistance, size.width < 640),
      [fitDistance, size.width],
    );
    const animationRef = useRef<{
      duration: number;
      rotation: Quaternion;
      startDirection: Vector3;
      startedAt: number;
    } | null>(null);
    const initializedRef = useRef(false);
    const lastRoundRef = useRef<number | null>(null);

    const applyDirection = useCallback(
      (direction: Vector3, distance = camera.position.length()) => {
        camera.position.copy(direction.clone().normalize().multiplyScalar(distance));
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();
        invalidate();
      },
      [camera, invalidate],
    );

    const focusDirection = useCallback(
      (targetDirection: Vector3, duration: number) => {
        const startDirection = camera.position.clone().normalize();

        if (duration <= 0 || startDirection.angleTo(targetDirection) < 0.001) {
          animationRef.current = null;
          applyDirection(targetDirection);
          return;
        }

        animationRef.current = {
          duration,
          rotation: new Quaternion().setFromUnitVectors(startDirection, targetDirection),
          startDirection,
          startedAt: performance.now(),
        };
        invalidate();
      },
      [applyDirection, camera.position, invalidate],
    );

    useImperativeHandle(
      ref,
      () => ({
        rotateBy(deltaX, deltaY) {
          animationRef.current = null;
          const spherical = new Spherical().setFromVector3(camera.position);
          spherical.theta -= deltaX * 0.006;
          spherical.phi = MathUtils.clamp(spherical.phi - deltaY * 0.0048, 0.22, Math.PI - 0.22);
          camera.position.setFromSpherical(spherical);
          camera.lookAt(0, 0, 0);
          camera.updateMatrixWorld();
          invalidate();
        },
        zoomBy(delta) {
          animationRef.current = null;
          const direction = camera.position.clone().normalize();
          const currentDistance = camera.position.length();
          const sensitivity = getSeasonGlobeZoomSensitivity(
            currentDistance,
            cameraDistances.minimum,
            cameraDistances.initial,
          );
          const distance = MathUtils.clamp(
            currentDistance + delta * sensitivity,
            cameraDistances.minimum,
            cameraDistances.maximum,
          );
          applyDirection(direction, distance);
        },
      }),
      [applyDirection, camera, cameraDistances, invalidate],
    );

    useEffect(() => {
      if (!event || !hasGlobeCoordinates(event) || lastRoundRef.current === event.round) {
        return;
      }

      const targetDirection = latLngToVector3(event.latitude, event.longitude, 1).normalize();

      if (!initializedRef.current) {
        initializedRef.current = true;
        const startDirection = targetDirection
          .clone()
          .applyAxisAngle(worldUp, MathUtils.degToRad(initialCue ? 8 : 0));
        applyDirection(startDirection, cameraDistances.initial);
        focusDirection(targetDirection, initialCue ? 860 : 0);
      } else {
        focusDirection(targetDirection, prefersReducedMotion() ? 0 : 460);
      }

      lastRoundRef.current = event.round;
    }, [applyDirection, cameraDistances.initial, event, focusDirection, initialCue]);

    useFrame(() => {
      const animation = animationRef.current;

      if (!animation) {
        return;
      }

      const progress = MathUtils.clamp(
        (performance.now() - animation.startedAt) / animation.duration,
        0,
        1,
      );
      const eased = 1 - Math.pow(1 - progress, 4);
      const rotation = new Quaternion().slerpQuaternions(
        new Quaternion(),
        animation.rotation,
        eased,
      );
      const direction = animation.startDirection.clone().applyQuaternion(rotation);
      applyDirection(direction);

      if (progress >= 1) {
        animationRef.current = null;
      } else {
        invalidate();
      }
    }, -1);

    return null;
  },
);

function ContextLossMonitor({ onFailure }: { onFailure: () => void }) {
  const { gl } = useThree();

  useEffect(() => {
    const canvas = gl.domElement;
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      Sentry.captureMessage("Season globe WebGL context lost", "warning");
      onFailure();
    };

    canvas.addEventListener("webglcontextlost", handleContextLost);

    return () => canvas.removeEventListener("webglcontextlost", handleContextLost);
  }, [gl, onFailure]);

  return null;
}

function useSeasonGlobePalette() {
  const [palette, setPalette] = useState(defaultPalette);

  useEffect(() => {
    const update = () => {
      const styles = getComputedStyle(document.documentElement);
      const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;

      setPalette({
        border: read("--season-globe-border", defaultPalette.border),
        hostLand: read("--season-globe-host-land", defaultPalette.hostLand),
        land: read("--season-globe-land", defaultPalette.land),
        markerCompleted: read("--season-globe-marker-completed", defaultPalette.markerCompleted),
        markerCompletedText: read(
          "--season-globe-marker-completed-text",
          defaultPalette.markerCompletedText,
        ),
        markerNext: read("--season-globe-marker-next", defaultPalette.markerNext),
        markerNextText: read(
          "--season-globe-marker-next-text",
          defaultPalette.markerNextText,
        ),
        markerSelected: read("--season-globe-marker-selected", defaultPalette.markerSelected),
        markerUpcoming: read("--season-globe-marker-upcoming", defaultPalette.markerUpcoming),
        markerUpcomingText: read(
          "--season-globe-marker-upcoming-text",
          defaultPalette.markerUpcomingText,
        ),
        ocean: read("--season-globe-ocean", defaultPalette.ocean),
        routeCompleted: read("--season-globe-route-completed", defaultPalette.routeCompleted),
        routeNext: read("--season-globe-route-next", defaultPalette.routeNext),
        routeUpcoming: read("--season-globe-route-upcoming", defaultPalette.routeUpcoming),
        routeUpcomingOutline: read(
          "--season-globe-route-upcoming-outline",
          defaultPalette.routeUpcomingOutline,
        ),
      });
    };
    const observer = new MutationObserver(update);

    update();
    observer.observe(document.documentElement, {
      attributeFilter: ["class", "data-theme"],
      attributes: true,
    });

    return () => observer.disconnect();
  }, []);

  return palette;
}

function getRouteStyle(phase: SeasonGlobePhase, palette: GlobePalette) {
  if (phase === "completed") {
    return {
      color: palette.routeCompleted,
      dashed: false,
      dashSize: 0.035,
      gapSize: 0.025,
      opacity: 0.78,
      width: 1.25,
    };
  }

  if (phase === "next") {
    return {
      color: palette.routeNext,
      dashed: false,
      dashSize: 0.035,
      gapSize: 0.025,
      opacity: 0.98,
      width: 2.1,
    };
  }

  return {
    color: palette.routeUpcoming,
    dashed: true,
    dashSize: 0.018,
    gapSize: 0.008,
    opacity: 0.72,
    width: 1.2,
  };
}

function getMarkerColor(phase: SeasonGlobePhase, palette: GlobePalette) {
  if (phase === "completed") {
    return palette.markerCompleted;
  }

  if (phase === "next") {
    return palette.markerNext;
  }

  return palette.markerUpcoming;
}

function getMarkerLabelColor(phase: SeasonGlobePhase, palette: GlobePalette) {
  if (phase === "completed") {
    return palette.markerCompletedText;
  }

  if (phase === "next") {
    return palette.markerNextText;
  }

  return palette.markerUpcomingText;
}

function capturePointer(element: HTMLDivElement, pointerId: number) {
  if (!element.hasPointerCapture(pointerId)) {
    element.setPointerCapture(pointerId);
  }
}

function getPointerDistance(pointers: Map<number, PointerSnapshot>) {
  const [first, second] = [...pointers.values()];

  if (!first || !second) {
    return 0;
  }

  return Math.hypot(first.x - second.x, first.y - second.y);
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function useReducedMotionPreference() {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(mediaQuery.matches);

    update();
    mediaQuery.addEventListener("change", update);

    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return reduceMotion;
}

function shouldRunInitialCue(season: number) {
  if (typeof window === "undefined" || prefersReducedMotion()) {
    return false;
  }

  try {
    const key = `raceside:season-globe-motion-seen:${season}`;

    if (window.sessionStorage.getItem(key)) {
      return false;
    }

    window.sessionStorage.setItem(key, "1");
    return true;
  } catch {
    return true;
  }
}

function getCameraFitDistance(camera: PerspectiveCamera, width: number, height: number) {
  const verticalFov = MathUtils.degToRad(camera.fov);
  const aspect = Math.max(0.2, width / Math.max(1, height));
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
  const limitingFov = Math.min(verticalFov, horizontalFov);
  const sceneRadius = 1.12;

  return Math.max(3.45, sceneRadius / Math.sin(limitingFov / 2) + 0.08);
}

const globeVertexShader = `
  varying vec2 vUv;
  varying vec3 vNormalView;

  void main() {
    vUv = uv;
    vNormalView = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const globeFragmentShader = `
  uniform sampler2D maskMap;
  uniform bool hasMask;
  uniform vec3 oceanColor;
  uniform vec3 landColor;
  uniform vec3 hostLandColor;
  uniform vec3 borderColor;

  varying vec2 vUv;
  varying vec3 vNormalView;

  void main() {
    vec3 mask = hasMask ? texture2D(maskMap, vUv).rgb : vec3(0.0);
    vec3 baseColor = mix(oceanColor, landColor, mask.r);
    baseColor = mix(baseColor, hostLandColor, mask.b * mask.r);
    baseColor = mix(baseColor, borderColor, mask.g);

    vec3 lightDirection = normalize(vec3(-0.35, 0.55, 0.8));
    float diffuse = 0.74 + 0.26 * max(dot(vNormalView, lightDirection), 0.0);
    float edge = pow(1.0 - max(vNormalView.z, 0.0), 2.0);
    vec3 shaded = baseColor * diffuse + borderColor * edge * 0.045;

    gl_FragColor = vec4(shaded, 1.0);
  }
`;
