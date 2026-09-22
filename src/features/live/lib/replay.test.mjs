import assert from "node:assert/strict";
import test from "node:test";
import { LiveReplayAdapter } from "./replay.ts";
import { ReplayClock } from "./replay-clock.ts";
import { LiveStore } from "./store.ts";

const base = Date.parse("2026-07-19T13:00:00Z");
const point = (progress) => ({
  progress,
  svgX: 500 + 300 * Math.cos(progress * Math.PI * 2),
  svgY: 500 + 300 * Math.sin(progress * Math.PI * 2),
});
function position(offsetMs, progress) {
  return { ...point(progress), offsetMs, timestamp: new Date(base + offsetMs).toISOString(),
    driverNumber: 1, headingRad: 0, z: 0, normalizedZ: 0, lapNumber: 1 };
}
function replay(positions) {
  return {
    replaySessionId: "test", sourceSessionKey: 1, sourceSeason: 2026,
    raceName: "Test", circuitName: "Test", durationMs: 100_000, totalLaps: 1,
    track: { centerline: Array.from({length: 100}, (_, i) => point(i / 100)),
      startFinish: point(0), svg: { viewBox: {width: 1000, height: 1000} } },
    drivers: [{driverNumber: 1, abbreviation: "VER", fullName: "Max Verstappen",
      teamName: "Red Bull", teamColor: "0000ff", position: 1, status: "RUNNING",
      compound: "MEDIUM", tyreAge: 0, gapToLeader: null, intervalToAhead: null}],
    lapTimings: [{driverNumber: 1, lapNumber: 1, startOffsetMs: 0, durationMs: 100_000}],
    positions, raceEvents: [], weather: null,
  };
}

test("replay follows the circuit between sparse samples rather than cutting across corners", () => {
  const adapter = new LiveReplayAdapter(replay([position(0, 0), position(25_000, 0.25), position(100_000, 0)]));
  const location = adapter.frame(12_500, true).data.locations[1];
  assert.ok(Math.abs(Math.hypot(location.x - 500, location.y - 500) - 300) < 2);
});

test("a frozen position feed cannot make a car stop and then fly around the circuit", () => {
  const adapter = new LiveReplayAdapter(replay([
    position(0, 0), position(40_000, 0.1), position(48_000, 0.7), position(100_000, 0),
  ]));
  const first = adapter.frame(40_000, true).data.locations[1];
  const second = adapter.frame(48_000, true).data.locations[1];
  const distance = (second.progress - first.progress + 1) % 1;
  assert.ok(distance < 0.1, `travelled ${distance} laps in eight seconds`);
  assert.ok(Math.abs(first.progress - 0.4) < 0.01);
});

test("rewinding restores earlier events and removes future radio and completed laps", () => {
  const data = replay([position(0, 0), position(100_000, 0)]);
  data.raceEvents = [{offsetMs: 50_000, timestamp: new Date(base + 50_000).toISOString(), type: "race_control", message: "YELLOW", severity: "INFO"}];
  data.radio = [{id: "radio", driverNumber: 1, offsetMs: 50_000, timestamp: new Date(base + 50_000).toISOString(), status: "ready", ru: "Бокс", original: "Box", lap: 1}];
  const adapter = new LiveReplayAdapter(data);
  assert.equal(adapter.frame(100_000, false).data.drivers[1].lapHistory.length, 1);
  const earlier = adapter.frame(20_000, false).data;
  assert.equal(earlier.events.length, 0);
  assert.equal(earlier.radio.length, 0);
  assert.equal(earlier.drivers[1].lapHistory.length, 0);
});

test("clock advances smoothly between UI ticks, changes speed without jumping and stays paused", () => {
  let now = 0;
  const clock = new ReplayClock(100_000, 0, () => now);
  const adapter = new LiveReplayAdapter(replay([position(0, 0), position(100_000, 0)]));
  const store = new LiveStore();
  store.setReplaySampler((n) => adapter.sampleLocation(n, clock.read()));
  clock.setPlaying(true);
  now = 50;
  assert.equal(clock.read(), 50);
  clock.setSpeed(10);
  assert.equal(clock.read(), 50);
  now = 100;
  assert.equal(clock.read(), 550);
  clock.setPlaying(false);
  const paused = store.sample(1);
  now = 200_000;
  assert.deepEqual(store.sample(1), paused);
  clock.seek(200);
  assert.equal(clock.read(), 200);
  clock.setPlaying(true);
  now += 20_000;
  assert.equal(clock.read(), 100_000);
});

test("long timed laps and pit transitions stay continuous", () => {
  const data = replay([position(0, 0), {...position(250_000, 0.9), isPitLane: true}, position(280_000, 0.1), position(400_000, 0)]);
  data.durationMs = 400_000;
  data.lapTimings[0].durationMs = 400_000;
  data.track.pitLane = {points: [point(0.9), {svgX: 850, svgY: 500}, point(0.1)]};
  const adapter = new LiveReplayAdapter(data);
  for (const boundary of [250_000, 280_000, 400_000]) {
    const before = adapter.sampleLocation(1, boundary - 1);
    const after = adapter.sampleLocation(1, boundary + 1);
    assert.ok(Math.hypot(after.x - before.x, after.y - before.y) < 1, `jump at ${boundary}`);
  }
});

test("a malformed closing progress value cannot teleport the car at start/finish", () => {
  const data = replay([position(0, 0), position(100_000, 0)]);
  data.track.centerline = Array.from({length: 20}, (_, i) => ({...point(i / 20), progress: i / 19}));
  const adapter = new LiveReplayAdapter(data);
  const before = adapter.sampleLocation(1, 99_999);
  const after = adapter.sampleLocation(1, 100_000);
  assert.ok(Math.hypot(after.x - before.x, after.y - before.y) < 1);
});

test("legacy full pit-lane duration is not mistaken for a stationary tyre change", () => {
  const data = replay([position(0, 0), {...position(40_000, .9), isPitLane: true, pitStopDuration: 23.5, pitLaneDuration: 23.5}, position(72_000, .1), position(100_000, 0)]);
  data.track.pitLane = {points: [point(.9), {svgX: 850, svgY: 500}, point(.1)]};
  const adapter = new LiveReplayAdapter(data);
  const before = adapter.sampleLocation(1, 40_000);
  const after = adapter.sampleLocation(1, 40_250);
  assert.ok(after.pitLaneProgress - before.pitLaneProgress < .01);
});
