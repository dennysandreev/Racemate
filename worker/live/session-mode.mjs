export function sessionMode(session) {
  const name =
    `${session?.session_type ?? ""} ${session?.session_name ?? ""}`.toLowerCase();
  if (/sprint/.test(name) && /qualif|shootout/.test(name))
    return "sprint_qualifying";
  if (/qualif/.test(name)) return "qualifying";
  if (/sprint/.test(name)) return "sprint";
  if (/practice|\bfp[123]\b/.test(name)) return "practice";
  if (/\brace\b/.test(name)) return "race";
  return "unknown";
}
export function sessionCapabilities(session) {
  const mode = sessionMode(session),
    race = mode === "race" || mode === "sprint",
    qualifying = mode === "qualifying" || mode === "sprint_qualifying";
  return {
    mode,
    showRaceGap: race,
    showIntervals: race,
    showLapCounter: race,
    showCountdown: mode === "practice" || qualifying,
    showQualifyingPhase: qualifying,
    showEliminationZone:
      qualifying && Number.isInteger(session?.advancing_drivers),
    showPitCount: true,
    rankByLapTime: mode === "practice" || qualifying,
  };
}
export function chooseSession(rows, now = Date.now()) {
  const sorted = rows
    .filter((r) => !r.is_cancelled && Number.isFinite(Date.parse(r.date_start)))
    .sort((a, b) => Date.parse(a.date_start) - Date.parse(b.date_start));
  const active = sorted
    .filter(
      (r) =>
        Date.parse(r.date_start) <= now &&
        Date.parse(r.date_end) + 120000 > now,
    )
    .at(-1);
  const next = sorted.find((r) => Date.parse(r.date_start) > now);
  const previous = sorted.filter((r) => Date.parse(r.date_end) <= now).at(-1);
  return {
    session: active ?? next ?? previous ?? null,
    active: Boolean(active),
    previous: previous ?? null,
  };
}
export function sessionStillOngoing(session, controls, now = Date.now()) {
  if (
    !session ||
    now - Date.parse(session.date_end) > 30 * 60000 ||
    now < Date.parse(session.date_start)
  )
    return false;
  const latest = [...controls]
    .filter((row) =>
      /SESSION (?:STARTED|RESUMED|WILL BE TEMPORARILY STOPPED|SUSPENDED|ABORTED)|GREEN LIGHT|SESSION FINISHED/i.test(
        row.message ?? "",
      ),
    )
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
    .at(-1);
  return Boolean(
    latest && !/SESSION (?:FINISHED|ABORTED)/i.test(latest.message ?? ""),
  );
}
export function sessionLabel(session) {
  const mode = sessionMode(session),
    name = session?.session_name ?? "";
  if (mode === "practice") {
    const n = name.match(/[123]/)?.[0];
    return n ? `Практика ${n}` : "Практика";
  }
  return (
    {
      qualifying: "Квалификация",
      sprint_qualifying: "Квалификация спринта",
      sprint: "Спринт",
      race: "Гонка",
    }[mode] ?? name
  );
}
