import test from "node:test";
import assert from "node:assert/strict";
import { LiveStore, initialState } from "../../src/features/live/lib/store.ts";
import { LiveState } from "./state.mjs";

test("both maps cannot sample a retired car from buffered coordinates", () => {
  const store = new LiveStore();
  const now = Date.now();
  store.state = { ...initialState, drivers: { 44: { status: "RUNNING" } } };
  store.addLocation(44, {
    timestamp: new Date(now).toISOString(),
    x: 1,
    y: 2,
    z: 0,
    progress: 0.5,
  });
  assert.ok(store.sample(44, now));
  for (const status of ["DNF", "DNS", "RETIRED", "DSQ"]) {
    store.state.drivers[44].status = status;
    assert.equal(store.sample(44, now), null);
  }
  store.state.drivers[44].status = "PIT";
  assert.ok(store.sample(44, now));
});

test("a car disappears fifteen seconds after entering the pits and returns on exit", () => {
  const store = new LiveStore();
  const start = Date.now();
  store.state = {
    ...initialState,
    drivers: {
      44: {
        status: "PIT",
        pitEnteredAt: new Date(start).toISOString(),
      },
    },
  };
  store.addLocation(44, {
    timestamp: new Date(start).toISOString(),
    x: 1,
    y: 2,
    z: 0,
    progress: 0.5,
    pitLaneProgress: 0.4,
  });
  assert.ok(store.sample(44, start + 14999));
  assert.equal(store.sample(44, start + 15000), null);
  store.state.drivers[44].status = "OUT LAP";
  store.state.drivers[44].pitEnteredAt = null;
  assert.ok(store.sample(44, start + 15000));
});

test("three minutes stationary hides the marker and movement or resumed coordinates restore it", () => {
  const live = new LiveState();
  const start = Date.now();
  live.setSession({
    session_key: 1,
    session_name: "Race",
    date_start: new Date(start).toISOString(),
  });
  const store = new LiveStore();
  const location = (seconds, x) => {
    live.apply("location", {
      session_key: 1,
      driver_number: 44,
      date: new Date(start + seconds * 1000).toISOString(),
      svgX: x,
      svgY: 10,
    });
    store.state = live.state;
    store.addLocation(44, live.state.locations[44]);
  };
  location(0, 100);
  location(179, 100.5);
  assert.ok(store.sample(44, start + 179000));
  location(181, 100.7);
  assert.equal(store.sample(44, start + 181000), null);
  assert.equal(live.state.drivers[44].status, "NO DATA");
  location(182, 104);
  assert.ok(store.sample(44, start + 182000));
  assert.equal(live.state.drivers[44].status, "RUNNING");
  assert.equal(store.sample(44, start + 363000), null);
  location(364, 104);
  assert.ok(store.sample(44, start + 364000));
});

test("stationary timeout survives restoring a persisted snapshot", () => {
  const start = Date.now();
  const live = new LiveState();
  live.setSession({
    session_key: 1,
    session_name: "Practice 3",
    date_start: new Date(start).toISOString(),
  });
  live.state.drivers[44] = {
    ...live.state.drivers[44],
    driverNumber: 44,
    status: "RUNNING",
  };
  live.state.locations[44] = {
    x: 100,
    y: 10,
    z: 0,
    progress: 0.5,
    timestamp: new Date(start + 179000).toISOString(),
    stationarySince: new Date(start).toISOString(),
  };
  const restored = new LiveState(structuredClone(live.state));
  restored.apply("location", {
    session_key: 1,
    driver_number: 44,
    date: new Date(start + 181000).toISOString(),
    svgX: 100.5,
    svgY: 10,
  });
  assert.equal(restored.state.drivers[44].status, "NO DATA");
});

test("pit coordinates keep the driver in the garage until pit exit", () => {
  const live = new LiveState();
  const start = Date.now();
  live.setSession({
    session_key: 1,
    session_name: "Practice 3",
    date_start: new Date(start).toISOString(),
  });
  live.state.track = {
    worldBounds: { minX: 0, minY: 0 },
    transform: { scale: 1, offsetX: 0, offsetY: 0, invertY: true },
    centerline: [
      { svgX: 0, svgY: 0, progress: 0 },
      { svgX: 100, svgY: 0, progress: 0.5 },
    ],
    pitLane: {
      points: [
        { svgX: 0, svgY: 50, progress: 0 },
        { svgX: 100, svgY: 50, progress: 1 },
      ],
    },
    svg: { viewBox: { height: 100 } },
  };
  live.apply("location", {
    session_key: 1,
    driver_number: 44,
    date: new Date(start).toISOString(),
    x: 50,
    y: 50,
  });
  assert.equal(live.state.drivers[44].status, "PIT");
  live.apply("location", {
    session_key: 1,
    driver_number: 44,
    date: new Date(start + 1000).toISOString(),
    x: 50,
    y: 100,
  });
  assert.equal(live.state.drivers[44].status, "OUT LAP");
});

test("a driver with no track activity stays in the garage until movement", () => {
  const live = new LiveState();
  const start = Date.now();
  live.setSession({
    session_key: 1,
    session_name: "Practice 3",
    date_start: new Date(start).toISOString(),
  });
  live.apply("drivers", {
    session_key: 1,
    driver_number: 41,
    date: new Date(start).toISOString(),
    name_acronym: "LIN",
  });
  live.apply("car_data", {
    session_key: 1,
    driver_number: 41,
    date: new Date(start + 1000).toISOString(),
    speed: 0,
  });
  assert.equal(live.state.drivers[41].status, "PIT");
  live.apply("location", {
    session_key: 1,
    driver_number: 41,
    date: new Date(start + 2000).toISOString(),
    svgX: 100,
    svgY: 10,
  });
  assert.equal(live.state.drivers[41].status, "PIT");
  live.apply("car_data", {
    session_key: 1,
    driver_number: 41,
    date: new Date(start + 3000).toISOString(),
    speed: 80,
  });
  assert.equal(live.state.drivers[41].status, "OUT LAP");
});
