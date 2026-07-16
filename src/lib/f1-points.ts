export function getRoundResultPoints(
  rawPoints: number | string | null,
  sessionType: string,
  position: number | null,
) {
  const normalizedType = sessionType.toLowerCase();
  const points = rawPoints === null || rawPoints === undefined ? null : Number(rawPoints);
  const maxExpectedPoints = normalizedType === "sprint" ? 8 : normalizedType === "race" ? 26 : 0;

  if (points !== null && Number.isFinite(points) && points <= maxExpectedPoints) {
    return points;
  }

  if (normalizedType === "sprint") {
    return getSprintPointsByPosition(position);
  }

  if (normalizedType === "race") {
    return getRacePointsByPosition(position);
  }

  return null;
}

function getRacePointsByPosition(position: number | null) {
  const pointsByPosition = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

  return position && position > 0 ? pointsByPosition[position - 1] ?? 0 : 0;
}

function getSprintPointsByPosition(position: number | null) {
  const pointsByPosition = [8, 7, 6, 5, 4, 3, 2, 1];

  return position && position > 0 ? pointsByPosition[position - 1] ?? 0 : 0;
}
