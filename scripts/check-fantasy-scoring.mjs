import assert from "node:assert/strict";

import { scoreFantasyPrediction } from "../worker/fantasy-scoring.mjs";

const actual = {
  fastestLapDriverId: "d4",
  fastestPitStopTeamId: "t2",
  firstDnfDriverIds: ["d18", "d19"],
  poleDriverId: "d2",
  topScoringTeamId: "t1",
  top10DriverIds: ["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8", "d9", "d10"],
};

const perfect = scoreFantasyPrediction(
  {
    dnf_driver_id: "d18",
    dnf_pick_kind: "driver",
    fastest_pit_stop_team_id: "t2",
    fastest_lap_driver_id: "d4",
    pole_driver_id: "d2",
    top_scoring_team_id: "t1",
    top10_driver_ids: actual.top10DriverIds,
  },
  actual,
);
assert.equal(perfect.top10Points, 50);
assert.equal(perfect.top10Bonus, 50);
assert.equal(perfect.specials.topScoringTeam, 10);
assert.equal(perfect.specials.fastestPitStopTeam, 10);
assert.equal(perfect.specialPoints, 50);
assert.equal(perfect.total, 150);

const shuffledTop10 = scoreFantasyPrediction(
  {
    dnf_driver_id: null,
    dnf_pick_kind: "driver",
    fastest_lap_driver_id: null,
    pole_driver_id: null,
    top10_driver_ids: ["d2", "d1", "d3", "d4", "d5", "d6", "d7", "d8", "d9", "d10"],
  },
  actual,
);
assert.equal(shuffledTop10.top10[0].points, 3);
assert.equal(shuffledTop10.top10[1].points, 3);
assert.equal(shuffledTop10.top10Bonus, 15);

const podiumOnly = scoreFantasyPrediction(
  {
    dnf_driver_id: null,
    dnf_pick_kind: "driver",
    fastest_lap_driver_id: null,
    pole_driver_id: null,
    top10_driver_ids: ["d3", "d1", "d2", "x4", "x5", "x6", "x7", "x8", "x9", "x10"],
  },
  actual,
);
assert.equal(podiumOnly.top10Bonus, 5);

const noDnf = scoreFantasyPrediction(
  {
    dnf_driver_id: null,
    dnf_pick_kind: "none",
    fastest_lap_driver_id: null,
    pole_driver_id: null,
    top10_driver_ids: [],
  },
  { ...actual, firstDnfDriverIds: [] },
);
assert.equal(noDnf.specials.firstDnf, 12);

const sameLapDnf = scoreFantasyPrediction(
  {
    dnf_driver_id: "d19",
    dnf_pick_kind: "driver",
    fastest_lap_driver_id: null,
    pole_driver_id: null,
    top10_driver_ids: [],
  },
  actual,
);
assert.equal(sameLapDnf.specials.firstDnf, 12);

console.log("Fantasy scoring smoke passed");
