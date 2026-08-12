"use client";

import { Html, OrthographicCamera as DreiOrthographicCamera, useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import Image from "next/image";
import {
  Component,
  type ReactNode,
  Suspense,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  MathUtils,
  Object3D,
  OrthographicCamera,
  Vector3,
} from "three";

import {
  ZANDVOORT_MODEL,
  ZANDVOORT_REPLAY_PATH,
} from "@/data/zandvoort-model";
import {
  HUNGARORING_REPLAY_PATH,
  HUNGARORING_TRACK_MODEL,
} from "@/data/hungaroring-model";
import {
  SILVERSTONE_REPLAY_PATH,
  SILVERSTONE_TRACK_MODEL,
} from "@/data/silverstone-model";
import { SPA_REPLAY_PATH, SPA_TRACK_MODEL } from "@/data/spa-model";
import type { CircuitModelPoint } from "@/data/track-model-types";
import { cn } from "@/lib/utils";

const ZANDVOORT_ASSET_PATH = "/f1/tracks/3d/zandvoort.glb";
const ZANDVOORT_PREVIEW_PATH = "/f1/tracks/3d/zandvoort-preview.webp";

export type ReplayTrackCar = {
  abbreviation: string;
  driverNumber: number;
  fullName: string;
  isPitLane: boolean;
  isSelected: boolean;
  lateralOffset: number;
  pitLaneProgress: number | null;
  progress: number;
  teamColor: string;
};

export type ZandvoortReplayCar = ReplayTrackCar;
export type ReplayTrackId = "hungaroring" | "silverstone" | "spa" | "zandvoort";

type ReplayTrackConfig = {
  alt: string;
  ariaLabel: string;
  assetPath: string;
  camera: {
    fitHeight: number;
    fitWidth: number;
    lookAtY: number;
    radius: number;
  };
  path: {
    baseElevationMeters: number;
    pitLanePoints: readonly CircuitModelPoint[];
    startFinishProgress: number;
    surfaceOffsetMeters: number;
    trackPoints: readonly CircuitModelPoint[];
    trackWidthMeters: number;
  };
  previewPath: string;
  turnCount: number;
};

const REPLAY_TRACK_CONFIGS: Record<ReplayTrackId, ReplayTrackConfig> = {
  hungaroring: {
    alt: "Трасса Хунгароринг",
    ariaLabel: "3D-повтор Гран-при Венгрии на трассе Хунгароринг",
    assetPath: HUNGARORING_TRACK_MODEL.webgl.assetPath,
    camera: HUNGARORING_TRACK_MODEL.webgl.camera,
    path: HUNGARORING_REPLAY_PATH,
    previewPath: HUNGARORING_TRACK_MODEL.webgl.previewPath,
    turnCount: HUNGARORING_TRACK_MODEL.webgl.turnCount,
  },
  silverstone: {
    alt: "Трасса Сильверстоун",
    ariaLabel: "3D-повтор Гран-при Великобритании на трассе Сильверстоун",
    assetPath: SILVERSTONE_TRACK_MODEL.webgl.assetPath,
    camera: SILVERSTONE_TRACK_MODEL.webgl.camera,
    path: SILVERSTONE_REPLAY_PATH,
    previewPath: SILVERSTONE_TRACK_MODEL.webgl.previewPath,
    turnCount: SILVERSTONE_TRACK_MODEL.webgl.turnCount,
  },
  spa: {
    alt: "Трасса Спа-Франкоршам",
    ariaLabel: "3D-повтор Гран-при Бельгии на трассе Спа-Франкоршам",
    assetPath: SPA_TRACK_MODEL.webgl.assetPath,
    camera: SPA_TRACK_MODEL.webgl.camera,
    path: {
      baseElevationMeters: SPA_REPLAY_PATH.baseElevationDngMeters,
      pitLanePoints: SPA_REPLAY_PATH.pitLanePoints,
      startFinishProgress: SPA_REPLAY_PATH.startFinishProgress,
      surfaceOffsetMeters: SPA_REPLAY_PATH.surfaceOffsetMeters,
      trackPoints: SPA_REPLAY_PATH.trackPoints,
      trackWidthMeters: SPA_REPLAY_PATH.trackWidthMeters,
    },
    previewPath: SPA_TRACK_MODEL.webgl.previewPath,
    turnCount: SPA_TRACK_MODEL.webgl.turnCount,
  },
  zandvoort: {
    alt: "Трасса Зандворт",
    ariaLabel: "3D-повтор Гран-при Нидерландов на трассе Зандворт",
    assetPath: ZANDVOORT_ASSET_PATH,
    camera: { fitHeight: 1_600, fitWidth: 1_900, lookAtY: 8, radius: 2_650 },
    path: {
      baseElevationMeters: ZANDVOORT_REPLAY_PATH.baseElevationNapMeters,
      pitLanePoints: ZANDVOORT_REPLAY_PATH.pitLanePoints,
      startFinishProgress: ZANDVOORT_REPLAY_PATH.startFinishProgress,
      surfaceOffsetMeters: ZANDVOORT_REPLAY_PATH.surfaceOffsetMeters,
      trackPoints: ZANDVOORT_MODEL.points,
      trackWidthMeters: ZANDVOORT_REPLAY_PATH.trackWidthMeters,
    },
    previewPath: ZANDVOORT_PREVIEW_PATH,
    turnCount: 14,
  },
};

type RaceReplayTrack3DProps = {
  cars: ReplayTrackCar[];
  followDriver: number | null;
  onSelectDriver: (driverNumber: number) => void;
  panX: number;
  panY: number;
  rotationDeg: number;
  tiltDeg: number;
  trackId: ReplayTrackId;
  zoom: number;
};

type CarPose = ReplayTrackCar & {
  heading: number;
  position: readonly [number, number, number];
};

export function RaceReplayTrack3D({
  cars,
  followDriver,
  onSelectDriver,
  panX,
  panY,
  rotationDeg,
  tiltDeg,
  trackId,
  zoom,
}: RaceReplayTrack3DProps) {
  const [isReady, setIsReady] = useState(false);
  const config = REPLAY_TRACK_CONFIGS[trackId];
  const poses = useMemo(() => cars.map((car) => buildCarPose(car, config)), [cars, config]);
  const followPosition = followDriver === null
    ? null
    : poses.find((car) => car.driverNumber === followDriver)?.position ?? null;

  return (
    <ReplayMapErrorBoundary fallback={<ReplayMapPreview config={config} />}>
      <div
        aria-label={config.ariaLabel}
        className="relative size-full overflow-hidden rounded-lg border border-border/70 bg-black/35"
        role="img"
      >
        <ReplayMapPreview
          className={cn("transition-opacity duration-200 motion-reduce:transition-none", isReady && "opacity-0")}
          config={config}
        />
        <Canvas
          camera={{ far: 10_000, near: 1, position: [1_500, 1_700, 1_500], zoom: 0.3 }}
          className={cn(
            "absolute inset-0 size-full transition-opacity duration-200 motion-reduce:transition-none",
            isReady ? "opacity-100" : "opacity-0",
          )}
          dpr={[1, 1.5]}
          frameloop="demand"
          gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
          onCreated={({ gl }) => gl.setClearAlpha(0)}
          orthographic
          performance={{ min: 0.5 }}
        >
          <ambientLight intensity={1.35} />
          <directionalLight intensity={2.1} position={[-900, 1_600, -1_100]} />
          <directionalLight intensity={0.7} position={[1_000, 900, 700]} />
          <ReplayCameraRig
            cameraConfig={config.camera}
            followPosition={followPosition}
            panX={panX}
            panY={panY}
            rotationDeg={rotationDeg}
            tiltDeg={tiltDeg}
            zoom={zoom}
          />
          <Suspense fallback={null}>
            <TrackReplayScene
              cars={poses}
              config={config}
              onReady={() => setIsReady(true)}
              onSelectDriver={onSelectDriver}
            />
          </Suspense>
        </Canvas>
        {!isReady ? <span className="sr-only">Готовим 3D-повтор гонки</span> : null}
      </div>
    </ReplayMapErrorBoundary>
  );
}

export function RaceReplayZandvoort3D(props: Omit<RaceReplayTrack3DProps, "trackId">) {
  return <RaceReplayTrack3D {...props} trackId="zandvoort" />;
}

function TrackReplayScene({
  cars,
  config,
  onReady,
  onSelectDriver,
}: {
  cars: CarPose[];
  config: ReplayTrackConfig;
  onReady: () => void;
  onSelectDriver: (driverNumber: number) => void;
}) {
  const gltf = useGLTF(config.assetPath, false, true);
  const invalidate = useThree((state) => state.invalidate);
  const hasReportedReady = useRef(false);
  const scene = useMemo(() => cloneScene(gltf.scene), [gltf.scene]);
  const anchors = useMemo(() => readAnchors(scene, config.turnCount), [config.turnCount, scene]);

  useLayoutEffect(() => {
    invalidate();
  }, [cars, invalidate, scene]);

  useFrame(() => {
    if (hasReportedReady.current) {
      return;
    }

    hasReportedReady.current = true;
    requestAnimationFrame(onReady);
  });

  return (
    <>
      <primitive dispose={null} object={scene} />
      <TrackAnnotations anchors={anchors} />
      {cars.map((car) => (
        <ReplayCar
          car={car}
          key={car.driverNumber}
          onSelect={() => onSelectDriver(car.driverNumber)}
        />
      ))}
    </>
  );
}

function ReplayCar({ car, onSelect }: { car: CarPose; onSelect: () => void }) {
  return (
    <group
      name={`ReplayCar_${car.driverNumber}`}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      position={car.position}
      rotation={[0, car.heading, 0]}
      scale={car.isSelected ? 1.16 : 1}
    >
      {car.isSelected ? (
        <mesh position={[0, -0.38, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[3.5, 4.15, 40]} />
          <meshBasicMaterial color={car.teamColor} depthWrite={false} transparent opacity={0.9} />
        </mesh>
      ) : null}
      <mesh castShadow position={[0, 0, -0.15]}>
        <boxGeometry args={[1.42, 0.52, 3.45]} />
        <meshStandardMaterial color={car.teamColor} metalness={0.12} roughness={0.5} />
      </mesh>
      <mesh castShadow position={[0, -0.02, 2.05]}>
        <boxGeometry args={[0.68, 0.3, 1.55]} />
        <meshStandardMaterial color={car.teamColor} metalness={0.12} roughness={0.5} />
      </mesh>
      <mesh castShadow position={[0, 0.32, -0.5]}>
        <boxGeometry args={[0.8, 0.44, 1.05]} />
        <meshStandardMaterial color="#14161a" metalness={0.15} roughness={0.42} />
      </mesh>
      <mesh position={[0, 0.15, 2.72]}>
        <boxGeometry args={[1.75, 0.12, 0.46]} />
        <meshStandardMaterial color={car.teamColor} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.48, -2.05]}>
        <boxGeometry args={[1.85, 0.22, 0.42]} />
        <meshStandardMaterial color={car.teamColor} roughness={0.55} />
      </mesh>
      {[-1, 1].flatMap((side) => [-1.45, 1.35].map((z) => (
        <mesh key={`${side}-${z}`} position={[side * 0.92, -0.02, z]}>
          <boxGeometry args={[0.36, 0.55, 0.72]} />
          <meshStandardMaterial color="#08090b" metalness={0.05} roughness={0.82} />
        </mesh>
      )))}
      <Html
        center
        pointerEvents="none"
        position={[0, 3.1, 0]}
        zIndexRange={[28, 0]}
      >
        <span
          className={cn(
            "pointer-events-none whitespace-nowrap rounded border bg-black/88 px-1.5 py-0.5 font-mono text-[0.58rem] font-black leading-none text-white shadow-lg",
            car.isSelected && "px-2 py-1 text-[0.68rem]",
            car.isPitLane && "border-amber-400",
          )}
          style={{ borderColor: car.isPitLane ? undefined : car.teamColor }}
          title={car.fullName}
        >
          {car.abbreviation}
        </span>
      </Html>
    </group>
  );
}

