import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const MIN_SEASON = 2020;
const CURRENT_SEASON = 2026;
const PROMPT_VERSION = "driver-avatar-seasonal-v1";
const HELMET_REFERENCE_POLICY =
  "Exact visual reference for the driver's regular primary helmet in this season; one-off designs are not accepted.";
const MIN_DIMENSION = 512;
const MAX_DIMENSION = 2048;
const MIN_FILE_BYTES = 8 * 1024;
const DEFAULT_MAX_FILE_BYTES = 2 * 1024 * 1024;
const PYTHON_BIN = process.env.PYTHON_BIN || "python3";
const root = process.cwd();

const args = new Set(process.argv.slice(2));
const seasonArg = process.argv.find((arg) => arg.startsWith("--season="));
const maxBytesArg = process.argv.find((arg) => arg.startsWith("--max-bytes="));
const requestedSeason = seasonArg ? Number(seasonArg.split("=")[1]) : null;
const maxFileBytes = maxBytesArg ? Number(maxBytesArg.split("=")[1]) : DEFAULT_MAX_FILE_BYTES;
const inventoryOnly = args.has("--inventory-only");

if (
  requestedSeason !== null &&
  (!Number.isInteger(requestedSeason) || requestedSeason < MIN_SEASON || requestedSeason > CURRENT_SEASON)
) {
  throw new Error(`Season must be between ${MIN_SEASON} and ${CURRENT_SEASON}.`);
}
if (!Number.isInteger(maxFileBytes) || maxFileBytes < MIN_FILE_BYTES) {
  throw new Error("--max-bytes must be an integer greater than the minimum file size.");
}

const seasons = requestedSeason
  ? [requestedSeason]
  : Array.from(
      { length: CURRENT_SEASON - MIN_SEASON + 1 },
      (_, index) => MIN_SEASON + index,
    );
const failures = [];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function isUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isHelmetVisualReference(value) {
  if (!isUrl(value)) return false;
  const hostname = new URL(value).hostname.toLowerCase();
  return !hostname.includes("wikipedia.org") && !hostname.includes("jolpi.ca");
}

function choosePrimaryTeam(teamStints) {
  return [...teamStints].sort((left, right) => {
    if (right.starts !== left.starts) return right.starts - left.starts;
    if ((right.lastStartRound ?? -1) !== (left.lastStartRound ?? -1)) {
      return (right.lastStartRound ?? -1) - (left.lastStartRound ?? -1);
    }
    if (right.appearances !== left.appearances) return right.appearances - left.appearances;
    if ((right.lastAppearanceRound ?? -1) !== (left.lastAppearanceRound ?? -1)) {
      return (right.lastAppearanceRound ?? -1) - (left.lastAppearanceRound ?? -1);
    }
    return left.externalId.localeCompare(right.externalId);
  })[0] ?? null;
}

async function readManifest(season) {
  const manifestPath = path.join(
    root,
    "public",
    "drivers",
    "avatars",
    String(season),
    "manifest.json",
  );
  try {
    return JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    failures.push(`${season}: avatar manifest is missing or invalid (${error.message})`);
    return null;
  }
}

function inspectFiles(files) {
  if (files.length === 0) return new Map();
  const inspector = path.join(root, "scripts", "inspect-f1-driver-avatar.py");
  const result = spawnSync(PYTHON_BIN, [inspector, ...files], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `Avatar inspector exited with ${result.status}.`);
  }
  const rows = JSON.parse(result.stdout);
  return new Map(rows.map((row) => [path.resolve(row.path), row]));
}

