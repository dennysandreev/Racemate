export type TrackModelPan = {
  x: number;
  y: number;
};

export const TRACK_MODEL_MIN_ZOOM = 0.82;
export const TRACK_MODEL_MAX_ZOOM = 8;
export const TRACK_MODEL_ZOOM_STEP = 0.25;
export const TRACK_MODEL_WEBGL_INITIAL_ZOOM = 1.75;
export const TRACK_MODEL_WEBGL_MOBILE_INITIAL_ZOOM = 1.25;

export function getTrackModelInitialZoom(hasWebGL: boolean, isWideViewport: boolean) {
  if (!hasWebGL) return 1;

  return isWideViewport
    ? TRACK_MODEL_WEBGL_INITIAL_ZOOM
    : TRACK_MODEL_WEBGL_MOBILE_INITIAL_ZOOM;
}

export function trackModelCameraPolarDeg(tiltDeg: number) {
  return Math.min(72, Math.max(40, 48 + (tiltDeg - 10) * 0.34));
}

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

export function preserveTrackModelOrbitFocus({
  nextRotationDeg,
  nextTiltDeg,
  pan,
  startRotationDeg,
  startTiltDeg,
  viewportAspectRatio = 1,
  zoom,
}: {
  nextRotationDeg: number;
  nextTiltDeg: number;
  pan: TrackModelPan;
  startRotationDeg: number;
  startTiltDeg: number;
  viewportAspectRatio?: number;
  zoom: number;
}) {
  if (pan.x === 0 && pan.y === 0) {
    return pan;
  }

  // Three.js orbits the camera around the glTF scene, so the preserved ground
  // focus must be transformed by the inverse azimuth delta.
  const delta = ((startRotationDeg - nextRotationDeg) * Math.PI) / 180;
  const startVerticalScale = Math.cos((trackModelCameraPolarDeg(startTiltDeg) * Math.PI) / 180);
  const nextVerticalScale = Math.cos((trackModelCameraPolarDeg(nextTiltDeg) * Math.PI) / 180);
  const horizontalFocus = pan.x * viewportAspectRatio;
  const depthFocus = -pan.y / Math.max(startVerticalScale, 0.001);
  const rotatedHorizontal = horizontalFocus * Math.cos(delta) - depthFocus * Math.sin(delta);
  const rotatedDepth = horizontalFocus * Math.sin(delta) + depthFocus * Math.cos(delta);

  return clampTrackModelPan(
    {
      x: rotatedHorizontal / Math.max(viewportAspectRatio, 0.001),
      y: -rotatedDepth * nextVerticalScale,
    },
    zoom,
  );
}

export function normalizeDegrees(value: number) {
  return ((value + 180) % 360 + 360) % 360 - 180;
}