function ReplayCameraRig({
  cameraConfig,
  followPosition,
  panX,
  panY,
  rotationDeg,
  tiltDeg,
  zoom,
}: {
  cameraConfig: ReplayTrackConfig["camera"];
  followPosition: readonly [number, number, number] | null;
  panX: number;
  panY: number;
  rotationDeg: number;
  tiltDeg: number;
  zoom: number;
}) {
  const cameraRef = useRef<OrthographicCamera>(null);
  const invalidate = useThree((state) => state.invalidate);
  const height = useThree((state) => state.size.height);
  const width = useThree((state) => state.size.width);

  useLayoutEffect(() => {
    const camera = cameraRef.current;

    if (!camera) {
      return;
    }

    const target = followPosition ? new Vector3(...followPosition) : new Vector3(0, cameraConfig.lookAtY, 0);
    const polarDeg = MathUtils.clamp(48 + (tiltDeg - 10) * 0.34, 40, 72);
    const polar = MathUtils.degToRad(polarDeg);
    const azimuth = MathUtils.degToRad(38 + rotationDeg);
    const radius = cameraConfig.radius;
    const horizontalRadius = Math.sin(polar) * radius;

    camera.position.set(
      target.x + Math.sin(azimuth) * horizontalRadius,
      target.y + Math.cos(polar) * radius,
      target.z + Math.cos(azimuth) * horizontalRadius,
    );
    camera.lookAt(target);
    camera.zoom = Math.min(width / cameraConfig.fitWidth, height / cameraConfig.fitHeight) * zoom;
    camera.clearViewOffset();

    if (!followPosition && (panX !== 0 || panY !== 0)) {
      camera.setViewOffset(width, height, -panX * width, -panY * height, width, height);
    }

    camera.updateProjectionMatrix();
    invalidate();
  }, [cameraConfig, followPosition, height, invalidate, panX, panY, rotationDeg, tiltDeg, width, zoom]);

  return (
    <DreiOrthographicCamera
      far={10_000}
      makeDefault
      near={1}
      position={[1_500, 1_700, 1_500]}
      ref={cameraRef}
      zoom={0.3}
    />
  );
}

