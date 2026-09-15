import type { SeasonGlobePhase } from "@/types/racemate";

type PhaseSource = {
  completed: boolean;
  round: number;
};

export function classifySeasonGlobeEvents<T extends PhaseSource>(events: T[]) {
  const ordered = [...events].sort((left, right) => left.round - right.round);
  const nextRound = ordered.find((event) => !event.completed)?.round ?? null;

  return {
    nextRound,
    events: ordered.map((event) => ({
      ...event,
      phase: getSeasonGlobePhase(event, nextRound),
    })),
  };
}

export function getSeasonGlobePhase(
  event: PhaseSource,
  nextRound: number | null,
): SeasonGlobePhase {
  if (event.completed) {
    return "completed";
  }

  return event.round === nextRound ? "next" : "upcoming";
}

export function formatSeasonGlobeDateLabel(value: string | null) {
  const date = parseIsoDate(value);

  if (!date) {
    return "Дата уточняется";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: "Europe/Moscow",
  }).format(date);
}

export function formatSeasonGlobeDateTimeLabel(value: string | null) {
  const date = parseIsoDate(value);

  if (!date) {
    return null;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(date);
}

export function formatSeasonGlobeCountdownLabel(
  value: string | null,
  nowMs: number | null,
) {
  const start = parseIsoDate(value);

  if (!start || nowMs === null || !Number.isFinite(nowMs)) {
    return null;
  }

  const diffMs = start.getTime() - nowMs;

  if (diffMs <= 0) {
    return "Уикенд начался";
  }

  const totalMinutes = Math.max(1, Math.ceil(diffMs / 60_000));
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `До старта ${days} дн. ${hours} ч`;
  }

  if (hours > 0) {
    return `До старта ${hours} ч ${minutes} мин`;
  }

  return `До старта ${minutes} мин`;
}

export function formatSeasonGlobeWeekendLabel(
  startValue: string | null,
  endValue: string | null,
) {
  const start = parseIsoDate(startValue);
  const end = parseIsoDate(endValue);

  if (!start || !end) {
    return formatSeasonGlobeDateLabel(endValue ?? startValue);
  }

  const startParts = getMoscowDateParts(start);
  const endParts = getMoscowDateParts(end);

  if (startParts.year === endParts.year && startParts.month === endParts.month) {
    if (startParts.day === endParts.day) {
      return `${endParts.day} ${endParts.monthName}`;
    }

    return `${startParts.day}-${endParts.day} ${endParts.monthName}`;
  }

  return `${startParts.day} ${startParts.monthName} - ${endParts.day} ${endParts.monthName}`;
}

function parseIsoDate(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isFinite(date.getTime()) ? date : null;
}

function getMoscowDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Moscow",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    day: Number(value.day),
    month: Number(
      new Intl.DateTimeFormat("en-US", {
        month: "numeric",
        timeZone: "Europe/Moscow",
      }).format(date),
    ),
    monthName: value.month,
    year: Number(value.year),
  };
}
