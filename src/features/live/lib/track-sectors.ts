type SectorPoint = {
  progress: number;
  svgX: number;
  svgY: number;
};

function normalizedProgress(progress: number, startFinishProgress: number) {
  const value = (progress - startFinishProgress) % 1;
  return value < 0 ? value + 1 : value;
}

export function buildMarshalSectorPath(
  centerline: SectorPoint[],
  sector: number,
  sectorCount: number,
  startFinishProgress = 0,
) {
  if (
    !Number.isInteger(sector) ||
    !Number.isInteger(sectorCount) ||
    sector < 1 ||
    sector > sectorCount ||
    sectorCount < 1
  )
    return "";

  const points = centerline
    .filter(
      (point) =>
        Number.isFinite(point.progress) &&
        Number.isFinite(point.svgX) &&
        Number.isFinite(point.svgY),
    )
    .map((point) => ({
      ...point,
      relativeProgress: normalizedProgress(point.progress, startFinishProgress),
    }))
    .sort((a, b) => a.relativeProgress - b.relativeProgress)
    .filter(
      (point, index, values) =>
        index === 0 ||
        Math.abs(point.relativeProgress - values[index - 1].relativeProgress) >
          1e-6,
    );

  if (points.length < 2) return "";

  const pointAt = (progress: number) => {
    let upperIndex = points.findIndex(
      (point) => point.relativeProgress >= progress,
    );
    if (upperIndex < 0) upperIndex = 0;
    const upper = points[upperIndex];
    const lower = points[(upperIndex - 1 + points.length) % points.length];
    const lowerProgress =
      upperIndex === 0 ? lower.relativeProgress - 1 : lower.relativeProgress;
    const upperProgress =
      upperIndex === 0 && progress > upper.relativeProgress
        ? upper.relativeProgress + 1
        : upper.relativeProgress;
    const target = progress < lowerProgress ? progress + 1 : progress;
    const span = Math.max(upperProgress - lowerProgress, 1e-6);
    const ratio = Math.max(0, Math.min(1, (target - lowerProgress) / span));
    return {
      x: lower.svgX + (upper.svgX - lower.svgX) * ratio,
      y: lower.svgY + (upper.svgY - lower.svgY) * ratio,
    };
  };

  const start = (sector - 1) / sectorCount;
  const end = sector / sectorCount;
  const segment = [
    pointAt(start),
    ...points
      .filter(
        (point) =>
          point.relativeProgress > start && point.relativeProgress < end,
      )
      .map((point) => ({ x: point.svgX, y: point.svgY })),
    pointAt(end),
  ];

  return segment
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
    )
    .join(" ");
}