for (const season of seasons) {
  const manifest = await readManifest(season);
  if (!manifest) continue;

  if (manifest.schemaVersion !== 1) failures.push(`${season}: unsupported schemaVersion`);
  if (manifest.season !== season) failures.push(`${season}: manifest season does not match its directory`);
  if (manifest.promptVersion !== PROMPT_VERSION) failures.push(`${season}: unexpected prompt version`);
  if (manifest.helmetReferencePolicy !== HELMET_REFERENCE_POLICY) {
    failures.push(`${season}: helmet reference policy is missing or stale`);
  }
  if (!isUrl(manifest.source?.resultsUrl) || !isUrl(manifest.source?.standingsUrl)) {
    failures.push(`${season}: Jolpica source URLs are missing`);
  }

  const drivers = Array.isArray(manifest.drivers) ? manifest.drivers : [];
  const slugs = new Set();
  const externalIds = new Set();
  const filesToInspect = [];
  const fileMetadata = new Map();

  for (const driver of drivers) {
    const label = `${season}/${driver.slug || driver.externalId || "unknown"}`;
    if (!driver.externalId || externalIds.has(driver.externalId)) {
      failures.push(`${label}: missing or duplicate externalId`);
    }
    externalIds.add(driver.externalId);
    if (!driver.slug || slugs.has(driver.slug)) failures.push(`${label}: missing or duplicate slug`);
    slugs.add(driver.slug);
    if (!driver.fullName || driver.season !== season) failures.push(`${label}: identity metadata is incomplete`);
    if (!driver.team?.externalId || !driver.team?.name) failures.push(`${label}: primary team is incomplete`);
    if (!Number.isInteger(driver.starts) || driver.starts < 0) failures.push(`${label}: invalid starts count`);
    const teamStints = Array.isArray(driver.teamStints) ? driver.teamStints : [];
    const stintStarts = teamStints.reduce((total, team) => total + Number(team.starts ?? 0), 0);
    if (teamStints.length === 0 || stintStarts !== driver.starts) {
      failures.push(`${label}: team stint starts do not match the driver total`);
    }
    const expectedPrimaryTeam = choosePrimaryTeam(teamStints);
    if (expectedPrimaryTeam?.externalId !== driver.team?.externalId) {
      failures.push(`${label}: primary team does not follow the starts/latest-start rule`);
    }
    if (driver.promptVersion !== PROMPT_VERSION) failures.push(`${label}: unexpected prompt version`);
    if (!isUrl(driver.identityReferenceUrl)) {
      failures.push(`${label}: identityReferenceUrl is missing or invalid`);
    }
    if (driver.helmetReferenceUrl && !isHelmetVisualReference(driver.helmetReferenceUrl)) {
      failures.push(`${label}: helmetReferenceUrl is not a visual source`);
    }
    if (!driver.prompt?.includes(driver.fullName) || !driver.prompt?.includes(String(season)) || !driver.prompt?.includes(driver.team?.name)) {
      failures.push(`${label}: prompt does not contain the exact driver, season, and team`);
    }
    if (/\bcurrent(?:-season)?\b/i.test(driver.prompt ?? "")) {
      failures.push(`${label}: prompt contains a current-season placeholder`);
    }

    const expectedFile = `/drivers/avatars/${season}/${driver.slug}.webp`;
    if (driver.file !== expectedFile) failures.push(`${label}: expected file path ${expectedFile}`);
    if (!["missing", "generated", "legacy-current"].includes(driver.source?.kind)) {
      failures.push(`${label}: invalid source kind`);
    }
    if (!["pending", "approved", "rejected"].includes(driver.manualReview?.status)) {
      failures.push(`${label}: invalid manual review status`);
    }
    if (driver.manualReview?.status === "approved" && !driver.manualReview.reviewedAt) {
      failures.push(`${label}: approved review has no timestamp`);
    }
    if (
      season < CURRENT_SEASON &&
      driver.manualReview?.status === "approved" &&
      !isHelmetVisualReference(driver.helmetReferenceUrl)
    ) {
      failures.push(`${label}: approved historical avatar has no regular helmet visual reference`);
    }

    const absoluteFile = path.join(root, "public", expectedFile.replace(/^\//, ""));
    try {
      const [buffer, fileStats] = await Promise.all([readFile(absoluteFile), stat(absoluteFile)]);
      const actualHash = sha256(buffer);
      fileMetadata.set(driver.externalId, { buffer, fileStats, actualHash, absoluteFile });
      filesToInspect.push(absoluteFile);

      if (fileStats.size < MIN_FILE_BYTES || fileStats.size > maxFileBytes) {
        failures.push(`${label}: file size ${fileStats.size} is outside ${MIN_FILE_BYTES}-${maxFileBytes} bytes`);
      }
      if (driver.bytes !== fileStats.size) failures.push(`${label}: manifest byte size does not match`);
      if (!driver.sha256 || driver.sha256 !== actualHash) failures.push(`${label}: checksum does not match`);
      if (driver.source?.kind === "missing") failures.push(`${label}: present file is marked missing`);
      if (
        !inventoryOnly &&
        season === CURRENT_SEASON &&
        driver.manualReview?.status !== "approved"
      ) {
        failures.push(`${label}: manual review is ${driver.manualReview?.status ?? "missing"}`);
      }
    } catch (error) {
      if (error?.code !== "ENOENT") failures.push(`${label}: cannot read avatar (${error.message})`);
      if (driver.sha256 || driver.bytes) failures.push(`${label}: missing file has checksum or byte metadata`);
      if (driver.source?.kind !== "missing") failures.push(`${label}: missing file is not marked missing`);
      if (!inventoryOnly && season === CURRENT_SEASON) {
        failures.push(`${label}: avatar file is missing`);
      }
    }
  }

  let inspections = new Map();
  try {
    inspections = inspectFiles(filesToInspect);
  } catch (error) {
    failures.push(`${season}: could not inspect WebP files (${error.message})`);
  }

  for (const driver of drivers) {
    const metadata = fileMetadata.get(driver.externalId);
    if (!metadata) continue;
    const label = `${season}/${driver.slug}`;
    const inspection = inspections.get(path.resolve(metadata.absoluteFile));
    if (!inspection || inspection.error) {
      failures.push(`${label}: image cannot be decoded${inspection?.error ? ` (${inspection.error})` : ""}`);
      continue;
    }
    if (inspection.format !== "WEBP") failures.push(`${label}: file is not WebP`);
    if (inspection.mode !== "RGBA") failures.push(`${label}: decoded image is not RGBA`);
    if (inspection.width !== inspection.height) failures.push(`${label}: image is not square`);
    if (inspection.width < MIN_DIMENSION || inspection.width > MAX_DIMENSION) {
      failures.push(`${label}: side ${inspection.width}px is outside ${MIN_DIMENSION}-${MAX_DIMENSION}px`);
    }
    if (inspection.alphaMin !== 0 || inspection.alphaMax !== 255) {
      failures.push(`${label}: expected transparent background and opaque subject (alpha ${inspection.alphaMin}-${inspection.alphaMax})`);
    }
  }

  const calculatedReady = drivers.filter(
    (driver) =>
      fileMetadata.has(driver.externalId) &&
      driver.sha256 &&
      driver.bytes &&
      driver.manualReview?.status === "approved" &&
      (season === CURRENT_SEASON || isHelmetVisualReference(driver.helmetReferenceUrl)),
  ).length;
  const calculatedComplete = drivers.length > 0 && calculatedReady === drivers.length;
  if (manifest.complete !== calculatedComplete) failures.push(`${season}: manifest complete flag is stale`);
  if (manifest.stats?.drivers !== drivers.length) failures.push(`${season}: stats.drivers is stale`);
  if (manifest.stats?.ready !== calculatedReady) failures.push(`${season}: stats.ready is stale`);
  if (manifest.stats?.pending !== drivers.length - calculatedReady) failures.push(`${season}: stats.pending is stale`);

  const requirement = season === CURRENT_SEASON ? "required" : "optional";
  console.log(
    `${season}: ${drivers.length} drivers, ${fileMetadata.size} files, ${calculatedReady} approved (${requirement})`,
  );
}

if (failures.length > 0) {
  console.error(`Driver avatar gate failed with ${failures.length} issue(s):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(inventoryOnly ? "Driver avatar inventories are valid." : "Driver avatar launch gate passed.");
}