function TrackAnnotations({ anchors }: { anchors: ReturnType<typeof readAnchors> }) {
  return (
    <>
      {anchors.turns.map(({ number, position }) => (
        <Html center key={number} pointerEvents="none" position={position} zIndexRange={[20, 0]}>
          <span className="pointer-events-none grid size-[1.125rem] place-items-center rounded-full border border-white/45 bg-black/85 font-mono text-[0.52rem] font-black leading-none text-white shadow-sm">
            {number}
          </span>
        </Html>
      ))}
      {anchors.speedTrap ? (
        <Html center pointerEvents="none" position={anchors.speedTrap} zIndexRange={[20, 0]}>
          <span className="pointer-events-none rounded-sm border border-emerald-400/80 bg-black/85 px-1.5 py-1 font-mono text-[0.56rem] font-bold text-emerald-300 shadow-sm">
            ST
          </span>
        </Html>
      ) : null}
      {anchors.sectors.map(({ label, position, sector }) => (
        <Html center key={label} pointerEvents="none" position={position} zIndexRange={[18, 0]}>
          <span
            className="pointer-events-none hidden whitespace-nowrap rounded-sm border bg-black/85 px-2 py-1 font-mono text-[0.52rem] font-black text-white shadow-[0_0_18px_currentColor] sm:block"
            style={{ color: `var(--track-model-sector-${sector})` }}
          >
            {label}
          </span>
        </Html>
      ))}
    </>
  );
}

