import assert from "node:assert/strict";
import test from "node:test";

import {
  getFormula1TyreArticleIdentity,
  matchFormula1TyreAllocationRace,
  parseFormula1TyreAllocationArticle,
  parseSitemapLocations,
} from "./formula1-tyre-allocations.mjs";

const sourceUrl = "https://www.formula1.com/en/latest/article/what-tyres-will-the-teams-and-drivers-have-for-the-2026-spanish-grand-prix.abc123";

test("finds Formula 1 tyre article links in a sitemap", () => {
  assert.deepEqual(parseSitemapLocations(`
    <urlset>
      <url><loc>${sourceUrl.replaceAll("&", "&amp;")}</loc></url>
      <url><loc>https://www.formula1.com/en/latest/article/another-story.xyz</loc></url>
    </urlset>
  `), [sourceUrl, "https://www.formula1.com/en/latest/article/another-story.xyz"]);
});

test("parses the hard, medium and soft compounds from an official article", () => {
  const allocation = parseFormula1TyreAllocationArticle(`
    <main><p>Pirelli will provide the drivers and teams with their
    C2 (as the hard), C3 (as the medium) and C4 (as the soft) compounds.</p></main>
  `, sourceUrl);

  assert.deepEqual(allocation, {
    hard: "C2",
    medium: "C3",
    raceKey: "spanish",
    season: 2026,
    soft: "C4",
    sourceUrl,
  });
});

test("supports the wording variants used by Formula 1 articles", () => {
  const variants = [
    "C3 will be the hard tyre option, C4 the medium, and C5 the red-walled soft tyre.",
    "The allocation includes C2 for the hard, C3 for the medium and C4 for the soft.",
    "Pirelli selected C3 allocated as the hard, C4 as the medium and C5 as the soft tyre.",
  ];

  for (const html of variants) {
    const allocation = parseFormula1TyreAllocationArticle(html, sourceUrl);
    assert.ok(allocation);
    assert.deepEqual(
      [allocation.hard, allocation.medium, allocation.soft],
      html.includes("C2") ? ["C2", "C3", "C4"] : ["C3", "C4", "C5"],
    );
  }
});

test("supports respectively and range-based compound announcements", () => {
  const variants = [
    "The C2, C3 and C4 have been selected as the hard, medium and soft compounds respectively.",
    "Pirelli are giving the teams the C3, C4 and C5 compounds, the softest in their range.",
    "Pirelli are nominating the C2, C3 and C4 rubber, one stage harder than at the previous race.",
  ];

  for (const html of variants) {
    const allocation = parseFormula1TyreAllocationArticle(html, sourceUrl);
    assert.ok(allocation);
    assert.deepEqual(
      [allocation.hard, allocation.medium, allocation.soft],
      html.includes("C2") ? ["C2", "C3", "C4"] : ["C3", "C4", "C5"],
    );
  }
});

test("does not accept an incomplete or ambiguous allocation", () => {
  assert.equal(parseFormula1TyreAllocationArticle("C2, C3 and C4", sourceUrl), null);
  assert.equal(parseFormula1TyreAllocationArticle(
    "C3 (as the hard), C3 (as the medium) and C4 (as the soft)",
    sourceUrl,
  ), null);
});

test("matches the article to the race in the same season", () => {
  const allocation = {
    ...getFormula1TyreArticleIdentity(sourceUrl),
    hard: "C2",
    medium: "C3",
    soft: "C4",
    sourceUrl,
  };
  const race = matchFormula1TyreAllocationRace(allocation, [
    { id: "italy", race_name: "Italian Grand Prix", season_year: 2026 },
    { id: "spain", race_name: "Spanish Grand Prix", season_year: 2026 },
    { id: "old-spain", race_name: "Spanish Grand Prix", season_year: 2025 },
  ]);

  assert.equal(race?.id, "spain");
});
