export type ReplayTimingOrderInput = {
  driverNumber: number;
  gapToLeader: string | null;
  lapNumber: number | null;
  position: number | null;
  status: string;
  hasTimedPosition?: boolean;
};

export type ReplayTimingOrderRow<T extends ReplayTimingOrderInput> = T & {
  displayPosition: number;
  lapDeficit: number | null;
  raceOrder: number;
};

export function orderReplayTimingRows<T extends ReplayTimingOrderInput>(rows: T[]) {
  const ordered = [...rows].sort(compareReplayClassification);
  const leader = ordered.find((row) => row.status !== "NO_DATA") ?? null;

  return ordered.map((row, index): ReplayTimingOrderRow<T> => {
    const classifiedLapDeficit = getClassifiedLapDeficit(row.gapToLeader);
    const fallbackLapDeficit = leader && classifiedLapDeficit === null
      ? getStableLapDeficit(leader, row)
      : null;

    return {
      ...row,
      displayPosition: index + 1,
      lapDeficit: classifiedLapDeficit ?? fallbackLapDeficit,
      raceOrder: getRaceOrder(row),
    };
  });
}

export function getClassifiedLapDeficit(gapToLeader: string | null) {
  if (!gapToLeader) {
    return null;
  }

  const match = gapToLeader.trim().match(/(\d+)\s*(?:laps?|круг(?:а|ов)?)(?=\s|$)/i);

  return match ? Number(match[1]) : null;
}

function compareReplayClassification(
  left: ReplayTimingOrderInput,
  right: ReplayTimingOrderInput,
) {
  return getRaceOrder(left) - getRaceOrder(right) ||
    (left.position ?? Number.MAX_SAFE_INTEGER) - (right.position ?? Number.MAX_SAFE_INTEGER) ||
    left.driverNumber - right.driverNumber;
}

function getRaceOrder(row: ReplayTimingOrderInput) {
  if (row.status === "NO_DATA") {
    return Number.MAX_SAFE_INTEGER;
  }

  if (row.status === "OUT") {
    return 10_000 + (row.position ?? 99);
  }

  return row.hasTimedPosition ? row.position ?? 99 : 5_000 + (row.position ?? 99);
}

function getStableLapDeficit(
  leader: ReplayTimingOrderInput,
  row: ReplayTimingOrderInput,
) {
  if (
    row.status === "OUT" ||
    row.status === "NO_DATA" ||
    leader.lapNumber === null ||
    row.lapNumber === null
  ) {
    return null;
  }

  const rawDeficit = leader.lapNumber - row.lapNumber;

  // Individual lap starts are asynchronous: a car crossing the line a second
  // earlier must not make the rest of the field appear one lap down. A real
  // lapping is confirmed by the official OpenF1 gap string; numeric gaps keep
  // the timing in seconds.
  return rawDeficit >= 2 ? rawDeficit : null;
}
