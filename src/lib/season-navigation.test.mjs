import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSeasonHref,
  CURRENT_F1_SEASON,
  resolvePublishedSeason,
} from "./season-navigation.ts";

test("the latest published season is selected when the query is absent", () => {
  assert.equal(resolvePublishedSeason(undefined, [2026, 2025, 2024]), 2026);
  assert.equal(CURRENT_F1_SEASON, 2026);
});

test("invalid and unpublished season queries fail closed", () => {
  assert.equal(resolvePublishedSeason("2024", [2026, 2024]), 2024);
  assert.equal(resolvePublishedSeason("2025", [2026, 2024]), null);
  assert.equal(resolvePublishedSeason("24", [2026, 2024]), null);
  assert.equal(resolvePublishedSeason("", [2026, 2024]), null);
  assert.equal(resolvePublishedSeason(["2024", "2026"], [2026, 2024]), 2024);
});

test("season navigation preserves unrelated query parameters and replaces the year", () => {
  const href = buildSeasonHref("/leaderboard", 2023, {
    season: "2026",
    table: "constructors",
    filter: ["wet", "sprint"],
  });
  const url = new URL(href, "https://racemate.ru");

  assert.equal(url.pathname, "/leaderboard");
  assert.equal(url.searchParams.get("season"), "2023");
  assert.equal(url.searchParams.get("table"), "constructors");
  assert.deepEqual(url.searchParams.getAll("filter"), ["wet", "sprint"]);
});