function buildCarPose(car: ReplayTrackCar, config: ReplayTrackConfig): CarPose {
  const path = car.isPitLane && car.pitLaneProgress !== null
    ? config.path.pitLanePoints
    : config.path.trackPoints;
  const progress = car.isPitLane && car.pitLaneProgress !== null
    ? car.pitLaneProgress
    : normalizeProgress(car.progress + config.path.startFinishProgress);
  const sample = sampleReplayPath(path, progress, config.path);
  const lateralOffsetMeters = car.isPitLane
    ? 0
    : car.lateralOffset * (config.path.trackWidthMeters / 26);
  const normalX = -sample.directionZ;
  const normalZ = sample.directionX;

  return {
    ...car,
    heading: Math.atan2(sample.directionX, sample.directionZ),
    position: [
      sample.x + normalX * lateralOffsetMeters,
      sample.y,
      sample.z + normalZ * lateralOffsetMeters,
    ],
  };
}

function sampleReplayPath(
  points: readonly CircuitModelPoint[],
  requestedProgress: number,
  pathConfig: ReplayTrackConfig["path"],
) {
  const progress = Math.max(0, Math.min(1, requestedProgress));
  let upper = points.findIndex((point) => point[0] >= progress);

  if (upper <= 0) {
    upper = 1;
  }

  const first = points[upper - 1];
  const second = points[Math.min(upper, points.length - 1)];
  const blend = (progress - first[0]) / Math.max(second[0] - first[0], 1e-9);
  const x = first[1] + (second[1] - first[1]) * blend;
  const sourceY = first[2] + (second[2] - first[2]) * blend;
  const elevationNapMeters = (first[3] + (second[3] - first[3]) * blend) / 10;
  const directionXRaw = second[1] - first[1];
  const directionZRaw = -(second[2] - first[2]);
  const directionLength = Math.hypot(directionXRaw, directionZRaw) || 1;

  return {
    directionX: directionXRaw / directionLength,
    directionZ: directionZRaw / directionLength,
    x,
    y: elevationNapMeters - pathConfig.baseElevationMeters + pathConfig.surfaceOffsetMeters,
    z: -sourceY,
  };
}

