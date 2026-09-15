export function buildOpenF1StartingGridUrl(baseUrl, qualifyingSessionKey) {
  const sessionKey = Number(qualifyingSessionKey);

  if (!Number.isInteger(sessionKey) || sessionKey <= 0) {
    return null;
  }

  return `${String(baseUrl).replace(/\/$/, "")}/starting_grid?session_key=${sessionKey}`;
}

export function normalizeOpenF1StartingGrid(payload) {
  const byDriver = new Map();

  for (const row of Array.isArray(payload) ? payload : []) {
    const driverNumber = Number(row?.driver_number);
    const position = Number(row?.position);

    if (!Number.isInteger(driverNumber) || driverNumber <= 0 || !Number.isInteger(position) || position <= 0) {
      continue;
    }

    byDriver.set(driverNumber, {
      driverNumber,
      lapDuration: numberOrNull(row?.lap_duration ?? row?.duration),
      position,
      rawPayload: row,
    });
  }

  return [...byDriver.values()].sort((left, right) => left.position - right.position);
}

export function isOpenF1StartingGridReady(rows, { minimumRows = 20 } = {}) {
  if (!Array.isArray(rows) || rows.length < minimumRows) {
    return false;
  }

  const positions = new Set(rows.map((row) => row.position));
  const drivers = new Set(rows.map((row) => row.driverNumber));

  return positions.size === rows.length && drivers.size === rows.length;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
