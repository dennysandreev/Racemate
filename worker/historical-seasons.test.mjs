import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  hasApprovedCircuitAssetManifest,
  hasApprovedDriverAssetManifest,
  hasApprovedTeamAssetManifest,
  getSeasonTeamColor,
  hasExactRoundCounts,
  getHistoricalSeasonYears,
  getJolpicaThrottleDelayMs,
  hasRoutableDriverProfiles,
  makeTeamCode,
  requiresDriverAvatarAssets,
  requireHistoricalSeason,
  resolveTeamLineageSlug,
  resolveDriverProfileSlug,
  selectPrimaryTeamsByStarts,
  shouldRetryJolpicaNetworkError,
  shouldRetryJolpicaResponse,
  verifyLocalAssetFile,
} from "./index.mjs";

const checksum = "a".repeat(64);

test("historical backfill accepts only explicit 2020-2025 seasons", () => {
  assert.equal(requireHistoricalSeason("2020"), 2020);
  assert.equal(requireHistoricalSeason(2025), 2025);
  assert.throws(() => requireHistoricalSeason(undefined), /explicit --season/);
  assert.throws(() => requireHistoricalSeason(2019), /between 2020 and 2025/);
  assert.throws(() => requireHistoricalSeason(2026), /between 2020 and 2025/);
});

test("Jolpica retries transient server failures without retrying permanent client errors", () => {
  assert.equal(shouldRetryJolpicaResponse(500, {}, 1), true);
  assert.equal(shouldRetryJolpicaResponse(503, {}, 3), true);
  assert.equal(shouldRetryJolpicaResponse(503, {}, 4), false);
  assert.equal(shouldRetryJolpicaResponse(429, {}, 1), true);
  assert.equal(shouldRetryJolpicaResponse(429, {}, 4), true);
  assert.equal(shouldRetryJolpicaResponse(429, {}, 7), false);
  assert.equal(shouldRetryJolpicaResponse(404, {}, 1), false);
});

test("Jolpica retries transient network failures with a bounded attempt count", () => {
  assert.equal(shouldRetryJolpicaNetworkError(1), true);
  assert.equal(shouldRetryJolpicaNetworkError(4), true);
  assert.equal(shouldRetryJolpicaNetworkError(5), false);
});

test("Jolpica requests stay below the documented burst limit", () => {
  assert.equal(getJolpicaThrottleDelayMs(1_000, 1_100, 300), 200);
  assert.equal(getJolpicaThrottleDelayMs(1_000, 1_400, 300), 0);
  assert.equal(getJolpicaThrottleDelayMs(1_000, 1_100, 0), 200);
});

test("history preview prepares every bounded season without a publication update", () => {
  const workerSource = readFileSync("worker/index.mjs", "utf8");
  const prepareStart = workerSource.indexOf("async function prepareHistoricalSeasons()");
  const prepareEnd = workerSource.indexOf("\nasync function publishHistoricalSeasons()", prepareStart);
  const prepareSource = workerSource.slice(prepareStart, prepareEnd);

  assert.match(
    workerSource,
    /\["jolpica\.prepare_history", prepareHistoricalSeasons\]/,
  );
  assert.match(
    readFileSync("package.json", "utf8"),
    /"worker:history:prepare": "node worker\/index\.mjs jolpica\.prepare_history"/,
  );
  assert.ok(prepareStart >= 0 && prepareEnd > prepareStart);
  assert.match(prepareSource, /backfillHistoricalSeasonByYear\(season, \{ validateAfter: false \}\)/);
  assert.match(prepareSource, /strict: false,[\s\S]*validateAfter: false/);
  assert.match(prepareSource, /validateSeasonReadiness\(season\)/);
  assert.doesNotMatch(prepareSource, /\.from\("seasons"\)|is_published|published_at/);
});

test("history preview can safely resume with one explicit season", () => {
  assert.deepEqual(getHistoricalSeasonYears(), [2020, 2021, 2022, 2023, 2024, 2025]);
  assert.deepEqual(getHistoricalSeasonYears("2024"), [2024]);
  assert.throws(() => getHistoricalSeasonYears("2026"), /between 2020 and 2025/);
});

test("constructor codes are deterministic and do not collide across historical rebrands", () => {
  const ids = ["alfa", "alpine", "alphatauri", "racing_point", "renault", "sauber", "audi"];
  const codes = ids.map(makeTeamCode);

  assert.equal(new Set(codes).size, ids.length);
  assert.equal(makeTeamCode("alpine"), "ALP");
  assert.equal(makeTeamCode("alphatauri"), "ATR");
  assert.equal(makeTeamCode("unknown_constructor"), "F1_UNKNOWNCONSTRUCTOR");
});

