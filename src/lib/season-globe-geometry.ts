import { MathUtils, Quaternion, Vector3 } from "three";

import type { SeasonGlobeEvent, SeasonGlobePhase } from "@/types/racemate";

export type GlobeCoordinates = {
  latitude: number | null;
  longitude: number | null;
};

export type GreatCircleArcOptions = {
  altitude?: number;
  radius?: number;
  segments?: number;
};

export type SeasonGlobeRouteSegment = {
  fromRound: number;
  toRound: number;
  phase: SeasonGlobePhase;
  points: Vector3[];
};

export type SeasonGlobeCameraDistances = {
  initial: number;
  maximum: number;
  minimum: number;
};

export const SEASON_GLOBE_MARKER_RADIUS = 1.006;

export function getSeasonGlobeCameraDistances(
  fitDistance: number,
  compactViewport = false,
): SeasonGlobeCameraDistances {
  const safeFitDistance = Number.isFinite(fitDistance)
    ? Math.max(3.45, fitDistance)
    : 3.45;

  return {
    initial: compactViewport
      ? MathUtils.clamp(safeFitDistance * 0.59, 2.25, 2.6)
      : MathUtils.clamp(safeFitDistance * 0.65, 2.45, 2.85),
    maximum: Math.max(6.4, safeFitDistance + 1.2),
    minimum: 1.45,
  };
}

export function getSeasonGlobeMarkerScaleFactor(markerDepth: number) {
  const referenceCameraDistance = 2.25;
  const referenceDepth = referenceCameraDistance - SEASON_GLOBE_MARKER_RADIUS;
  const safeMarkerDepth = Number.isFinite(markerDepth)
    ? Math.max(0.05, markerDepth)
    : referenceDepth;

  return MathUtils.clamp(safeMarkerDepth / referenceDepth, 0.05, 6);
}

export function getSeasonGlobeMarkerViewportScale(viewportHeight: number) {
  const safeHeight = Number.isFinite(viewportHeight)
    ? Math.max(1, viewportHeight)
    : 336;

  return MathUtils.clamp(336 / safeHeight, 1, 1.6);
}

export function getSeasonGlobeMarkerHoverScale(hovered: boolean) {
  return hovered ? 1.14 : 1;
}

export function getSeasonGlobeZoomSensitivity(
  cameraDistance: number,
  minimumDistance: number,
  referenceDistance: number,
) {
  if (
    !Number.isFinite(cameraDistance) ||
    !Number.isFinite(minimumDistance) ||
    !Number.isFinite(referenceDistance) ||
    referenceDistance <= minimumDistance
  ) {
    return 1;
  }

  const progress = MathUtils.clamp(
    (cameraDistance - minimumDistance) / (referenceDistance - minimumDistance),
    0,
    1,
  );

  return MathUtils.lerp(0.22, 1, progress);
}

export function getSeasonGlobeMarkerOpacity(
  cameraDistance: number,
  cameraFacing: number,
) {
  const safeCameraDistance = Number.isFinite(cameraDistance)
    ? Math.max(1.01, cameraDistance)
    : 1.01;
  const safeCameraFacing = Number.isFinite(cameraFacing) ? cameraFacing : -1;
  const horizon = 1 / safeCameraDistance;

  return MathUtils.smoothstep(
    safeCameraFacing,
    horizon - 0.025,
    horizon + 0.025,
  );
}

export function normalizeLongitude(longitude: number) {
  if (!Number.isFinite(longitude)) {
    return 0;
  }

  return ((longitude + 180) % 360 + 360) % 360 - 180;
}

export function latLngToVector3(
  latitude: number,
  longitude: number,
  radius = 1,
) {
  const safeLatitude = MathUtils.clamp(Number.isFinite(latitude) ? latitude : 0, -90, 90);
  const safeLongitude = normalizeLongitude(longitude);
  const latitudeRadians = MathUtils.degToRad(safeLatitude);
  const longitudeRadians = MathUtils.degToRad(safeLongitude);
  const horizontalRadius = Math.cos(latitudeRadians) * radius;

  return new Vector3(
    horizontalRadius * Math.cos(longitudeRadians),
    Math.sin(latitudeRadians) * radius,
    -horizontalRadius * Math.sin(longitudeRadians),
  );
}

export function createGreatCircleArc(
  start: GlobeCoordinates,
  end: GlobeCoordinates,
  options: GreatCircleArcOptions = {},
) {
  if (!hasGlobeCoordinates(start) || !hasGlobeCoordinates(end)) {
    return [];
  }

  const radius = options.radius ?? 1.018;
  const altitude = options.altitude ?? 0.06;
  const startDirection = latLngToVector3(start.latitude, start.longitude, 1).normalize();
  const endDirection = latLngToVector3(end.latitude, end.longitude, 1).normalize();
  const dot = MathUtils.clamp(startDirection.dot(endDirection), -1, 1);
  const angle = Math.acos(dot);
  const segments = Math.max(2, options.segments ?? Math.ceil(18 + angle * 24));

  if (angle < 1e-6) {
    const point = startDirection.multiplyScalar(radius);
    return [point.clone(), point.clone()];
  }

  const points: Vector3[] = [];
  const sinAngle = Math.sin(angle);
  const antipodalAxis = Math.abs(sinAngle) < 1e-6
    ? getStableOrthogonalAxis(startDirection)
    : null;

  for (let index = 0; index <= segments; index += 1) {
    const progress = index / segments;
    let direction: Vector3;

    if (antipodalAxis) {
      direction = startDirection
        .clone()
        .applyQuaternion(
          new Quaternion().setFromAxisAngle(antipodalAxis, Math.PI * progress),
        );
    } else {
      direction = startDirection
        .clone()
        .multiplyScalar(Math.sin((1 - progress) * angle) / sinAngle)
        .add(
          endDirection
            .clone()
            .multiplyScalar(Math.sin(progress * angle) / sinAngle),
        )
        .normalize();
    }

    const arcLift = Math.sin(Math.PI * progress) * altitude * Math.min(1, angle / 1.15);
    points.push(direction.multiplyScalar(radius + arcLift));
  }

  return points;
}

export function buildSeasonGlobeRouteSegments(
  events: Pick<SeasonGlobeEvent, "latitude" | "longitude" | "phase" | "round">[],
) {
  const ordered = [...events].sort((left, right) => left.round - right.round);
  const route: SeasonGlobeRouteSegment[] = [];

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    const points = createGreatCircleArc(previous, current);

    if (!points.length) {
      continue;
    }

    route.push({
      fromRound: previous.round,
      toRound: current.round,
      phase: current.phase,
      points,
    });
  }

  return route;
}

export function hasGlobeCoordinates(
  value: GlobeCoordinates,
): value is { latitude: number; longitude: number } {
  return (
    value.latitude !== null &&
    value.longitude !== null &&
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude)
  );
}

function getStableOrthogonalAxis(direction: Vector3) {
  const reference = Math.abs(direction.y) < 0.9
    ? new Vector3(0, 1, 0)
    : new Vector3(1, 0, 0);

  return new Vector3().crossVectors(direction, reference).normalize();
}
