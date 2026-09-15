import { eventKey } from "./state.mjs";
export function normalizeMessage(topic, row, session, now = Date.now()) {
  const originalDate = row.date ?? row.date_start;
  let timestamp = originalDate;
  if (topic === "laps" && !row.date && row.date_start && row.lap_duration > 0)
    timestamp = new Date(
      Date.parse(row.date_start) + row.lap_duration * 1000,
    ).toISOString();
  if (topic === "team_radio" && Number.isFinite(Date.parse(timestamp)))
    timestamp = new Date(timestamp).toISOString();
  const normalized = {
    ...row,
    date: timestamp ?? new Date(now).toISOString(),
    session_key: row.session_key ?? session?.session_key,
  };
  return {
    ...normalized,
    _eventKey:
      row._eventKey ?? eventKey(topic, topic === "team_radio" ? normalized : row),
  };
}
export function hydrationMessages(streams, session) {
  const lapStarts = new Map(
    (streams.get("laps") ?? []).map((r) => [
      `${r.driver_number}:${r.lap_number}`,
      r.date_start,
    ]),
  );
  return [...streams]
    .flatMap(([topic, rows]) =>
      rows.map((row) => {
        const timestamp =
          topic === "stints"
            ? lapStarts.get(`${row.driver_number}:${row.lap_start}`)
            : null;
        const normalized = normalizeMessage(
          topic,
          row,
          session,
          Date.parse(timestamp ?? session.date_start),
        );
        return [topic, normalized];
      }),
    )
    .sort((a, b) => Date.parse(a[1].date) - Date.parse(b[1].date));
}
