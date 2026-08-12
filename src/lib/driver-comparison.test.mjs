import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDriverRoundSnapshots,
  createDriverComparisonShareCode,
  compareDriverSnapshots,
  normalizeDriverComparisonSlug,
  rankDirectoryDrivers,
  parseDriverComparisonShareCode,
  resolveDriverComparisonRound,
  resolveDriverComparisonSelection,
} from "./driver-comparison.ts";
import { resolvePublicSiteOrigin } from "./seo.ts";

test("uses the canonical public origin behind a production proxy", () => {
  assert.equal(
    resolvePublicSiteOrigin("https://0.0.0.0:3000/c/26-3-RUS-ANT", "production"),
    "https://raceside.online",
  );
  assert.equal(
    resolvePublicSiteOrigin("http://localhost:3010/c/26-3-RUS-ANT", "development"),
    "http://localhost:3010",
  );
});

test("creates and parses compact comparison share codes", () => {
  const code = createDriverComparisonShareCode(2026, 8, "VER", "NOR");

  assert.equal(code, "s2-26-8-VER-NOR");
  assert.deepEqual(parseDriverComparisonShareCode(code), {
    leftKey: "VER",
    rightKey: "NOR",
    round: 8,
    season: 2026,
  });
  assert.deepEqual(parseDriverComparisonShareCode("26-8-VER-NOR"), {
    leftKey: "VER",
    rightKey: "NOR",
    round: 8,
    season: 2026,
  });
  assert.equal(parseDriverComparisonShareCode("26-0-VER-NOR"), null);
  assert.equal(createDriverComparisonShareCode(2026, 8, undefined, "NOR"), null);
});

test("builds cumulative snapshots from sprint and race results", () => {
  const snapshots = buildDriverRoundSnapshots(
    [
      {
        round: 1,
        raceName: "Australian Grand Prix",
        participated: true,
        qualifyingPosition: 1,
        sprintPosition: null,
        sprintPoints: 0,
        startPosition: 1,
        finishPosition: 2,
        fastestLapTime: "1:19.813",
        racePoints: 18,
        status: "Finished",
        isDnf: false,
        hasFastestLap: true,
      },
      {
        round: 2,
        raceName: "Chinese Grand Prix",
        participated: true,
        qualifyingPosition: 4,
        sprintPosition: 2,
        sprintPoints: 7,
        startPosition: 4,
        finishPosition: 1,
        fastestLapTime: "1:20.104",
        racePoints: 25,
        status: "Finished",
        isDnf: false,
        hasFastestLap: false,
      },
    ],
    [
      { round: 1, position: 2, points: 18, wins: 0 },
      { round: 2, position: 1, points: 50, wins: 1 },
    ],
    2,
  );

  assert.equal(snapshots.length, 2);
  assert.deepEqual(
    {
      points: snapshots[1].points,
      wins: snapshots[1].wins,
      podiums: snapshots[1].podiums,
      poles: snapshots[1].poles,
      fastestLaps: snapshots[1].fastestLaps,
      averageStart: snapshots[1].averageStart,
      averageFinish: snapshots[1].averageFinish,
      positionsGained: snapshots[1].positionsGained,
    },
    {
      points: 50,
      wins: 1,
      podiums: 2,
      poles: 1,
      fastestLaps: 1,
      averageStart: 2.5,
      averageFinish: 1.5,
      positionsGained: 2,
    },
  );
  assert.equal(snapshots[1].stage.sprintPoints, 7);
  assert.equal(snapshots[1].stage.points, 32);
  assert.equal(snapshots[0].stage.fastestLapTime, "1:19.813");
});

