export type TrackModelPan = {
  x: number;
  y: number;
};

export const TRACK_MODEL_MIN_ZOOM = 0.82;
export const TRACK_MODEL_MAX_ZOOM = 8;
export const TRACK_MODEL_ZOOM_STEP = 0.25;

export type TrackModelCameraState = {
  pan: TrackModelPan;
  rotationDeg: number;
  zoom: number;
};

export function clampTrackModelPan(pan: TrackModelPan, zoom: number): TrackModelPan {
  const limit = Math.max(0.1, (zoom - 1) / 2);

  return {
    x: Math.min(limit, Math.max(-limit, pan.x)),
    y: Math.min(limit, Math.max(-limit, pan.y)),
  };
}

export function zoomTrackModelAtPoint(
  state: Pick<TrackModelCameraState, "pan" | "zoom">,
  nextZoom: number,
  focalPoint: TrackModelPan,
) {
  const zoomRatio = nextZoom / state.zoom;

  return {
    pan: clampTrackModelPan(
      {
        x: focalPoint.x - (focalPoint.x - state.pan.x) * zoomRatio,
        y: focalPoint.y - (focalPoint.y - state.pan.y) * zoomRatio,
      },
      nextZoom,
    ),
    zoom: nextZoom,
  };
}

export function pinchTrackModelCamera({
  currentAngle,
  currentCenter,
  currentDistance,
  maximumZoom,
  minimumZoom,
  startAngle,
  startCenter,
  startDistance,
  startState,
}: {
  currentAngle: number;
  currentCenter: TrackModelPan;
  currentDistance: number;
  maximumZoom: number;
  minimumZoom: number;
  startAngle: number;
  startCenter: TrackModelPan;
  startDistance: number;
  startState: TrackModelCameraState;
}): TrackModelCameraState {
  const scale = currentDistance / Math.max(startDistance, 1);
  const zoom = Math.min(maximumZoom, Math.max(minimumZoom, startState.zoom * scale));
  const effectiveScale = zoom / startState.zoom;
  const angleDelta = Math.atan2(
    Math.sin(currentAngle - startAngle),
    Math.cos(currentAngle - startAngle),
  );

  return {
    pan: clampTrackModelPan(
      {
        x: currentCenter.x - (startCenter.x - startState.pan.x) * effectiveScale,
        y: currentCenter.y - (startCenter.y - startState.pan.y) * effectiveScale,
      },
      zoom,
    ),
    rotationDeg: normalizeDegrees(startState.rotationDeg + (angleDelta * 180) / Math.PI),
    zoom,
  };
}

export function orbitTrackModelCamera({
  deltaX,
  deltaY,
  maximumTiltDeg,
  minimumTiltDeg,
  rotationSensitivity = 0.42,
  startRotationDeg,
  startTiltDeg,
  tiltSensitivity = 0.5,
}: {
  deltaX: number;
  deltaY: number;
  maximumTiltDeg: number;
  minimumTiltDeg: number;
  rotationSensitivity?: number;
  startRotationDeg: number;
  startTiltDeg: number;
  tiltSensitivity?: number;
}) {
  return {
    rotationDeg: normalizeDegrees(startRotationDeg + deltaX * rotationSensitivity),
    tiltDeg: Math.min(
      maximumTiltDeg,
      Math.max(minimumTiltDeg, startTiltDeg + deltaY * tiltSensitivity),
    ),
  };
}

export function normalizeDegrees(value: number) {
  return ((value + 180) % 360 + 360) % 360 - 180;
}
