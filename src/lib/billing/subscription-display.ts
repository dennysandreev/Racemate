const DAY_MS = 24 * 60 * 60 * 1_000;

export function formatSubscriptionTimeLeft(
  periodEnd: string | null,
  now = Date.now(),
) {
  if (!periodEnd) return null;
  const end = Date.parse(periodEnd);
  if (!Number.isFinite(end) || end <= now) return null;
  const days = Math.max(1, Math.ceil((end - now) / DAY_MS));
  return `Ещё ${days} ${formatDayWord(days)}`;
}

function formatDayWord(days: number) {
  const lastTwoDigits = days % 100;
  const lastDigit = days % 10;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return "дней";
  if (lastDigit === 1) return "день";
  if (lastDigit >= 2 && lastDigit <= 4) return "дня";
  return "дней";
}