test("keeps missing-start averages empty and counts a later DNF", () => {
  const snapshots = buildDriverRoundSnapshots(
    [
      {
        round: 1,
        raceName: "Australian Grand Prix",
        participated: false,
        qualifyingPosition: null,
        sprintPosition: null,
        sprintPoints: 0,
        startPosition: null,
        finishPosition: null,
        fastestLapTime: null,
        racePoints: 0,
        status: null,
        isDnf: false,
        hasFastestLap: false,
      },
      {
        round: 2,
        raceName: "Chinese Grand Prix",
        participated: true,
        qualifyingPosition: 15,
        sprintPosition: null,
        sprintPoints: 0,
        startPosition: 15,
        finishPosition: null,
        fastestLapTime: null,
        racePoints: 0,
        status: "Сход",
        isDnf: true,
        hasFastestLap: false,
      },
    ],
    [],
    2,
  );

  assert.equal(snapshots[0].starts, 0);
  assert.equal(snapshots[0].averageStart, null);
  assert.equal(snapshots[0].averageFinish, null);
  assert.equal(snapshots[1].starts, 1);
  assert.equal(snapshots[1].dnfs, 1);
  assert.equal(snapshots[1].averageStart, 15);
  assert.equal(snapshots[1].averageFinish, null);
});

test("scores higher and lower metrics without awarding ties or null values", () => {
  const base = {
    round: 4,
    championshipPosition: 2,
    points: 80,
    wins: 2,
    podiums: 3,
    poles: 1,
    fastestLaps: 0,
    q3Appearances: 4,
    pointsFinishes: 4,
    dnfs: 0,
    averageStart: 3.5,
    averageFinish: 4,
    positionsGained: 2,
    starts: 4,
    stage: null,
  };
  const result = compareDriverSnapshots(
    base,
    {
      ...base,
      championshipPosition: 1,
      points: 90,
      wins: 2,
      fastestLaps: 1,
      dnfs: 1,
      averageStart: null,
      positionsGained: -1,
    },
  );

  assert.equal(result.result.championshipPosition, "right");
  assert.equal(result.result.points, "right");
  assert.equal(result.result.wins, "tie");
  assert.equal(result.result.dnfs, "left");
  assert.equal(result.result.averageStart, "tie");
  assert.equal(result.result.positionsGained, "left");
  assert.equal(result.leftScore, 2);
  assert.equal(result.rightScore, 3);
});

test("normalizes comparison URL state and clamps the selected round", () => {
  assert.equal(normalizeDriverComparisonSlug(" Max-Verstappen "), "max-verstappen");
  assert.equal(normalizeDriverComparisonSlug("bad/slug"), undefined);
  assert.equal(resolveDriverComparisonRound(undefined, 8), 8);
  assert.equal(resolveDriverComparisonRound("99", 8), 8);
  assert.equal(resolveDriverComparisonRound("0", 8), 1);
  assert.equal(resolveDriverComparisonRound("4", 8), 4);
  assert.equal(resolveDriverComparisonRound("4", 0), 0);

  assert.deepEqual(
    resolveDriverComparisonSelection(
      "max-verstappen",
      "max-verstappen",
      ["max-verstappen", "lando-norris"],
    ),
    { left: "max-verstappen", right: undefined },
  );
  assert.deepEqual(
    resolveDriverComparisonSelection(
      "unknown-driver",
      "lando-norris",
      ["max-verstappen", "lando-norris"],
    ),
    { left: undefined, right: "lando-norris" },
  );
});

test("keeps the two most active drivers primary and marks replacements compact", () => {
  const base = {
    id: "driver",
    slug: "driver",
    fullName: "Driver",
    number: 1,
    avatarUrl: null,
    championshipPosition: null,
    points: 0,
    wins: 0,
    isPrimary: false,
  };
  const ranked = rankDirectoryDrivers([
    { ...base, id: "reserve", slug: "reserve", fullName: "Reserve", starts: 2 },
    { ...base, id: "second", slug: "second", fullName: "Second", starts: 20, championshipPosition: 8 },
    { ...base, id: "first", slug: "first", fullName: "First", starts: 20, championshipPosition: 3 },
  ]);

  assert.deepEqual(ranked.map((driver) => driver.id), ["first", "second", "reserve"]);
  assert.deepEqual(ranked.map((driver) => driver.isPrimary), [true, true, false]);
});
