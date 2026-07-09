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
 *
 * Источник телеметрии периодически замораживает координаты на десятки секунд,
 * за которые машина успевает проехать целый круг — поэтому замороженные точки
 * схлопываются, а на длинных дырах потерянные круги восстанавливаются по темпу
 * пилота (фазовая развертка с приором по скорости).
 */
export function buildDriverMotion(events: ReplayPositionEvent[]): DriverMotion {
  const sorted = [...events].sort((a, b) => a.offsetMs - b.offsetMs);
  const trackEvents = collapseFrozenRuns(
    sorted.filter((event) => !event.isPitLane && Number.isFinite(event.progress)),
  );
  const pitTimes = sorted.filter((event) => event.isPitLane).map((event) => event.offsetMs);
  const paceLapMs = estimateLapMs(trackEvents);
  const times: number[] = [];
  const values: number[] = [];
  let unwrapped = 0;
  let previous: ReplayPositionEvent | null = null;

  for (const event of trackEvents) {
    if (previous === null) {
      unwrapped = event.progress;
    } else {
      let delta = wrapDelta(previous.progress, event.progress);
      const gapMs = event.offsetMs - previous.offsetMs;
      const crossesPit = hasPitTimeBetween(pitTimes, previous.offsetMs, event.offsetMs);

      if (paceLapMs !== null && !crossesPit && gapMs > paceLapMs * 0.55 && gapMs <= MAX_MOTION_GAP_MS) {
        const expectedLaps = gapMs / paceLapMs;
        const anchorPrevious = anchorLapsOf(previous);
        const anchorCurrent = anchorLapsOf(event);
        // Круги из таймингов надежнее среднего темпа, когда есть у обеих точек.
        const estimate = anchorPrevious !== null && anchorCurrent !== null
          ? anchorCurrent - anchorPrevious - delta
          : expectedLaps - delta;
        const missedLaps = Math.max(0, Math.min(Math.round(estimate), Math.ceil(expectedLaps) + 1));
        delta += missedLaps;
      }

      unwrapped += Math.max(0, delta);

      const anchor = anchorLapsOf(event);

      // Накопленное отставание от таймингов гасим ресинком, но только вперед,
      // чтобы машина никогда не поехала назад (лаг обновления круга дает ±1).
      if (anchor !== null && anchor - unwrapped > 1.5) {
        unwrapped = anchor;
      }
    }

    previous = event;
    times.push(event.offsetMs);
    values.push(unwrapped);
  }

  const cleaned = cleanStallArtifacts(times, values);

  return {
    events: sorted,
    slopes: fritschCarlsonSlopes(cleaned.times, cleaned.values),
    times: cleaned.times,
    values: cleaned.values,
  };
}

function anchorLapsOf(event: ReplayPositionEvent) {
  return typeof event.lapNumber === "number" && Number.isFinite(event.lapNumber) && event.lapNumber > 0
    ? event.lapNumber - 1 + event.progress
    : null;
}

function wrapDelta(from: number, to: number) {
  let delta = to - from;

  if (delta < -0.5) {
    delta += 1;
  } else if (delta > 0.5) {
    delta -= 1;
  }

  return delta;
}

/*
 * Замороженная телеметрия — подряд идущие сэмплы с одной и той же позицией.
 * Короткие заморозки (< 90 с) выбрасываем целиком: машина в это время ехала,
 * просто данных не было. Длинные оставляем — это настоящая остановка
 * (стартовая решетка, красный флаг, сход).
 */
function collapseFrozenRuns(events: ReplayPositionEvent[]) {
  const result: ReplayPositionEvent[] = [];
  let runStartMs: number | null = null;

  for (const event of events) {
    const last = result[result.length - 1];
    const isFrozen =
      last !== undefined &&
      Math.hypot(event.svgX - last.svgX, event.svgY - last.svgY) < 3 &&
      Math.abs(wrapDelta(last.progress, event.progress)) < 0.001;

    if (isFrozen) {
      if (runStartMs === null) {
        runStartMs = last.offsetMs;
      }

      if (event.offsetMs - runStartMs < 90_000) {
        continue;
      }

      result.push(event);
    } else {
      runStartMs = null;
      result.push(event);
    }
  }

  return result;
}

function estimateLapMs(events: ReplayPositionEvent[]) {
  const speeds: number[] = [];

  for (let index = 1; index < events.length; index += 1) {
    const gapMs = events[index].offsetMs - events[index - 1].offsetMs;

    if (gapMs < 3_000 || gapMs > 15_000) {
      continue;
    }

    const delta = wrapDelta(events[index - 1].progress, events[index].progress);

    if (delta < 0.01 || delta > 0.45) {
      continue;
    }

    speeds.push(delta / gapMs);
  }

  if (speeds.length < 20) {
    return null;
  }

  speeds.sort((a, b) => a - b);

  return 1 / speeds[Math.floor(speeds.length / 2)];
}

function hasPitTimeBetween(pitTimes: number[], fromMs: number, toMs: number) {
  let low = 0;
  let high = pitTimes.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);

    if (pitTimes[mid] < fromMs) {
      low = mid + 1;
    } else if (pitTimes[mid] > toMs) {
      high = mid - 1;
    } else {
      return true;
    }
  }

  return false;
}

/*
 * На части трасс снаппинг в снапшоте дает «замер-догон»: прогресс не растет
 * один-два сэмпла, а потом скачком наверстывает. Без чистки машина видимо
 * тормозит в ноль и снова разгоняется. Выбрасываем такие точки: настоящие
 * замедления (сейфти-кар, авария) — это длинные серии медленных сэмплов,
 * у них скорость на выходе тоже низкая, и фильтр их не трогает.
 */
function cleanStallArtifacts(times: number[], values: number[]) {
  let currentTimes = times;
  let currentValues = values;

  for (let pass = 0; pass < 3; pass += 1) {
    if (currentTimes.length < 5) {
      break;
    }

    const speeds: number[] = [];

    for (let index = 1; index < currentTimes.length; index += 1) {
      speeds.push(
        (currentValues[index] - currentValues[index - 1]) /
          Math.max(currentTimes[index] - currentTimes[index - 1], 1),
      );
    }

    const positiveSpeeds = speeds.filter((value) => value > 0).sort((a, b) => a - b);
    const median = positiveSpeeds[Math.floor(positiveSpeeds.length / 2)];

    if (!median) {
      break;
    }

    const keep = new Array<boolean>(currentTimes.length).fill(true);
    let removed = 0;

    for (let index = 1; index < currentTimes.length - 1; index += 1) {
      if (currentTimes[index + 1] - currentTimes[index - 1] > 45_000) {
        continue;
      }

      const speedIn = speeds[index - 1];
      const speedOut = speeds[index];
      const isStallThenCatchUp = speedIn < median * 0.35 && speedOut > median * 0.7;
      const isSpikeThenStall = speedIn > median * 1.6 && speedOut < median * 0.35;

      if (isStallThenCatchUp || isSpikeThenStall) {
        keep[index] = false;
        removed += 1;
        index += 1;
      }
    }

    if (!removed) {
      break;
    }

    currentTimes = currentTimes.filter((_, index) => keep[index]);
    currentValues = currentValues.filter((_, index) => keep[index]);
  }

  return { times: currentTimes, values: currentValues };
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
