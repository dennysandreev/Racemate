import assert from "node:assert/strict";
import test from "node:test";

import {
  findFormula1FastestPitStop,
  parseFormula1FastestPitStops,
} from "./formula1-fastest-pit-stops.mjs";

const html = `
  <table>
    <tr class="Table-module_body-row__shKd-">
      <td><a href="/en/results/2026/races/1279/australia/race-result">Australia</a></td>
      <td><span><img src="mercedes.webp" alt="" /></span>Mercedes</td>
      <td>2.17s</td>
    </tr>
    <tr class="Table-module_body-row__shKd-">
      <td><a href="/en/results/2026/races/1289/great-britain/race-result">Great Britain</a></td>
      <td><span><img src="mercedes.webp" alt="" /></span>Mercedes</td>
      <td>2.18s</td>
    </tr>
    <tr class="Table-module_body-row__shKd-">
      <td><a href="/en/results/2026/races/1287/barcelona-catalunya/race-result">Barcelona-Catalunya</a></td>
      <td><span><img src="mclaren.webp" alt="" /></span>McLaren</td>
      <td>2.13s</td>
    </tr>
  </table>
`;

test("parses official Formula 1 fastest pit-stop rows", () => {
  assert.deepEqual(parseFormula1FastestPitStops(html, 2026), [
    {
      duration: 2.17,
      formula1RaceId: 1279,
      raceSlug: "australia",
      season: 2026,
      sourceUrl: "https://www.formula1.com/en/results/2026/awards/fastest-pit-stops",
      team: "Mercedes",
    },
    {
      duration: 2.18,
      formula1RaceId: 1289,
      raceSlug: "great-britain",
      season: 2026,
      sourceUrl: "https://www.formula1.com/en/results/2026/awards/fastest-pit-stops",
      team: "Mercedes",
    },
    {
      duration: 2.13,
      formula1RaceId: 1287,
      raceSlug: "barcelona-catalunya",
      season: 2026,
      sourceUrl: "https://www.formula1.com/en/results/2026/awards/fastest-pit-stops",
      team: "McLaren",
    },
  ]);
});

test("matches Formula 1 race slugs to RaceSide Grand Prix names", () => {
  const entries = parseFormula1FastestPitStops(html, 2026);

  assert.equal(findFormula1FastestPitStop(entries, "British Grand Prix")?.duration, 2.18);
  assert.equal(findFormula1FastestPitStop(entries, "Barcelona Grand Prix")?.team, "McLaren");
  assert.equal(findFormula1FastestPitStop(entries, "Australian Grand Prix")?.duration, 2.17);
  assert.equal(findFormula1FastestPitStop(entries, "Hungarian Grand Prix"), null);
});
