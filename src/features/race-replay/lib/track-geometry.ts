import type { TrackPoint } from "@/types/racemate";

export const TRACK_WIDTH = 26;

export type TrackSample = {
  /* progress хранится в «развёрнутом» виде (последние точки могут быть > 1), чтобы массив оставался монотонным для бинарного поиска */
  progress: number;
  x: number;
  y: number;
  headingRad: number;
  curvature: number;
};

export type TrackCorner = {
  number: number;
  apexProgress: number;
  kerbPathD: string;
  labelX: number;
  labelY: number;
};

export type TrackGeometry = {
  samples: TrackSample[];
  pathD: string;
  edgeLeftD: string;
  edgeRightD: string;
  sectorPaths: { color: string; label: string; pathD: string }[];
  corners: TrackCorner[];
  startFinish: { x: number; y: number; headingRad: number };
  pointAt: (progress: number) => { x: number; y: number; headingRad: number };
};

export type PitGeometry = {
  pathD: string;
  label: { x: number; y: number };
  pointAt: (t: number) => { x: number; y: number; headingRad: number };
};

type XY = { x: number; y: number };

const SECTOR_COLORS = [
  { color: "var(--race-replay-sector-1)", label: "Сектор 1" },
  { color: "var(--race-replay-sector-2)", label: "Сектор 2" },
  { color: "var(--race-replay-sector-3)", label: "Сектор 3" },
];

export function buildTrackGeometry(centerline: TrackPoint[], startFinishProgress = 0): TrackGeometry | null {
  const base = dedupeBasePoints(centerline);

  if (base.length < 8) {
    return null;
  }

  const samples = sampleClosedSpline(base);
  assignHeadingAndCurvature(samples);

  const pointAt = makeProgressLookup(samples);
  const corners = detectCorners(samples, startFinishProgress);
  const startPoint = pointAt(startFinishProgress);

  return {
    corners,
    edgeLeftD: buildOffsetPathD(samples, TRACK_WIDTH / 2),
    edgeRightD: buildOffsetPathD(samples, -TRACK_WIDTH / 2),
    pathD: buildClosedBezierPathD(base),
    pointAt,
    samples,
    sectorPaths: buildSectorPaths(samples),
    // Координаты в атрибутах SVG округляем: разница в последнем бите float
    // между сервером и браузером ломает гидрацию и вызывает полный ре-рендер.
    startFinish: {
      headingRad: roundTo(startPoint.headingRad, 4),
      x: roundTo(startPoint.x, 1),
      y: roundTo(startPoint.y, 1),
    },
  };
}

export function buildPitGeometry(points: { svgX: number; svgY: number }[]): PitGeometry | null {
  const clean = points.filter((point) => Number.isFinite(point.svgX) && Number.isFinite(point.svgY));

  if (clean.length < 3) {
    return null;
  }

  const distances = [0];

  for (let index = 1; index < clean.length; index += 1) {
    distances.push(
      distances[index - 1] + Math.hypot(clean[index].svgX - clean[index - 1].svgX, clean[index].svgY - clean[index - 1].svgY),
    );
  }

  const total = Math.max(distances[distances.length - 1], 1);
  const middle = clean[Math.floor(clean.length / 2)];
  const middleNext = clean[Math.min(clean.length - 1, Math.floor(clean.length / 2) + 1)];
  const normal = normalOf(Math.atan2(middleNext.svgY - middle.svgY, middleNext.svgX - middle.svgX));

  return {
    label: { x: roundTo(middle.svgX + normal.x * 16, 1), y: roundTo(middle.svgY + normal.y * 16, 1) },
    pathD: clean
      .map((point, index) => `${index === 0 ? "M" : "L"}${point.svgX.toFixed(1)} ${point.svgY.toFixed(1)}`)
      .join(" "),
    pointAt: (t: number) => {
      const target = clampNumber(t, 0, 1) * total;
      let low = 0;
      let high = distances.length - 1;

      while (low < high) {
        const mid = Math.floor((low + high) / 2);

        if (distances[mid] < target) {
          low = mid + 1;
        } else {
          high = mid;
        }
      }

      const upper = Math.max(1, low);
      const lower = upper - 1;
      const span = Math.max(distances[upper] - distances[lower], 1e-6);
      const ratio = clampNumber((target - distances[lower]) / span, 0, 1);
      const a = clean[lower];
      const b = clean[upper];

      return {
        headingRad: Math.atan2(b.svgY - a.svgY, b.svgX - a.svgX),
        x: a.svgX + (b.svgX - a.svgX) * ratio,
        y: a.svgY + (b.svgY - a.svgY) * ratio,
      };
    },
  };
}

