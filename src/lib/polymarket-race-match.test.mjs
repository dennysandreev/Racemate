import assert from "node:assert/strict";
import test from "node:test";

import { isPolymarketEventForRace } from "./polymarket-race-match.ts";

const dutchRace = {
  season: 2026,
  race: "Dutch Grand Prix",
  country: "Netherlands",
  locality: "Zandvoort",
  circuit: "Circuit Park Zandvoort",
  startsAtIso: "2026-08-23T13:00:00+00:00",
};

test("rejects an Italian winner market for the current Dutch Grand Prix", () => {
  assert.equal(
    isPolymarketEventForRace(
      {
        title: "F1 Italian Grand Prix: Driver Winner",
        slug: "f1-italian-grand-prix-winner-2026-09-06",
        markets: [{ question: "Will George Russell win the Italian Grand Prix?" }],
      },
      dutchRace,
    ),
    false,
  );
});

test("does not accept a generic F1 winner market without a race identity", () => {
  assert.equal(
    isPolymarketEventForRace(
      {
        title: "F1 Grand Prix: Driver Winner",
        markets: [{ question: "Will George Russell win the race?" }],
      },
      dutchRace,
    ),
    false,
  );
});

test("accepts a winner market explicitly matching the current race", () => {
  assert.equal(
    isPolymarketEventForRace(
      {
        title: "F1 Dutch Grand Prix: Driver Winner",
        slug: "f1-dutch-grand-prix-winner-2026-08-23",
        markets: [{ question: "Will George Russell win the Dutch Grand Prix?" }],
      },
      dutchRace,
    ),
    true,
  );
});

test("accepts the circuit identity but rejects a stale season", () => {
  assert.equal(
    isPolymarketEventForRace(
      { title: "Zandvoort Formula 1 race winner" },
      dutchRace,
    ),
    true,
  );
  assert.equal(
    isPolymarketEventForRace(
      { title: "Zandvoort Formula 1 race winner 2025" },
      dutchRace,
    ),
    false,
  );
});