function normalizeProgress(progress: number) {
  return ((progress % 1) + 1) % 1;
}

function cloneScene(source: Object3D) {
  const cloned = source.clone(true);

  cloned.traverse((object) => {
    object.frustumCulled = true;
  });
  cloned.updateMatrixWorld(true);
  return cloned;
}

function readAnchors(scene: Object3D, turnCount: number) {
  scene.updateMatrixWorld(true);
  const turns = Array.from({ length: turnCount }, (_, index) => {
    const number = index + 1;
    const anchor = scene.getObjectByName(`Turn_${String(number).padStart(2, "0")}`);

    return anchor ? { number, position: anchor.getWorldPosition(new Vector3()) } : null;
  }).filter((anchor): anchor is { number: number; position: Vector3 } => anchor !== null);

  return {
    sectors: [
      { label: "S1", position: readAnchorPosition(scene, "StartFinish"), sector: 1 },
      { label: "S2", position: readAnchorPosition(scene, "SectorBoundary_02"), sector: 2 },
      { label: "S3", position: readAnchorPosition(scene, "SectorBoundary_03"), sector: 3 },
    ].filter(
      (anchor): anchor is { label: string; position: Vector3; sector: number } => anchor.position !== null,
    ),
    speedTrap: readAnchorPosition(scene, "SpeedTrap"),
    turns,
  };
}

function readAnchorPosition(scene: Object3D, name: string) {
  const anchor = scene.getObjectByName(name);
  return anchor ? anchor.getWorldPosition(new Vector3()) : null;
}

function ReplayMapPreview({ className, config }: { className?: string; config: ReplayTrackConfig }) {
  return (
    <div className={cn("absolute inset-0 size-full overflow-hidden bg-black/25", className)}>
      <Image
        alt={config.alt}
        className="pointer-events-none object-contain opacity-80"
        draggable={false}
        fill
        loading="eager"
        sizes="(max-width: 768px) 100vw, 960px"
        src={config.previewPath}
      />
    </div>
  );
}

type ReplayMapErrorBoundaryProps = {
  children: ReactNode;
  fallback: ReactNode;
};

class ReplayMapErrorBoundary extends Component<ReplayMapErrorBoundaryProps, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    // Static preview is the intentional recovery path when WebGL is unavailable.
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

useGLTF.preload(ZANDVOORT_ASSET_PATH);
useGLTF.preload(SPA_TRACK_MODEL.webgl.assetPath);
useGLTF.preload(HUNGARORING_TRACK_MODEL.webgl.assetPath);
