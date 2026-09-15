export type RaceDisplayStatus = "Завершен" | "Текущий этап" | "Ожидается";

export function formatRaceStatus(
  rawStatus: string,
  isCurrent: boolean,
  isCompletedByStandings = false,
): RaceDisplayStatus | string {
  if (rawStatus === "completed" || rawStatus === "finished" || isCompletedByStandings) {
    return "Завершен";
  }

  if (isCurrent) {
    return "Текущий этап";
  }

  if (rawStatus === "scheduled") {
    return "Ожидается";
  }

  return rawStatus;
}