test("constructor rebrands resolve to stable team lineages", () => {
  assert.equal(resolveTeamLineageSlug("renault"), "alpine");
  assert.equal(resolveTeamLineageSlug("racing_point"), "aston-martin");
  assert.equal(resolveTeamLineageSlug("alphatauri"), "racing-bulls");
  assert.equal(resolveTeamLineageSlug("sauber"), "audi");
  assert.throws(() => resolveTeamLineageSlug("unknown_constructor"), /No team lineage configured/);
});

test("primary team uses starts first and latest round as the tie-breaker", () => {
  const assignments = selectPrimaryTeamsByStarts([
    { driverId: "driver-a", teamId: "team-old", round: 1, started: true },
    { driverId: "driver-a", teamId: "team-old", round: 2, started: true },
    { driverId: "driver-a", teamId: "team-new", round: 3, started: true },
    { driverId: "driver-a", teamId: "team-new", round: 4, started: true },
    { driverId: "driver-b", teamId: "team-old", round: 1, started: true },
    { driverId: "driver-b", teamId: "team-new", round: 8, started: false },
  ]);

  assert.deepEqual(assignments, [
    { driverId: "driver-a", primaryTeamId: "team-new", starts: 4 },
    { driverId: "driver-b", primaryTeamId: "team-old", starts: 1 },
  ]);
});

test("a late DNS cannot change the latest-start tie-breaker", () => {
  const assignments = selectPrimaryTeamsByStarts([
    { driverId: "driver-a", teamId: "team-old", round: 1, started: true },
    { driverId: "driver-a", teamId: "team-new", round: 2, started: true },
    { driverId: "driver-a", teamId: "team-old", round: 3, started: true },
    { driverId: "driver-a", teamId: "team-new", round: 4, started: true },
    { driverId: "driver-a", teamId: "team-old", round: 10, started: false },
  ]);

  assert.deepEqual(assignments, [
    { driverId: "driver-a", primaryTeamId: "team-new", starts: 4 },
  ]);
});

test("historical constructor identities use season-specific official palettes", () => {
  assert.equal(getSeasonTeamColor(2020, "renault"), "#FFF500");
  assert.equal(getSeasonTeamColor(2020, "racing_point"), "#F596C8");
  assert.equal(getSeasonTeamColor(2020, "alphatauri"), "#2B4562");
  assert.equal(getSeasonTeamColor(2020, "alfa"), "#C92D4B");
  assert.equal(getSeasonTeamColor(2020, "renault", "#123abc"), "#123ABC");
  assert.throws(
    () => getSeasonTeamColor(2020, "unknown", null, "#FFFFFF"),
    /No historical season color/,
  );
});

test("season readiness requires exact per-round result and standings counts", () => {
  const expected = new Map([[1, 20], [2, 19]]);

  assert.equal(hasExactRoundCounts(expected, new Map([[1, 20], [2, 19]])), true);
  assert.equal(hasExactRoundCounts(expected, new Map([[1, 20]])), false);
  assert.equal(hasExactRoundCounts(expected, new Map([[1, 20], [2, 18]])), false);
  assert.equal(hasExactRoundCounts(expected, new Map([[1, 20], [2, 19], [3, 20]])), false);
});

test("published driver profiles require a unique non-empty route slug", () => {
  const expected = new Set(["driver-a", "driver-b"]);

  assert.equal(
    hasRoutableDriverProfiles(expected, [
      { id: "driver-a", slug: "driver-a" },
      { id: "driver-b", slug: "driver-b" },
    ]),
    true,
  );
  assert.equal(
    hasRoutableDriverProfiles(expected, [{ id: "driver-a", slug: "driver-a" }]),
    false,
  );
  assert.equal(
    hasRoutableDriverProfiles(expected, [
      { id: "driver-a", slug: null },
      { id: "driver-b", slug: "driver-b" },
    ]),
    false,
  );
  assert.equal(
    hasRoutableDriverProfiles(expected, [
      { id: "driver-a", slug: "   " },
      { id: "driver-b", slug: "driver-b" },
    ]),
    false,
  );
  assert.equal(
    hasRoutableDriverProfiles(expected, [
      { id: "driver-a", slug: "same-driver" },
      { id: "driver-b", slug: "same-driver" },
    ]),
    false,
  );
});

test("driver imports repair only missing route slugs", () => {
  assert.equal(resolveDriverProfileSlug(null, "Romain Grosjean"), "romain-grosjean");
  assert.equal(resolveDriverProfileSlug("   ", "Mick Schumacher"), "mick-schumacher");
  assert.equal(resolveDriverProfileSlug(null, "Jean-Éric Vergne"), "jean-eric-vergne");
  assert.equal(
    resolveDriverProfileSlug("kevin-magnussen-20", "Kevin Magnussen"),
    "kevin-magnussen-20",
  );
});

test("team assets require visual approval, checksums, and explicit rights clearance", () => {
  const source = {
    kind: "team-season-assets",
    rightsReviewRequired: true,
    rightsReviewStatus: "pending",
    car: { manualReviewStatus: "approved", sha256: checksum },
    logo: { manualReviewStatus: "approved", sha256: checksum },
  };

  assert.equal(hasApprovedTeamAssetManifest([source]), false);
  assert.equal(hasApprovedTeamAssetManifest([{ ...source, rightsReviewStatus: "approved" }]), true);
});

