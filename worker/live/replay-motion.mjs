import {
  buildDriverMotion,
  trackProgressAt,
  isDriverRetiredOnTrack,
} from "../../src/features/race-replay/lib/motion.ts";
import { buildTrackGeometry } from "../../src/features/race-replay/lib/track-geometry.ts";

// Only the historical simulator may look ahead. Real OpenF1 packets continue
// through the unchanged live pipeline and freeze when confirmed data runs out.
export function createReplayMotion(replay) {
  const geometry = buildTrackGeometry(
    replay.track.centerline,
    replay.track.startFinish?.progress ?? 0,
  );
  const drivers = new Map();
  for (const p of replay.positions) {
    if (!drivers.has(p.driverNumber)) drivers.set(p.driverNumber, []);
    drivers.get(p.driverNumber).push(p);
  }
  const motions = [...drivers].map(([driverNumber, points]) => ({
    driverNumber,
    motion: buildDriverMotion(points, {
      lapTimings: replay.lapTimings?.filter(
        (lap) => lap.driverNumber === driverNumber,
      ),
    }),
  }));
  return (elapsedMs) =>
    motions.flatMap(({ driverNumber, motion }) => {
      const points = motion.events;
      if (!points.length || elapsedMs < points[0].offsetMs) return [];
      let low = 0,
        high = points.length;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (points[middle].offsetMs <= elapsedMs) low = middle + 1;
        else high = middle;
      }
      const previous = points[low - 1],
        next = points[low] ?? previous;
      const span = next.offsetMs - previous.offsetMs;
      const ratio =
        span > 0
          ? Math.max(0, Math.min(1, (elapsedMs - previous.offsetMs) / span))
          : 0;
      let x = previous.svgX,
        y = previous.svgY,
        progress = previous.progress;
      const retired = isDriverRetiredOnTrack(
        points,
        elapsedMs,
        motion.finalLapComplete,
      );
      if (!retired && (previous.isPitLane || next.isPitLane || !geometry)) {
        x += (next.svgX - x) * ratio;
        y += (next.svgY - y) * ratio;
        let delta = next.progress - progress;
        if (delta < -0.5) delta += 1;
        if (delta > 0.5) delta -= 1;
        progress = ((progress + delta * ratio) % 1 + 1) % 1;
      } else if (!retired && geometry) {
        const sample = trackProgressAt(motion, elapsedMs);
        if (sample) {
          progress = ((sample.unwrapped % 1) + 1) % 1;
          const point = geometry.pointAt(progress);
          x = point.x;
          y = point.y;
        }
      }
      return [
        {
          driver_number: driverNumber,
          retired,
          recordedOffsetMs: previous.offsetMs,
          svgX: x,
          svgY: y,
          x,
          y,
          z: previous.z ?? 0,
          progress,
        },
      ];
    });
}