function dedupeBasePoints(centerline: TrackPoint[]) {
  const sorted = [...centerline]
    .filter((point) => Number.isFinite(point.svgX) && Number.isFinite(point.svgY) && Number.isFinite(point.progress))
    .sort((a, b) => a.progress - b.progress);
  const result: TrackPoint[] = [];

  for (const point of sorted) {
    const previous = result[result.length - 1];

    if (previous && Math.hypot(point.svgX - previous.svgX, point.svgY - previous.svgY) < 0.8) {
      continue;
    }

    result.push(point);
  }

  const first = result[0];
  const last = result[result.length - 1];

  if (first && last && result.length > 2 && Math.hypot(first.svgX - last.svgX, first.svgY - last.svgY) < 0.8) {
    result.pop();
  }

  return result;
}

function catmullRom(p0: XY, p1: XY, p2: XY, p3: XY, t: number): XY {
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

function sampleClosedSpline(base: TrackPoint[]): TrackSample[] {
  const count = base.length;
  const samples: TrackSample[] = [];

  for (let index = 0; index < count; index += 1) {
    const p0 = toXY(base[(index - 1 + count) % count]);
    const p1 = toXY(base[index]);
    const p2 = toXY(base[(index + 1) % count]);
    const p3 = toXY(base[(index + 2) % count]);
    const progressStart = base[index].progress;
    const progressEndRaw = base[(index + 1) % count].progress;
    const progressEnd = index === count - 1 ? progressEndRaw + 1 : progressEndRaw;
    const segmentLength = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const steps = Math.min(28, Math.max(4, Math.round(segmentLength / 2.5)));

    for (let step = 0; step < steps; step += 1) {
      const t = step / steps;
      const point = catmullRom(p0, p1, p2, p3, t);

      samples.push({
        curvature: 0,
        headingRad: 0,
        progress: progressStart + (progressEnd - progressStart) * t,
        x: point.x,
        y: point.y,
      });
    }
  }

  return samples;
}

function assignHeadingAndCurvature(samples: TrackSample[]) {
  const count = samples.length;

  for (let index = 0; index < count; index += 1) {
    const previous = samples[(index - 1 + count) % count];
    const next = samples[(index + 1) % count];
    samples[index].headingRad = Math.atan2(next.y - previous.y, next.x - previous.x);
  }

  for (let index = 0; index < count; index += 1) {
    const previous = samples[(index - 1 + count) % count];
    const next = samples[(index + 1) % count];
    const arc = Math.hypot(next.x - previous.x, next.y - previous.y);
    samples[index].curvature = arc > 1e-6 ? angleDelta(previous.headingRad, next.headingRad) / arc : 0;
  }

  smoothCurvature(samples, 3);
}

function smoothCurvature(samples: TrackSample[], radius: number) {
  const count = samples.length;
  const smoothed = new Array<number>(count);

  for (let index = 0; index < count; index += 1) {
    let sum = 0;

    for (let offset = -radius; offset <= radius; offset += 1) {
      sum += samples[(index + offset + count) % count].curvature;
    }

    smoothed[index] = sum / (radius * 2 + 1);
  }

  for (let index = 0; index < count; index += 1) {
    samples[index].curvature = smoothed[index];
  }
}

function makeProgressLookup(samples: TrackSample[]) {
  const first = samples[0].progress;

  return (progress: number) => {
    let target = ((progress % 1) + 1) % 1;

    if (target < first) {
      target += 1;
    }

    let low = 0;
    let high = samples.length - 1;

    while (low < high) {
      const mid = Math.floor((low + high) / 2);

      if (samples[mid].progress < target) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    const upper = Math.max(1, low);
    const lower = upper - 1;
    const a = samples[lower];
    const b = samples[upper];
    const span = Math.max(b.progress - a.progress, 1e-9);
    const ratio = clampNumber((target - a.progress) / span, 0, 1);

    return {
      headingRad: a.headingRad + angleDelta(a.headingRad, b.headingRad) * ratio,
      x: a.x + (b.x - a.x) * ratio,
      y: a.y + (b.y - a.y) * ratio,
    };
  };
}

function buildClosedBezierPathD(base: TrackPoint[]) {
  const count = base.length;
  const commands = [`M${base[0].svgX.toFixed(1)} ${base[0].svgY.toFixed(1)}`];

  for (let index = 0; index < count; index += 1) {
    const p0 = toXY(base[(index - 1 + count) % count]);
    const p1 = toXY(base[index]);
    const p2 = toXY(base[(index + 1) % count]);
    const p3 = toXY(base[(index + 2) % count]);
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };

    commands.push(
      `C${c1.x.toFixed(1)} ${c1.y.toFixed(1)} ${c2.x.toFixed(1)} ${c2.y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`,
    );
  }

  commands.push("Z");

  return commands.join(" ");
}

function buildOffsetPathD(samples: TrackSample[], offset: number) {
  const commands = samples.map((sample, index) => {
    const normal = normalOf(sample.headingRad);
    const x = sample.x + normal.x * offset;
    const y = sample.y + normal.y * offset;

    return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  });

  commands.push("Z");

  return commands.join(" ");
}

function buildSectorPaths(samples: TrackSample[]) {
  return SECTOR_COLORS.map((sector, index) => {
    const start = index / 3;
    const end = (index + 1) / 3;
    const commands: string[] = [];
    let previousIndex: number | null = null;

    samples.forEach((sample, sampleIndex) => {
      const progress = sample.progress % 1;

      if (progress < start || progress > end) {
        return;
      }

      /* Разрыв по индексу означает переход через стык массива — начинаем новый подпуть, иначе появится хорда через инфилд */
      const isContinuation = previousIndex !== null && sampleIndex - previousIndex === 1;
      commands.push(`${isContinuation ? "L" : "M"}${sample.x.toFixed(1)} ${sample.y.toFixed(1)}`);
      previousIndex = sampleIndex;
    });

    return { ...sector, pathD: commands.join(" ") };
  });
}

function detectCorners(samples: TrackSample[], startFinishProgress: number) {
  const count = samples.length;
  const threshold = 0.016;
  const zones: { start: number; end: number }[] = [];
  let zoneStart: number | null = null;

  for (let index = 0; index < count; index += 1) {
    const isCorner = Math.abs(samples[index].curvature) > threshold;

    if (isCorner && zoneStart === null) {
      zoneStart = index;
    } else if (!isCorner && zoneStart !== null) {
      zones.push({ end: index - 1, start: zoneStart });
      zoneStart = null;
    }
  }

  if (zoneStart !== null) {
    zones.push({ end: count - 1, start: zoneStart });
  }

  const merged: { start: number; end: number }[] = [];

  for (const zone of zones) {
    const previous = merged[merged.length - 1];

    if (previous && zone.start - previous.end <= 8 && sameTurnDirection(samples, previous, zone)) {
      previous.end = zone.end;
      continue;
    }

    merged.push({ ...zone });
  }

  const corners = merged
    .map((zone) => {
      let totalTurn = 0;
      let apexIndex = zone.start;

      for (let index = zone.start; index <= zone.end; index += 1) {
        const next = samples[(index + 1) % count];
        totalTurn += Math.abs(angleDelta(samples[index].headingRad, next.headingRad));

        if (Math.abs(samples[index].curvature) > Math.abs(samples[apexIndex].curvature)) {
          apexIndex = index;
        }
      }

      return { apexIndex, totalTurn, zone };
    })
    .filter((corner) => corner.totalTurn > 0.5)
    .map((corner) => {
      const apex = samples[corner.apexIndex];
      const outerSign = -Math.sign(apex.curvature || 1);
      const normal = normalOf(apex.headingRad);
      const kerbStart = Math.max(0, corner.zone.start - 3);
      const kerbEnd = Math.min(count - 1, corner.zone.end + 3);
      const kerbOffset = (TRACK_WIDTH / 2 + 3) * outerSign;
      const kerbPathD = samples
        .slice(kerbStart, kerbEnd + 1)
        .map((sample, index) => {
          const sampleNormal = normalOf(sample.headingRad);
          const x = sample.x + sampleNormal.x * kerbOffset;
          const y = sample.y + sampleNormal.y * kerbOffset;

          return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(" ");
      const labelOffset = (TRACK_WIDTH / 2 + 17) * outerSign;

      return {
        apexProgress: ((apex.progress % 1) + 1) % 1,
        kerbPathD,
        labelX: roundTo(apex.x + normal.x * labelOffset, 1),
        labelY: roundTo(apex.y + normal.y * labelOffset, 1),
        number: 0,
      };
    })
    .sort((a, b) => sortKey(a.apexProgress, startFinishProgress) - sortKey(b.apexProgress, startFinishProgress));

  return corners.map((corner, index) => ({ ...corner, number: index + 1 }));

  function sortKey(progress: number, origin: number) {
    return ((progress - origin) % 1 + 1) % 1;
  }
}

function sameTurnDirection(
  samples: TrackSample[],
  a: { start: number; end: number },
  b: { start: number; end: number },
) {
  const signA = Math.sign(samples[Math.floor((a.start + a.end) / 2)].curvature);
  const signB = Math.sign(samples[Math.floor((b.start + b.end) / 2)].curvature);

  return signA === signB;
}

function toXY(point: TrackPoint): XY {
  return { x: point.svgX, y: point.svgY };
}

function normalOf(headingRad: number) {
  return { x: -Math.sin(headingRad), y: Math.cos(headingRad) };
}

function angleDelta(from: number, to: number) {
  let delta = to - from;

  while (delta > Math.PI) {
    delta -= Math.PI * 2;
  }

  while (delta < -Math.PI) {
    delta += Math.PI * 2;
  }

  return delta;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, digits: number) {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}
