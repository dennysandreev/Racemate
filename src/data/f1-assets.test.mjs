import assert from "node:assert/strict";
import test from "node:test";

import { getTeamAsset, getTeamAssetForMarketOutcome } from "./f1-assets.ts";

test("does not match a short team code inside a driver name", () => {
  assert.equal(getTeamAsset("Oscar Piastri"), null);
});

test("uses the driver's actual team color for a Polymarket outcome", () => {
  const asset = getTeamAssetForMarketOutcome("Oscar Piastri", [
    {
      driver: "Oscar Piastri",
      team: "McLaren",
      teamCode: "MCL",
    },
  ]);

  assert.equal(asset?.name, "McLaren");
  assert.equal(asset?.color, "#FF8000");
});

test("still matches a short team code when it is a separate token", () => {
  assert.equal(getTeamAsset("RB F1 Team")?.name, "Racing Bulls");
  assert.equal(getTeamAsset("RBX")?.logo, "/f1/teams/logos/2026/rb.webp");
});
