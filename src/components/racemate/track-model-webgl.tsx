"use client";

import { Html, OrthographicCamera as DreiOrthographicCamera, useGLTF } from "@react-three/drei";
import {
  Canvas,
  type EventManager,
  useFrame,
  useThree,
} from "@react-three/fiber";
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

import { cn } from "@/lib/utils";

const ZANDVOORT_ASSET_PATH = "/f1/tracks/3d/zandvoort.glb";
const ZANDVOORT_PREVIEW_PATH = "/f1/tracks/3d/zandvoort-preview.webp";

type TrackModelWebGLProps = {
  circuit: string;
  panX: number;
  panY: number;
  rotationDeg: number;
  showElevationAnchors: boolean;
  tiltDeg: number;
  zoom: number;
};

export function TrackModelWebGL({
  circuit,
  panX,
  panY,
  rotationDeg,
  showElevationAnchors,
  tiltDeg,
  zoom,
}: TrackModelWebGLProps) {
  const [isReady, setIsReady] = useState(false);

  return (
    <TrackModelErrorBoundary fallback={<TrackModelStaticPreview circuit={circuit} />}>
      <div aria-hidden="true" className="absolute inset-0 size-full overflow-hidden">
        <TrackModelStaticPreview
          circuit={circuit}
          className={cn(
            "transition-opacity duration-200 motion-reduce:transition-none",
            isReady && "opacity-0",
          )}
        />
        <Canvas
          camera={{ far: 10_000, near: 1, position: [1_500, 1_700, 1_500], zoom: 0.3 }}
          className={cn(
            "absolute inset-0 size-full transition-opacity duration-200 motion-reduce:transition-none",
            isReady ? "opacity-100" : "opacity-0",
          )}
          dpr={[1, 1.5]}
          events={createDisabledEventManager}
          fallback={<TrackModelStaticPreview circuit={circuit} />}
          frameloop="demand"
          gl={{
            alpha: true,
            antialias: true,
            powerPreference: "high-performance",
          }}
          onCreated={({ gl }) => gl.setClearAlpha(0)}
          orthographic
          performance={{ min: 0.5 }}
        >
          <ambientLight intensity={1.35} />
          <directionalLight intensity={2.1} position={[-900, 1_600, -1_100]} />
          <directionalLight intensity={0.65} position={[1_000, 900, 700]} />
          <CameraRig
            panX={panX}
            panY={panY}
            rotationDeg={rotationDeg}
            tiltDeg={tiltDeg}
            zoom={zoom}
          />
          <Suspense fallback={null}>
            <ZandvoortScene
              onReady={() => setIsReady(true)}
              showElevationAnchors={showElevationAnchors}
            />
          </Suspense>
        </Canvas>
      </div>
    </TrackModelErrorBoundary>
  );
}

export function TrackModelStaticPreview({
  circuit,
  className,
}: {
  circuit: string;
  className?: string;
}) {
  return (
    <div className={cn("absolute inset-0 size-full overflow-hidden", className)}>
      <Image
        alt={`Трасса ${circuit}`}
        className="pointer-events-none object-contain"
        draggable={false}
        fill
        loading="eager"
        sizes="(max-width: 768px) 100vw, 720px"
        src={ZANDVOORT_PREVIEW_PATH}
      />
    </div>
  );
}

function ZandvoortScene({
  onReady,
  showElevationAnchors,
}: {
  onReady: () => void;
  showElevationAnchors: boolean;
}) {
  const gltf = useGLTF(ZANDVOORT_ASSET_PATH, false, true);
  const invalidate = useThree((state) => state.invalidate);
  const hasReportedReady = useRef(false);
  const scene = useMemo(() => cloneScene(gltf.scene), [gltf.scene]);
  const anchors = useMemo(() => readAnchors(scene), [scene]);

  useLayoutEffect(() => {
    invalidate();
  }, [invalidate, scene]);

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
      {anchors.turns.map(({ number, position }) => (
        <Html
          center
          key={number}
          pointerEvents="none"
          position={position}
          zIndexRange={[20, 0]}
        >
          <span
            className="pointer-events-none grid size-[1.125rem] place-items-center rounded-full border border-[var(--track-model-turn-line)] bg-[var(--track-model-turn-bg)] font-mono text-[0.52rem] font-black leading-none text-[var(--track-model-turn-text)] shadow-sm @lg/track:size-5 @lg/track:text-[0.6rem]"
          >
            {number}
          </span>
        </Html>
      ))}
      {anchors.speedTrap ? (
        <Html
          center
          pointerEvents="none"
          position={anchors.speedTrap}
          zIndexRange={[20, 0]}
        >
          <span className="pointer-events-none rounded-sm border border-[var(--track-model-speed-trap)] bg-[var(--track-model-speed-trap-bg)] px-1.5 py-1 font-mono text-[0.56rem] font-bold text-[var(--track-model-speed-trap-text)] shadow-sm">
            ST
          </span>
        </Html>
      ) : null}
      {anchors.sectors.map(({ label, position, sector }) => {
        const sectorColor = `var(--track-model-sector-${sector})`;

        return (
        <Html
          center
          key={label}
          pointerEvents="none"
          position={position}
          zIndexRange={[18, 0]}
        >
          <span
            className="pointer-events-none hidden whitespace-nowrap rounded-sm border bg-black/80 px-2 py-1 font-mono text-[0.52rem] font-black text-white @md/track:block"
            style={{
              borderColor: sectorColor,
              boxShadow: `0 0 0 1px color-mix(in srgb, ${sectorColor} 55%, transparent), 0 0 16px color-mix(in srgb, ${sectorColor} 72%, transparent)`,
            }}
          >
            {label}
          </span>
        </Html>
        );
      })}
      {showElevationAnchors && anchors.highPoint ? (
        <Html
          center
          pointerEvents="none"
          position={anchors.highPoint.position}
          zIndexRange={[20, 0]}
        >
          <span className="pointer-events-none hidden whitespace-nowrap rounded border border-[var(--track-model-height-border)] bg-[var(--track-model-height-bg)] px-2 py-1 font-mono text-[0.65rem] font-bold text-[var(--track-model-height-text)] shadow-sm @lg/track:block">
            {formatElevation(anchors.highPoint.elevation)} м NAP
          </span>
        </Html>
      ) : null}
      {showElevationAnchors && anchors.lowPoint ? (
        <Html
          center
          pointerEvents="none"
          position={anchors.lowPoint.position}
          zIndexRange={[20, 0]}
        >
          <span className="pointer-events-none hidden whitespace-nowrap rounded border border-[var(--track-model-height-border)] bg-[var(--track-model-height-bg)] px-2 py-1 font-mono text-[0.65rem] font-bold text-[var(--track-model-height-text)] shadow-sm @lg/track:block">
            {formatElevation(anchors.lowPoint.elevation)} м NAP
          </span>
        </Html>
      ) : null}
    </>
  );
}

