const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

const COMPLETE_REPORT_DELAYS = [30 * MINUTE_MS, 3 * HOUR_MS, 24 * HOUR_MS];
const INCOMPLETE_REPORT_DELAYS = [
  30 * MINUTE_MS,
  3 * HOUR_MS,
  6 * HOUR_MS,
  12 * HOUR_MS,
  ...Array.from({ length: 14 }, () => 24 * HOUR_MS),
];

export function getNextReportRefreshAt(
  currentStage,
  { incomplete = false, now = Date.now() } = {},
) {
  const delays = incomplete ? INCOMPLETE_REPORT_DELAYS : COMPLETE_REPORT_DELAYS;
  const stage = currentStage + 1;

  if (stage >= delays.length) {
    return { stage, nextRefreshAt: null };
  }

  return {
    stage,
    nextRefreshAt: new Date(now + delays[stage]).toISOString(),
  };
}
