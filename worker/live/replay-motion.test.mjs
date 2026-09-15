import test from "node:test";
import assert from "node:assert/strict";
import { createReplayMotion } from "./replay-motion.mjs";
import { ReplaySimulationSource } from "./sources.mjs";

const centerline = Array.from({ length: 40 }, (_, i) => ({
  progress: i / 40,
  svgX: Math.cos((i / 40) * Math.PI * 2) * 100,
  svgY: Math.sin((i / 40) * Math.PI * 2) * 100,
}));
function replayFixture() {
  return {
    sourceSessionKey: 1,
    durationMs: 24000,
    track: { centerline, startFinish: { progress: 0 } },
    drivers: [],
    raceEvents: [],
    positions: [0, 8000, 16000, 24000].map((offsetMs, i) => ({
      driverNumber: 44,
      offsetMs,
      timestamp: new Date(offsetMs).toISOString(),
      progress: i / 4,
      svgX: Math.cos((i / 4) * Math.PI * 2) * 100,
      svgY: Math.sin((i / 4) * Math.PI * 2) * 100,
      z: 0,
    })),
  };
}
test("sparse eight-second replay points produce continuous track motion", () => {
  const sample = createReplayMotion(replayFixture());
  let previous = sample(1000)[0];
  for (let time = 1100; time <= 15000; time += 100) {
    const current = sample(time)[0];
    assert.ok(
      Math.hypot(current.svgX - previous.svgX, current.svgY - previous.svgY) >
        0.1,
      `stopped at ${time}`,
    );
    assert.ok(
      Math.abs(Math.hypot(current.svgX, current.svgY) - 100) < 1,
      "car must follow track instead of cutting corners",
    );
    previous = current;
  }
});
test("no invented movement after the recorded trajectory ends", () => {
  const sample = createReplayMotion(replayFixture());
  assert.deepEqual(sample(50000), sample(60000));
});
test("simulator emits dense positions through the same location protocol", async () => {
  const positions = [];
  const source = new ReplaySimulationSource({
    replay: replayFixture(),
    offset: 2000,
    onConnection: () => {},
    onMessage: (topic, row) => {
      if (topic === "location") positions.push(row);
    },
  });
  try {
    await source.start();
    await new Promise((resolve) => setTimeout(resolve, 460));
    assert.ok(positions.length >= 5);
    for (let i = 2; i < positions.length; i++) {
      assert.equal(positions[i].session_key, 1);
      assert.notEqual(positions[i].svgX, positions[i - 1].svgX);
      assert.ok(
        Date.parse(positions[i].date) > Date.parse(positions[i - 1].date),
      );
    }
  } finally {
    await source.stop();
  }
});
test("a stopped replay keeps its last confirmed timestamp without inventing DNF", async () => {
  const replay = replayFixture();
  replay.durationMs = 600000;
  const sample = createReplayMotion(replay);
  assert.equal(sample(400000)[0].retired, true);
  const received = [];
  const source = new ReplaySimulationSource({
    replay,
    offset: 400000,
    onConnection: () => {},
    onMessage: (topic, row) => received.push({ topic, row }),
  });
  try {
    await source.start();
    await new Promise((resolve) => setTimeout(resolve, 230));
    const locations = received.filter((m) => m.topic === "location").slice(-2);
    assert.equal(locations.length, 2);
    assert.equal(locations[0].row.date, locations[1].row.date);
    assert.ok(Date.now() - Date.parse(locations[0].row.date) > 180000);
    const exits = received.filter((m) => m.row.message === "CAR 44 RETIRED");
    assert.equal(exits.length, 0);
  } finally {
    await source.stop();
  }
});
