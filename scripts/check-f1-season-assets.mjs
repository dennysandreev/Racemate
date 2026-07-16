import { access, readFile } from "node:fs/promises";
import path from "node:path";

const MIN_SEASON = 2020;
const CURRENT_SEASON = 2026;
const root = process.cwd();
const seasonArg = process.argv.find((arg) => arg.startsWith("--season="));
const requestedSeason = seasonArg ? Number(seasonArg.split("=")[1]) : null;
const seasons = requestedSeason
  ? [requestedSeason]
  : Array.from({ length: CURRENT_SEASON - MIN_SEASON + 1 }, (_, index) => MIN_SEASON + index);

async function fileExists(relativePath) {
  try {
    await access(path.join(root, "public", relativePath.replace(/^\//, "")));
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "RaceMateSeasonAssetCheck/1.0" },
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function expectedDriverSlugs(season) {
  const payload = await fetchJson(
    `https://api.jolpi.ca/ergast/f1/${season}/driverstandings.json?limit=100`,
  );
  const lists = payload?.MRData?.StandingsTable?.StandingsLists ?? [];
  return (lists.at(-1)?.DriverStandings ?? []).map(({ Driver }) => {
    const fullName = `${Driver.givenName ?? ""} ${Driver.familyName ?? ""}`.trim();
    return fullName
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  });
}

const failures = [];

for (const season of seasons) {
  const mapManifestPath = path.join(root, "public", "f1", "circuits", String(season), "manifest.json");
  const teamManifestPath = path.join(root, "public", "f1", "teams", "manifests", `${season}.json`);
  let mapManifest;
  let teamManifest;

  try {
    mapManifest = await readJson(mapManifestPath);
  } catch {
    failures.push(`${season}: circuit manifest is missing or invalid`);
  }
  try {
    teamManifest = await readJson(teamManifestPath);
  } catch {
    failures.push(`${season}: team manifest is missing or invalid`);
  }

  if (mapManifest) {
    for (const source of mapManifest.sources ?? []) {
      if (!(await fileExists(source.file))) failures.push(`${season}: missing map ${source.file}`);
      if (!source.sourceUrl || !source.pageUrl || !source.sha256) failures.push(`${season}: incomplete map provenance for round ${source.round}`);
    }
  }

  if (teamManifest) {
    if (!teamManifest.complete) failures.push(`${season}: team manifest reports missing assets`);
    for (const source of teamManifest.sources ?? []) {
      if (!source.car?.file || !(await fileExists(source.car.file))) failures.push(`${season}: missing car for ${source.constructorId}`);
      if (!source.logo?.file || !(await fileExists(source.logo.file))) failures.push(`${season}: missing logo for ${source.constructorId}`);
    }
  }

  if (season === CURRENT_SEASON) {
    const driverSlugs = await expectedDriverSlugs(season);
    for (const slug of driverSlugs) {
      const avatarPath = `/drivers/avatars/${season}/${slug}.webp`;
      if (!(await fileExists(avatarPath))) failures.push(`${season}: missing avatar ${avatarPath}`);
    }

    console.log(`${season}: checked maps, teams, and ${driverSlugs.length} required driver avatars`);
  } else {
    console.log(`${season}: checked maps and teams; historical driver avatars are optional`);
  }
}

if (failures.length > 0) {
  console.error(`Season asset gate failed with ${failures.length} issue(s):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("Season asset gate passed.");
}
