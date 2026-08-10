export function createClosedLoopSegments<T>(points: readonly T[]): Array<readonly [T, T]> {
  if (points.length === 0) {
    return [];
  }

  return points.map((point, index) => [point, points[(index + 1) % points.length]] as const);
}

type TrackClearancePoint = {
  progress: number;
  x: number;
  y: number;
};

type TrackProgressRange = {
  from: number;
  level?: boolean;
  to: number;
};

type TrackElevationPoint = TrackClearancePoint & {
  elevationM: number;
};

const TRACK_CLEARANCE_RATIO = 0.42;
const TRACK_CLEARANCE_PROGRESS_GAP = 0.045;
const TRACK_OVERPASS_CLEARANCE_DISTANCE = 0.15;

export function getTrackClearanceHalfWidths(
  points: readonly TrackClearancePoint[],
  protectedRanges: readonly TrackProgressRange[] = [],
) {
  const protectedPoints = points.map((point) =>
    protectedRanges.some((range) => progressInRange(point.progress, range)),
  );

  return points.map((point, pointIndex) => {
    if (protectedPoints[pointIndex]) {
      return Number.POSITIVE_INFINITY;
    }

    let nearestDistance = Number.POSITIVE_INFINITY;

    for (let candidateIndex = 0; candidateIndex < points.length; candidateIndex += 1) {
      if (candidateIndex === pointIndex) {
        continue;
      }

      const candidate = points[candidateIndex];
      const progressDistance = Math.min(
        Math.abs(point.progress - candidate.progress),
        1 - Math.abs(point.progress - candidate.progress),
      );

      if (progressDistance < TRACK_CLEARANCE_PROGRESS_GAP) {
        continue;
      }

      const distance = Math.hypot(point.x - candidate.x, point.y - candidate.y);

      if (
        protectedPoints[candidateIndex] &&
        distance <= TRACK_OVERPASS_CLEARANCE_DISTANCE
      ) {
        return Number.POSITIVE_INFINITY;
      }

      if (distance < nearestDistance) {
        nearestDistance = distance;
      }
    }

    return nearestDistance * TRACK_CLEARANCE_RATIO;
  });
}

export function getLeveledTrackElevations(
  points: readonly TrackElevationPoint[],
  ranges: readonly TrackProgressRange[] = [],
  transitionProgress = 0.018,
) {
  let elevations = points.map((point) => point.elevationM);

  for (const range of ranges) {
    if (!range.level) {
      continue;
    }

    const deckIndexes = points
      .map((point, index) => progressInRange(point.progress, range) ? index : -1)
      .filter((index) => index >= 0);

    if (deckIndexes.length === 0) {
      continue;
    }

    const deckElevationM = deckIndexes.reduce(
      (sum, index) => sum + elevations[index],
      0,
    ) / deckIndexes.length;

    elevations = points.map((point, index) => {
      if (progressInRange(point.progress, range)) {
        return deckElevationM;
      }

      const distanceToDeck = Math.min(
        circularProgressDistance(point.progress, range.from),
        circularProgressDistance(point.progress, range.to),
      );

      if (distanceToDeck >= transitionProgress) {
        return elevations[index];
      }

      const blend = smoothStep(1 - distanceToDeck / transitionProgress);
      return elevations[index] + (deckElevationM - elevations[index]) * blend;
    });
  }

  return elevations;
}

export function getBankingElevationM(
  angleDeg: number,
  lateralOffsetM: number,
  verticalExaggeration: number,
) {
  const safeExaggeration = Math.max(verticalExaggeration, 1);

  return Math.tan((angleDeg * Math.PI) / 180) * lateralOffsetM / safeExaggeration;
}

function progressInRange(progress: number, range: TrackProgressRange) {
  return range.from <= range.to
    ? progress >= range.from && progress <= range.to
    : progress >= range.from || progress <= range.to;
}

function circularProgressDistance(left: number, right: number) {
  const distance = Math.abs(left - right);
  return Math.min(distance, 1 - distance);
}

function smoothStep(value: number) {
  return value * value * (3 - 2 * value);
}
