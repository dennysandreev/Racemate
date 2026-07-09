import type { ReplayPositionEvent } from "@/types/racemate";

export const MAX_MOTION_GAP_MS = 180_000;

export type DriverMotion = {
  events: ReplayPositionEvent[];
  times: number[];
  values: number[];
  slopes: number[];
};

export type MotionSample = {
  unwrapped: number;
  hold: boolean;
};

/*
 * Прогресс по кругу «разворачивается» в монотонную величину (круги + доля круга),
 * а между сэмплами телеметрии интерполируется монотонным кубическим сплайном
 * Фритча-Карлсона: скорость меняется плавно и машина никогда не едет назад.
 */
export function buildDriverMotion(events: ReplayPositionEvent[]): DriverMotion {
  const sorted = [...events].sort((a, b) => a.offsetMs - b.offsetMs);
  const trackEvents = sorted.filter((event) => !event.isPitLane && Number.isFinite(event.progress));
  const times: number[] = [];
  const values: number[] = [];
  let unwrapped = 0;
  let previousProgress: number | null = null;

  for (const event of trackEvents) {
    if (previousProgress === null) {
      unwrapped = event.progress;
    } else {
      let delta = event.progress - previousProgress;

      if (delta < -0.5) {
        delta += 1;
      } else if (delta > 0.5) {
        delta -= 1;
      }

      unwrapped += Math.max(0, delta);
    }

    previousProgress = event.progress;
    times.push(event.offsetMs);
    values.push(unwrapped);
  }

  return {
    events: sorted,
    slopes: fritschCarlsonSlopes(times, values),
    times,
    values,
  };
}

export function trackProgressAt(motion: DriverMotion, elapsedMs: number): MotionSample | null {
  const { times, values, slopes } = motion;

  if (!times.length) {
    return null;
  }

  if (elapsedMs <= times[0]) {
    return { hold: true, unwrapped: values[0] };
  }

  const lastIndex = times.length - 1;

  if (elapsedMs >= times[lastIndex]) {
    return { hold: true, unwrapped: values[lastIndex] };
  }

  let low = 0;
  let high = lastIndex;

  while (low < high - 1) {
    const mid = Math.floor((low + high) / 2);

    if (times[mid] <= elapsedMs) {
      low = mid;
    } else {
      high = mid;
    }
  }

  const span = times[high] - times[low];

  if (span > MAX_MOTION_GAP_MS) {
    return { hold: true, unwrapped: values[low] };
  }

  const t = (elapsedMs - times[low]) / Math.max(span, 1e-6);
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  const value =
    h00 * values[low] +
    h10 * span * slopes[low] +
    h01 * values[high] +
    h11 * span * slopes[high];

  return { hold: false, unwrapped: Math.max(values[low], Math.min(values[high], value)) };
}

/*
 * Фазы пит-стопа: замедление к боксу, стоянка на время pit stop, разгон на выезд.
 * Возвращает параметр 0..1 вдоль пит-лейна.
 */
export function pitLaneParamAt(
  window: { startMs: number; endMs: number; pitStopSeconds: number | null },
  elapsedMs: number,
): number {
  const total = Math.max(window.endMs - window.startMs, 1);
  const local = Math.min(Math.max(elapsedMs - window.startMs, 0), total);
  const stopMs = window.pitStopSeconds !== null ? window.pitStopSeconds * 1000 : 0;
  const boxParam = 0.52;

  if (stopMs <= 0 || stopMs >= total * 0.9) {
    return local / total;
  }

  const driveMs = (total - stopMs) / 2;

  if (local <= driveMs) {
    return easeOutCubic(local / driveMs) * boxParam;
  }

  if (local <= driveMs + stopMs) {
    return boxParam;
  }

  return boxParam + easeInCubic((local - driveMs - stopMs) / driveMs) * (1 - boxParam);
}

function fritschCarlsonSlopes(times: number[], values: number[]) {
  const count = times.length;
  const slopes = new Array<number>(count).fill(0);

  if (count < 2) {
    return slopes;
  }

  const deltas: number[] = [];

  for (let index = 0; index < count - 1; index += 1) {
    const span = Math.max(times[index + 1] - times[index], 1e-6);
    deltas.push((values[index + 1] - values[index]) / span);
  }

  slopes[0] = deltas[0];
  slopes[count - 1] = deltas[count - 2];

  for (let index = 1; index < count - 1; index += 1) {
    slopes[index] = deltas[index - 1] * deltas[index] <= 0 ? 0 : (deltas[index - 1] + deltas[index]) / 2;
  }

  for (let index = 0; index < count - 1; index += 1) {
    if (deltas[index] === 0) {
      slopes[index] = 0;
      slopes[index + 1] = 0;
      continue;
    }

    const alpha = slopes[index] / deltas[index];
    const beta = slopes[index + 1] / deltas[index];
    const norm = alpha * alpha + beta * beta;

    if (norm > 9) {
      const tau = 3 / Math.sqrt(norm);
      slopes[index] = tau * alpha * deltas[index];
      slopes[index + 1] = tau * beta * deltas[index];
    }
  }

  return slopes;
}

function easeOutCubic(t: number) {
  const clamped = Math.min(Math.max(t, 0), 1);

  return 1 - Math.pow(1 - clamped, 3);
}

function easeInCubic(t: number) {
  const clamped = Math.min(Math.max(t, 0), 1);

  return clamped * clamped * clamped;
}
