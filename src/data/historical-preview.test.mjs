import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);

  assert.ok(start >= 0, `Missing source marker: ${startMarker}`);
  assert.ok(end > start, `Missing source marker: ${endMarker}`);

  return source.slice(start, end);
}

test("season discovery delegates public and admin visibility to RLS", () => {
  const repository = readFileSync("src/data/racemate-repository.ts", "utf8");
  const discovery = sourceBetween(
    repository,
    "const getPublishedSeasonsCached",
    "async function resolvePublishedSeason",
  );

  assert.match(discovery, /createSupabaseServerClient\(\)/);
  assert.match(discovery, /\.from\("seasons"\)[\s\S]*\.select\("year"\)/);
  assert.doesNotMatch(discovery, /createSupabaseAdminClient\(\)/);
  assert.doesNotMatch(discovery, /\.eq\("is_published",\s*true\)/);
});

test("admin RLS covers every table used by the historical preview", () => {
  const migration = readFileSync(
    "supabase/migrations/20260716071643_historical_seasons.sql",
    "utf8",
  );
  const policyNames = [
    "seasons",
    "team lineages",
    "team season profiles",
    "driver season profiles",
    "race track assets",
    "teams",
    "drivers",
    "circuits",
    "races",
    "sessions",
    "session results",
    "driver standings",
    "constructor standings",
  ];

  for (const name of policyNames) {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(
      migration,
      new RegExp(
        `Admins can manage ${escapedName}[\\s\\S]{0,160}for all to authenticated[\\s\\S]{0,120}using \\(public\\.is_admin\\(\\)\\)`,
      ),
    );
  }
});

test("public RLS still fails closed for unpublished sporting data", () => {
  const migration = readFileSync(
    "supabase/migrations/20260716071643_historical_seasons.sql",
    "utf8",
  );

  for (const policyName of [
    "Public can read published seasons",
    "Public can read races in published seasons",
    "Public can read sessions in published seasons",
    "Public can read results in published seasons",
    "Public can read driver standings in published seasons",
    "Public can read constructor standings in published seasons",
  ]) {
    const escapedName = policyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(
      migration,
      new RegExp(`${escapedName}[\\s\\S]{0,420}is_published = true`),
    );
  }
});
