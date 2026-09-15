import type { DriverLiveState } from "./types";

const TREND_THRESHOLD_SECONDS = 0.05;
const OVERTAKE_ZONE_SECONDS = 1;

export type RacePaceTrend = {
  aheadAverage: number | null;
  aheadLaps: number;
  aheadName: string | null;
  average: number | null;
  gainPerLap: number | null;
  interval: number | null;
  kind: "leader" | "gaining" | "losing" | "steady" | "unknown";
  label: string;
  laps: number;
  lapsToOvertakeZone: number | null;
};

function cleanAverage(driver: DriverLiveState | undefined) {
  const laps = (driver?.pace ?? []).filter((lap) => !lap.pit).slice(-3);
  return {
    average:
      laps.length === 3
        ? laps.reduce((sum, lap) => sum + lap.duration, 0) / laps.length
        : null,
    laps: laps.length,
  };
}

function intervalSeconds(value: DriverLiveState["interval"]) {
  if (typeof value === "number")
    return Number.isFinite(value) && value >= 0 ? value : null;
  const match = String(value ?? "")
    .trim()
    .match(/^\+?(\d+(?:\.\d+)?)$/);
  return match ? Number(match[1]) : null;
}

export function getRacePaceTrend(
  driver: DriverLiveState,
  ahead: DriverLiveState | undefined,
): RacePaceTrend {
  const own = cleanAverage(driver);
  const target = cleanAverage(ahead);
  const interval = intervalSeconds(driver.interval);

  if (!ahead)
    return {
      aheadAverage: null,
      aheadLaps: 0,
      aheadName: null,
      average: own.average,
      gainPerLap: null,
      interval,
      kind: "leader",
      label: "Лидер",
      laps: own.laps,
      lapsToOvertakeZone: null,
    };

  if (own.average === null || target.average === null)
    return {
      aheadAverage: target.average,
      aheadLaps: target.laps,
      aheadName: ahead.acronym,
      average: own.average,
      gainPerLap: null,
      interval,
      kind: "unknown",
      label: "Мало данных",
      laps: own.laps,
      lapsToOvertakeZone: null,
    };

  const gainPerLap = target.average - own.average;
  const kind =
    gainPerLap > TREND_THRESHOLD_SECONDS
      ? "gaining"
      : gainPerLap < -TREND_THRESHOLD_SECONDS
        ? "losing"
        : "steady";
  const lapsToOvertakeZone =
    kind === "gaining" && interval !== null
      ? interval <= OVERTAKE_ZONE_SECONDS
        ? 0
        : Math.ceil((interval - OVERTAKE_ZONE_SECONDS) / gainPerLap)
      : null;

  return {
    aheadAverage: target.average,
    aheadLaps: target.laps,
    aheadName: ahead.acronym,
    average: own.average,
    gainPerLap,
    interval,
    kind,
    label:
      kind === "gaining"
        ? "Догоняет"
        : kind === "losing"
          ? "Отстаёт"
          : "Ровный темп",
    laps: own.laps,
    lapsToOvertakeZone,
  };
}
