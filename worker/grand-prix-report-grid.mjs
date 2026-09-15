function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function dateTimestamp(value) {
  const timestamp = Date.parse(value ?? "");
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function buildOpenF1StartingGridByDriverNumber(positionRows) {
  const snapshots = new Map();

  for (const row of Array.isArray(positionRows) ? positionRows : []) {
    const driverNumber = numberOrNull(row?.driver_number);
    const position = numberOrNull(row?.position);
    const timestamp = dateTimestamp(row?.date);

    if (!driverNumber || !position || position < 1 || timestamp === null) {
      continue;
    }

    const snapshot = snapshots.get(timestamp) ?? new Map();
    snapshot.set(driverNumber, position);
    snapshots.set(timestamp, snapshot);
  }

  const candidate = [...snapshots.entries()]
    .filter(([, snapshot]) => snapshot.size >= 2)
    .filter(([, snapshot]) => new Set(snapshot.values()).size === snapshot.size)
    .sort((left, right) => right[1].size - left[1].size || left[0] - right[0])[0];

  return candidate?.[1] ?? new Map();
}
