import assert from "node:assert/strict";
import test from "node:test";

import {
  classifySeasonGlobeEvents,
  formatSeasonGlobeCountdownLabel,
  formatSeasonGlobeDateLabel,
  formatSeasonGlobeDateTimeLabel,
  formatSeasonGlobeWeekendLabel,
} from "./season-globe-data.ts";

test("season events are sorted and classified around the first unfinished round", () => {
  const result = classifySeasonGlobeEvents([
    { round: 4, completed: false, name: "four" },
    { round: 1, completed: true, name: "one" },
    { round: 3, completed: false, name: "three" },
    { round: 2, completed: true, name: "two" },
  ]);

  assert.equal(result.nextRound, 3);
  assert.deepEqual(
    result.events.map((event) => [event.round, event.phase]),
    [
      [1, "completed"],
      [2, "completed"],
      [3, "next"],
      [4, "upcoming"],
    ],
  );
});

test("season without unfinished rounds has no next event", () => {
  const result = classifySeasonGlobeEvents([
    { round: 2, completed: true },
    { round: 1, completed: true },
  ]);

  assert.equal(result.nextRound, null);
  assert.ok(result.events.every((event) => event.phase === "completed"));
});

test("Russian weekend label compacts dates in one month", () => {
  assert.equal(
    formatSeasonGlobeWeekendLabel(
      "2026-08-07T09:00:00Z",
      "2026-08-09T13:00:00Z",
    ),
    "7-9 августа",
  );
  assert.equal(formatSeasonGlobeDateLabel("2026-08-09T13:00:00Z"), "9 августа");
  assert.equal(
    formatSeasonGlobeDateTimeLabel("2026-08-09T15:42:00Z"),
    "вс, 9 авг., 18:42",
  );
});

test("future weekend countdown matches the current-stage status format", () => {
  const now = new Date("2026-08-26T12:00:00Z").getTime();

  assert.equal(
    formatSeasonGlobeCountdownLabel("2026-08-29T15:00:00Z", now),
    "До старта 3 дн. 3 ч",
  );
  assert.equal(
    formatSeasonGlobeCountdownLabel("2026-08-26T14:25:00Z", now),
    "До старта 2 ч 25 мин",
  );
  assert.equal(formatSeasonGlobeCountdownLabel(null, now), null);
});

test("invalid date values stay serializable and user-friendly", () => {
  assert.equal(formatSeasonGlobeWeekendLabel(null, null), "Дата уточняется");
  assert.equal(formatSeasonGlobeDateLabel("not-a-date"), "Дата уточняется");
  assert.equal(formatSeasonGlobeDateTimeLabel(null), null);
});
