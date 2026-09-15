export function selectTelemetryDemoCandidates<T extends { start: string }>(
  seasons: Array<{ meetings: T[]; year: number }>,
  nowMs = Date.now(),
) {
  const candidates: T[] = [];
  let currentSeasonFound = false;

  for (const season of [...seasons].sort((a, b) => b.year - a.year)) {
    const completed = season.meetings
      .filter((meeting) => Date.parse(meeting.start) < nowMs)
      .sort((a, b) => Date.parse(b.start) - Date.parse(a.start));

    if (!completed.length) continue;
    const candidate = currentSeasonFound ? completed[0] : completed[2];
    currentSeasonFound = true;
    if (candidate) candidates.push(candidate);
  }

  return candidates;
}
