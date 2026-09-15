import test from "node:test";
import assert from "node:assert/strict";
import { TelemetryService } from "./service.mjs";

const start = Date.parse("2026-09-13T12:00:00Z");
const track = {
  id: "test",
  version: "1",
  name: "Test track",
  length: 6000,
  points: [],
  sectors: [2000, 4000],
  corners: [],
  estimated: false,
  source: "Test",
};
function raceLap(number, duration = 60, overrides = {}) {
  const lapStart = start + (number - 1) * 70000;
  return {
    id: `1:1:${number}`,
    sessionId: 1,
    driverNumber: 1,
    number,
    time: duration,
    start: new Date(lapStart).toISOString(),
    sectors: [duration / 3, duration / 3, duration / 3],
    compound: "MEDIUM",
    tyreAge: number,
    stint: 1,
    pitIn: false,
    pitOut: false,
    deleted: false,
    complete: true,
    status: ["GREEN"],
    validityKnown: true,
    weather: null,
    ...overrides,
  };
}
function samplesFor(lap) {
  const lapStart = Date.parse(lap.start);
  return Array.from({ length: Math.round(lap.time * 4) + 17 }, (_, index) => ({
    date: new Date(lapStart + (index - 8) * 250).toISOString(),
    speed: (track.length / lap.time) * 3.6,
    throttle: 100,
    brake: 0,
    n_gear: 8,
    rpm: 11000,
    drs: 8,
  }));
}
function memoryStore() {
  const values = new Map();
  return {
    get: async (key) => values.get(key) ?? null,
    put: async (key, value) => values.set(key, value),
  };
}

test("service loads one race range and returns one average trace", async () => {
  const laps = [raceLap(1, 60), raceLap(2, 61), raceLap(3, 62)],
    samples = laps.flatMap(samplesFor);
  let telemetryCalls = 0;
  const service = new TelemetryService({
    store: memoryStore(),
    provider: {
      source: { license: "test" },
      getTelemetry: async () => {
        telemetryCalls += 1;
        return samples;
      },
    },
  });
  const catalog = {
    session: {
      id: 1,
      meetingId: 1,
      season: 2026,
      name: "Race",
      type: "Race",
      circuit: "Test",
      circuitKey: 1,
      start: new Date(start).toISOString(),
      end: new Date(start + 300000).toISOString(),
    },
    drivers: [{ id: "1:1", number: 1, code: "ONE", name: "Driver One" }],
    laps,
  };
  const average = await service.raceAverage(catalog, 1, track);
  assert.equal(telemetryCalls, 1);
  assert.equal(average.lap.kind, "race_average");
  assert.equal(average.lap.sampleCount, 3);
  assert.equal(average.lap.time, 61);
  const cached = await service.raceAverage(catalog, 1, track);
  assert.equal(cached.lap.time, 61);
  assert.equal(telemetryCalls, 1);
});

test("service rejects a race average outside a race session", async () => {
  const service = new TelemetryService({
    store: memoryStore(),
    provider: { source: { license: "test" } },
  });
  await assert.rejects(
    () =>
      service.raceAverage(
        { session: { id: 1, name: "Qualifying", type: "Qualifying" } },
        1,
        track,
      ),
    /RACE_AVERAGE_ONLY/,
  );
});
