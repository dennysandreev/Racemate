import test from "node:test";
import assert from "node:assert/strict";
import { RecordedOpenF1Source } from "./recorded-source.mjs";
import { LiveState } from "./state.mjs";

test("recorded practice preserves order and does not preload future laps", async () => {
  const messages = [];
  const source = new RecordedOpenF1Source({
    recording: {
      session: {
        session_key: 11363,
        session_type: "Practice",
        session_name: "Practice 2",
        date_start: "2026-09-11T15:00:00Z",
        date_end: "2026-09-11T16:00:00Z",
      },
      durationMs: 100000,
      messages: [
        { offset: 0, topic: "drivers", row: { driver_number: 44 } },
        { offset: 10000, topic: "laps", row: { lap_number: 2 } },
        { offset: 90000, topic: "laps", row: { lap_number: 3 } },
      ],
    },
    offset: 12000,
    onConnection() {},
    onMessage: (topic, row) => messages.push({ topic, row }),
  });
  try {
    await source.start();
    assert.equal(source.session.session_type, "Practice");
    assert.deepEqual(
      messages.map((m) => m.topic),
      ["drivers", "laps"],
    );
    assert.equal(messages[1].row.lap_number, 2);
    assert.ok(
      Math.abs(Date.now() - Date.parse(messages[1].row.date) - 2000) < 100,
    );
  } finally {
    await source.stop();
  }
});

test("practice deleted lap is matched by time despite differing Race Control lap numbers", () => {
  const live = new LiveState();
  live.setSession({
    session_key: 1,
    session_type: "Practice",
    date_start: "2026-09-11T12:00:00Z",
  });
  const apply = (topic, fields) =>
    live.apply(topic, {
      session_key: 1,
      driver_number: 10,
      date: "2026-09-11T12:01:00Z",
      ...fields,
    });
  apply("laps", { lap_number: 15, lap_duration: 96.244 });
  apply("laps", { lap_number: 21, lap_duration: 95.757 });
  apply("race_control", {
    driver_number: null,
    date: "2026-09-11T12:02:00Z",
    message:
      "CAR 10 (GAS) TIME 1:35.757 DELETED - TRACK LIMITS AT TURN 5 LAP 22 14:29:51",
  });
  assert.equal(live.state.drivers[10].bestLap, 96.244);
  assert.equal(live.state.drivers[10].lapHistory.at(-1).deleted, true);
  apply("laps", {
    lap_number: 21,
    lap_duration: 95.757,
    date: "2026-09-11T12:01:30Z",
  });
  assert.equal(live.state.drivers[10].bestLap, 96.244);
  apply("race_control", {
    driver_number: null,
    date: "2026-09-11T12:03:00Z",
    message: "CAR 10 (GAS) TIME 1:35.757 REINSTATED",
  });
  assert.equal(live.state.drivers[10].bestLap, 95.757);
});