function CameraRig({
  panX,
  panY,
  rotationDeg,
  tiltDeg,
  zoom,
}: Pick<TrackModelWebGLProps, "panX" | "panY" | "rotationDeg" | "tiltDeg" | "zoom">) {
  const cameraRef = useRef<OrthographicCamera>(null);
  const invalidate = useThree((state) => state.invalidate);
  const height = useThree((state) => state.size.height);
  const width = useThree((state) => state.size.width);

  useLayoutEffect(() => {
    const camera = cameraRef.current;

    if (!camera) {
      return;
    }

    const polarDeg = clamp(48 + (tiltDeg - 10) * 0.34, 40, 72);
    const polar = MathUtils.degToRad(polarDeg);
    const azimuth = MathUtils.degToRad(38 + rotationDeg);
    const radius = 2_650;
    const horizontalRadius = Math.sin(polar) * radius;
    camera.position.set(
      Math.sin(azimuth) * horizontalRadius,
      Math.cos(polar) * radius,
      Math.cos(azimuth) * horizontalRadius,
    );
    camera.lookAt(0, 8, 0);
    camera.zoom = Math.min(width / 1_900, height / 1_600) * zoom;
    camera.clearViewOffset();

    if (panX !== 0 || panY !== 0) {
      camera.setViewOffset(width, height, -panX * width, -panY * height, width, height);
    }

    camera.updateProjectionMatrix();
    invalidate();
  }, [height, invalidate, panX, panY, rotationDeg, tiltDeg, width, zoom]);

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

function cloneScene(source: Object3D) {
  const cloned = source.clone(true);

  cloned.traverse((object) => {
    object.frustumCulled = true;
  });
  cloned.updateMatrixWorld(true);
  return cloned;
}

function readAnchors(scene: Object3D) {
  scene.updateMatrixWorld(true);
  const turns = Array.from({ length: 14 }, (_, index) => {
    const number = index + 1;
    const anchor = scene.getObjectByName(`Turn_${String(number).padStart(2, "0")}`);

    return anchor ? { number, position: anchor.getWorldPosition(new Vector3()) } : null;
  }).filter((anchor): anchor is { number: number; position: Vector3 } => anchor !== null);

  return {
    highPoint: readElevationAnchor(scene, "HighPoint"),
    lowPoint: readElevationAnchor(scene, "LowPoint"),
    sectors: [
      { label: "S1", position: readAnchorPosition(scene, "StartFinish"), sector: 1 },
      { label: "S2", position: readAnchorPosition(scene, "SectorBoundary_02"), sector: 2 },
      { label: "S3", position: readAnchorPosition(scene, "SectorBoundary_03"), sector: 3 },
    ].filter(
      (anchor): anchor is { label: string; position: Vector3; sector: number } =>
        anchor.position !== null,
    ),
    speedTrap: readAnchorPosition(scene, "SpeedTrap"),
    turns,
  };
}

function readAnchorPosition(scene: Object3D, name: string) {
  const anchor = scene.getObjectByName(name);
  return anchor ? anchor.getWorldPosition(new Vector3()) : null;
}

function readElevationAnchor(scene: Object3D, name: string) {
  const anchor = scene.getObjectByName(name);

  if (!anchor) {
    return null;
  }

  return {
    elevation: Number(anchor.userData.elevation_nap_m),
    position: anchor.getWorldPosition(new Vector3()),
  };
}

function formatElevation(value: number) {
  return value.toFixed(1).replace(".", ",");
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function createDisabledEventManager(): EventManager<HTMLElement> {
  return {
    connect: () => undefined,
    connected: undefined,
    disconnect: () => undefined,
    enabled: false,
    priority: 0,
    update: () => undefined,
  };
}

type TrackModelErrorBoundaryProps = {
  children: ReactNode;
  fallback: ReactNode;
};

type TrackModelErrorBoundaryState = {
  hasError: boolean;
};

class TrackModelErrorBoundary extends Component<
  TrackModelErrorBoundaryProps,
  TrackModelErrorBoundaryState
> {
  state = { hasError: false };

  static getDerivedStateFromError(): TrackModelErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch() {
    // The static preview is the intentional recovery path for WebGL and asset failures.
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
