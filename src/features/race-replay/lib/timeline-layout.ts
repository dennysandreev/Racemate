export function layoutTimelineMarkers<T extends { offsetMs: number }>(
  markers: readonly T[],
  durationMs: number,
  maximumLanes = 4,
) {
  const laneCount = Math.max(1, Math.floor(maximumLanes));
  const minimumGapMs = Math.max(1_000, durationMs * 0.004);
  const lastOffsetByLane = Array.from({ length: laneCount }, () => Number.NEGATIVE_INFINITY);

  return markers.map((marker) => {
    let lane = lastOffsetByLane.findIndex((lastOffset) => marker.offsetMs - lastOffset >= minimumGapMs);

    if (lane === -1) {
      lane = lastOffsetByLane.indexOf(Math.min(...lastOffsetByLane));
    }

    lastOffsetByLane[lane] = marker.offsetMs;

    return { ...marker, lane };
  });
}
