import "../worker/load-env.mjs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { OpenF1LiveSource } from "../worker/live/sources.mjs";
import { buildReplayTrackDefinition } from "../worker/index.mjs";
import { LiveState } from "../worker/live/state.mjs";
import { hydrationMessages } from "../worker/live/normalize.mjs";

const source = new OpenF1LiveSource({ onMessage() {}, onConnection() {} });
const sessions = await source.rest("sessions", {
  year: 2026,
  circuit_key: 153,
});
const circuit = {
  id: "madring",
  external_id: "madring",
  name: "Madring",
  country: "Spain",
};
const report = [];
for (const session of sessions.filter((s) =>
  [11362, 11363].includes(s.session_key),
)) {
  const streams = new Map();
  const start = Date.parse(session.date_start);
  const from = start + 5 * 60000,
    until = start + 20 * 60000;
  for (const topic of [
    "drivers",
    "laps",
    "race_control",
    "session_result",
    "stints",
    "pit",
    "weather",
    "position",
    "location",
    "car_data",
  ]) {
    const path = `/private/tmp/madring-${session.session_key}-${topic}-test.json`;
    let rows;
    try {
      rows = JSON.parse(await readFile(path, "utf8"));
    } catch {
      rows = [];
      const dense = ["location", "car_data"].includes(topic);
      for (let at = dense ? from : 0; at < (dense ? until : 1); at += 120000) {
        const query = { session_key: session.session_key };
        if (dense) {
          query["date>"] = new Date(at - 1).toISOString();
          query["date<"] = new Date(Math.min(until, at + 120000))
            .toISOString()
            .replace(".000Z", "");
        }
        let batch;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            batch = await source.rest(topic, query);
            break;
          } catch (error) {
            if (attempt === 2) throw error;
          }
        }
        rows.push(...batch);
      }
      await writeFile(path, JSON.stringify(rows));
    }
    streams.set(topic, rows);
    console.info(
      JSON.stringify({
        session: session.session_key,
        topic,
        rows: rows.length,
      }),
    );
  }
  const locationByDriver = new Map();
  for (const p of streams.get("location")) {
    if (!locationByDriver.has(p.driver_number))
      locationByDriver.set(p.driver_number, []);
    locationByDriver.get(p.driver_number).push(p);
  }
  const derivedTrack = buildReplayTrackDefinition({
    circuit,
    lapsPayload: streams.get("laps"),
    locationByDriver,
    sourceSeason: 2026,
    sourceSession: session,
    sourceSessionKey: session.session_key,
  });
  if (!derivedTrack)
    throw new Error(`No usable circuit geometry for ${session.session_key}`);
  const track = JSON.parse(
    await readFile("worker/live/tracks/madring-2026.json", "utf8"),
  );
  const live = new LiveState();
  live.setSession(session, track);
  const messages = hydrationMessages(
    new Map([...streams].filter(([t]) => t !== "session_result")),
    session,
  );
  for (const [topic, row] of messages) live.apply(topic, row);
  const expected = streams.get("session_result");
  const timingDifferences = expected.flatMap((r) => {
    const actual = live.state.drivers[r.driver_number]?.bestLap;
    return r.duration && Math.abs(actual - r.duration) > 0.001
      ? [{ driver: r.driver_number, actual, expected: r.duration }]
      : [];
  });
  const recording = {
    session,
    track,
    fromOffsetMs: from - start,
    durationMs: until - start,
    messages: messages
      .filter(([, row]) => Date.parse(row.date) <= until)
      .map(([topic, row]) => ({
        topic,
        row,
        offset: Math.max(0, Date.parse(row.date) - start),
      })),
  };
  await writeFile(
    `/private/tmp/madring-${session.session_key}-recording.json`,
    JSON.stringify(recording),
  );
  await writeFile(
    `/private/tmp/madring-${session.session_key}-track.json`,
    JSON.stringify(track, null, 2),
  );
  report.push({
    session: session.session_key,
    type: session.session_name,
    drivers: Object.keys(live.state.drivers).length,
    locations: streams.get("location").length,
    telemetry: streams.get("car_data").length,
    laps: streams.get("laps").length,
    events: streams.get("race_control").length,
    mapPoints: track.centerline.length,
    mapDriver: track.debug.sourceDriverNumbers,
    mapLap: track.debug.sourceLapNumber,
    timingDifferences,
  });
}
await mkdir("output/live", { recursive: true });
await writeFile(
  "output/live/madring-practice-report.json",
  JSON.stringify({ sessions, checks: report }, null, 2),
);
console.info(JSON.stringify(report, null, 2));
