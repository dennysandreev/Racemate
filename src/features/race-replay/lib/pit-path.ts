import type { CircuitModelPoint } from "@/data/track-model-types";

export type PitTrackProgress = { entry: number; exit: number };

const wrap = (progress: number) => ((progress % 1) + 1) % 1;

// Align the two circuit representations at their shared pit entry and exit.
// Interpolate around the loop, never across it or backwards at start/finish.
export function alignPitTrackProgress(
  progress: number,
  source: PitTrackProgress,
  target: PitTrackProgress,
) {
  const sourcePit = wrap(source.exit - source.entry);
  const targetPit = wrap(target.exit - target.entry);
  const local = wrap(progress - source.entry);
  if (sourcePit < 1e-6 || 1 - sourcePit < 1e-6) return wrap(progress);
  return local <= sourcePit
    ? wrap(target.entry + local / sourcePit * targetPit)
    : wrap(target.exit + (local - sourcePit) / (1 - sourcePit) * (1 - targetPit));
}

export function connectModelPitLane(
  track: readonly CircuitModelPoint[],
  pit: readonly CircuitModelPoint[],
) {
  const nearest = (point: CircuitModelPoint) => track.reduce((best, candidate) =>
    Math.hypot(candidate[1] - point[1], candidate[2] - point[2]) <
    Math.hypot(best[1] - point[1], best[2] - point[2]) ? candidate : best);
  const entry = nearest(pit[0]);
  const exit = nearest(pit[pit.length - 1]);
  const joined = [entry, ...pit, exit];
  const distances = [0];
  for (let i = 1; i < joined.length; i += 1) {
    distances.push(distances[i - 1] + Math.hypot(
      joined[i][1] - joined[i - 1][1], joined[i][2] - joined[i - 1][2],
    ));
  }
  const length = distances.at(-1) || 1;
  return {
    anchors: { entry: wrap(entry[0]), exit: wrap(exit[0]) },
    points: joined.map((point, i): CircuitModelPoint => [distances[i] / length, point[1], point[2], point[3]]),
  };
}