test("historical publication does not require avatars while the current season keeps them", () => {
  assert.equal(requiresDriverAvatarAssets(2020), false);
  assert.equal(requiresDriverAvatarAssets(2025), false);
  assert.equal(requiresDriverAvatarAssets(2026), true);
});

test("an approved historical avatar still requires an exact helmet reference", () => {
  const source = {
    kind: "driver-season-avatar",
    season: 2024,
    sha256: checksum,
    manualReview: { status: "pending" },
  };

  assert.equal(hasApprovedDriverAssetManifest([source]), false);
  assert.equal(
    hasApprovedDriverAssetManifest([{ ...source, manualReview: { status: "approved" } }]),
    false,
  );
  assert.equal(
    hasApprovedDriverAssetManifest([{
      ...source,
      helmetReferenceUrl: "https://www.formula1.com/en/drivers/example/helmet-2024",
      manualReview: { status: "approved" },
    }]),
    true,
  );
  assert.equal(
    hasApprovedDriverAssetManifest([{
      ...source,
      helmetReferenceUrl: "https://en.wikipedia.org/wiki/Example_Driver",
      manualReview: { status: "approved" },
    }]),
    false,
  );
});

test("circuit maps require an official FIA source and explicit manual approval", () => {
  const source = {
    authority: "FIA",
    sha256: checksum,
    manualReview: { status: "pending" },
  };

  assert.equal(hasApprovedCircuitAssetManifest(source), false);
  assert.equal(
    hasApprovedCircuitAssetManifest({ ...source, manualReview: { status: "approved" } }),
    true,
  );
  assert.equal(
    hasApprovedCircuitAssetManifest({
      ...source,
      authority: "Formula1.com",
      manualReview: { status: "approved" },
    }),
    false,
  );
});

test("local season assets are accepted only when the manifest checksum matches the file", () => {
  const manifest = JSON.parse(readFileSync("public/f1/circuits/2020/manifest.json", "utf8"));
  const asset = manifest.sources[0];
  const integrityIssues = [];

  assert.equal(
    verifyLocalAssetFile({
      asset,
      expectedPrefix: "/f1/circuits/2020/",
      integrityIssues,
      label: "2020 round 1",
      requireFile: true,
    }),
    true,
  );
  assert.deepEqual(integrityIssues, []);
  assert.equal(
    verifyLocalAssetFile({
      asset: { ...asset, sha256: checksum },
      expectedPrefix: "/f1/circuits/2020/",
      integrityIssues,
      label: "tampered map",
      requireFile: true,
    }),
    false,
  );
  assert.match(integrityIssues.at(-1), /sha256 does not match/);
});

test("historical RLS exposes only published season data with verified track assets", () => {
  const migration = readFileSync(
    "supabase/migrations/20260716071643_historical_seasons.sql",
    "utf8",
  );
  const optionalAvatarMigration = readFileSync(
    "supabase/migrations/20260716071724_allow_published_drivers_without_avatars.sql",
    "utf8",
  );

  assert.match(migration, /Public can read published seasons[\s\S]*is_published = true/);
  assert.match(
    optionalAvatarMigration,
    /Public can read published driver profiles[\s\S]*season\.is_published = true/,
  );
  assert.doesNotMatch(optionalAvatarMigration, /avatar_review_status\s*=|avatar_reference_url\s+is not null|assets_verified_at\s+is not null/);
  assert.match(
    migration,
    /Public can read published race track assets[\s\S]*race_track_assets\.is_verified = true/,
  );
  assert.match(migration, /Admins can manage session results[\s\S]*for all to authenticated/);
  assert.match(migration, /grant insert, update, delete on table public\.session_results to authenticated/);
});

test("historical tables explicitly combine Data API grants with RLS", () => {
  const migration = readFileSync(
    "supabase/migrations/20260716071643_historical_seasons.sql",
    "utf8",
  );

  for (const table of [
    "team_lineages",
    "team_season_profiles",
    "driver_season_profiles",
    "race_track_assets",
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(
      migration,
      new RegExp(`grant select on table public\\.${table} to anon, authenticated`),
    );
  }
});

test("Race Replay RLS is scoped through a ready current-season target race", () => {
  const migration = readFileSync(
    "supabase/migrations/20260716071714_restrict_race_replay_to_current_season.sql",
    "utf8",
  );

  assert.match(
    migration,
    /Public can read current-season track maps[\s\S]*session\.track_map_id = track_maps\.id[\s\S]*session\.status = 'ready'[\s\S]*race\.season_year = 2026/,
  );
  assert.match(
    migration,
    /Public can read current-season replay sessions[\s\S]*race\.season_year = 2026/,
  );
  assert.match(migration, /Admins can manage replay sessions[\s\S]*for all to authenticated/);
});
