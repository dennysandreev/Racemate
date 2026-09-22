import assert from "node:assert/strict";
import test from "node:test";
import { loadNewsContext, selectNewsContext } from "./news-context.mjs";

function database(rows, failure) {
  const calls = [];
  return { calls, from(table) {
    const filters = [];
    const query = {
      select() { return query; },
      eq(key, value) { filters.push([key, value]); return query; },
      in(key, value) { filters.push([key, value]); return query; },
      order() { return query; }, limit() { return query; },
      then(resolve) { calls.push({ table, filters }); return Promise.resolve({ data: rows[table] ?? [], error: failure === table ? new Error("unavailable") : null }).then(resolve); },
    };
    return query;
  } };
}

const now = new Date("2026-09-22T10:00:00Z");
const rows = {
  drivers: [{ id: "ham", full_name: "Lewis Hamilton", last_name: "Hamilton", updated_at: now.toISOString(), teams: { name: "Scuderia Ferrari", short_name: "Ferrari" } }],
  races: [{ id: "race", race_name: "Italian Grand Prix", round: 14, status: "completed", race_start_at: "2026-09-01T12:00:00Z" }],
  driver_standings: [{ id: "s1", driver_id: "ham", round: 14, points: 123, position: 4, wins: 1 }, { id: "s0", driver_id: "ham", round: 13, points: 99, position: 5, wins: 0 }],
  sessions: [{ id: "session", race_id: "race", session_type: "race" }],
  session_results: [{ id: "result", session_id: "session", driver_id: "ham", position: 3 }],
};

test("context uses current database teams, latest standings round and explicit result scope", async () => {
  const client = database(rows);
  const context = await loadNewsContext(client, { season: 2026, now });
  assert.equal(context.facts.find(fact => fact.kind === "driver_team").value, "Ferrari");
  assert.deepEqual(context.facts.filter(fact => fact.kind === "championship_points").map(fact => [fact.value, fact.scope]), [[123, "season_2026_after_round_14"]]);
  assert.equal(context.facts.find(fact => fact.kind === "session_position").scope, "2026:Italian Grand Prix:race");
  for (const table of ["races", "driver_standings", "constructor_standings"]) {
    assert.ok(client.calls.find(call => call.table === table).filters.some(([key, value]) => key === "season_year" && value === 2026));
  }
  assert.ok(!selectNewsContext(context, { title: "New regulations" }, []).facts.some(fact => fact.kind === "session_position"));
  assert.ok(selectNewsContext(context, { title: "Hamilton speaks" }, []).facts.some(fact => fact.kind === "session_position"));
});

test("missing context or an outdated season fails closed", async () => {
  await assert.rejects(loadNewsContext(database(rows), { season: 2025, now }), /season_mismatch/);
  await assert.rejects(loadNewsContext(database({}), { season: 2026, now }), /context_unavailable/);
  await assert.rejects(loadNewsContext(database(rows, "drivers"), { season: 2026, now }), /unavailable/);
});
