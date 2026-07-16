import { createHash } from "node:crypto";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const MIN_SEASON = 2020;
const CURRENT_SEASON = 2026;
const SCHEMA_VERSION = 1;
const PROMPT_VERSION = "driver-avatar-seasonal-v1";
const HELMET_REFERENCE_POLICY =
  "Exact visual reference for the driver's regular primary helmet in this season; one-off designs are not accepted.";
const JOLPICA_BASE_URL = "https://api.jolpi.ca/ergast/f1";
const PAGE_SIZE = 100;
const PYTHON_BIN = process.env.PYTHON_BIN || "python3";
const root = process.cwd();

const args = new Set(process.argv.slice(2));
const seasonArg = process.argv.find((arg) => arg.startsWith("--season="));
const requestedSeason = seasonArg ? Number(seasonArg.split("=")[1]) : null;
const skipConversion = args.has("--skip-convert");

if (
  requestedSeason !== null &&
  (!Number.isInteger(requestedSeason) || requestedSeason < MIN_SEASON || requestedSeason > CURRENT_SEASON)
) {
  throw new Error(`Season must be between ${MIN_SEASON} and ${CURRENT_SEASON}.`);
}

const seasons = requestedSeason
  ? [requestedSeason]
  : Array.from(
      { length: CURRENT_SEASON - MIN_SEASON + 1 },
      (_, index) => MIN_SEASON + index,
    );

const nonStartStatuses = new Set([
  "did not qualify",
  "did not prequalify",
  "did not start",
  "withdrew",
  "withdrawn",
]);

function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function isApproved(review) {
  return review?.status === "approved";
}

function isRaceStart(result) {
  return !nonStartStatuses.has(String(result.status ?? "").trim().toLowerCase());
}

function buildPrompt({ fullName, season, teamName }) {
  return [
    `Create a clean front-facing portrait avatar of ${fullName}, Formula 1 driver for ${teamName} in the ${season} Formula 1 season, wearing the driver's regular primary ${season} Formula 1 racing helmet used with ${teamName}.`,
    `The helmet must match the real regular-season ${season} design and ${teamName} identity as closely as possible: correct team colors, driver-specific helmet pattern, number placement, sponsor-style markings, and an authentic modern Formula 1 appearance. Do not use a one-off, tribute, special-event, or testing helmet design. Exact readable sponsor logos are not required.`,
    "The visor must be open so that the driver's eyes are clearly visible through the visor opening. Only the eyes and a small part of the upper face may be visible, with a realistic racing balaclava inside the helmet. Do not show the full face and do not close the visor.",
    "Composition: centered, front-facing, passport-style portrait, symmetrical angle, helmet and upper shoulders visible, no car, no track, no background elements.",
    "Style: clean, high-detail, professional motorsport portrait, suitable for a website driver profile. Isolate the subject as a clean cutout on a fully transparent background with no shadow box, backdrop, scene, or extra objects.",
    "Output: 1:1 square transparent PNG or WebP raster asset with a clean vector-style finish. Vector-style describes the visual treatment; do not output SVG.",
  ].join(" ");
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readOptionalJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function fetchJson(url, attempt = 1) {
  const response = await fetch(url, {
    headers: { "user-agent": "RaceMateDriverAvatarSync/1.0" },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    if ((response.status === 429 || response.status >= 500) && attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 750));
      return fetchJson(url, attempt + 1);
    }
    throw new Error(`${url} returned ${response.status}`);
  }

  return response.json();
}

async function fetchSeasonResults(season) {
  const resultsUrl = `${JOLPICA_BASE_URL}/${season}/results.json`;
  const records = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (offset < total) {
    const payload = await fetchJson(`${resultsUrl}?limit=${PAGE_SIZE}&offset=${offset}`);
    const data = payload?.MRData;
    const races = data?.RaceTable?.Races ?? [];
    total = Number(data?.total ?? 0);

    for (const race of races) {
      for (const result of race.Results ?? []) {
        records.push({
          round: Number(race.round),
          raceName: race.raceName ?? null,
          result,
        });
      }
    }

    offset += Number(data?.limit ?? PAGE_SIZE);
    if (races.length === 0) break;
  }

  return { resultsUrl, records };
}

async function fetchSeasonStandings(season) {
  const standingsUrl = `${JOLPICA_BASE_URL}/${season}/driverstandings.json?limit=100`;
  const payload = await fetchJson(standingsUrl);
  const lists = payload?.MRData?.StandingsTable?.StandingsLists ?? [];
  return {
    standingsUrl,
    standings: lists.at(-1)?.DriverStandings ?? [],
  };
}

function getOrCreateDriver(drivers, driver) {
  const externalId = String(driver.driverId ?? "").trim();
  if (!externalId) throw new Error("Jolpica returned a driver without driverId.");

  if (!drivers.has(externalId)) {
    const fullName = `${driver.givenName ?? ""} ${driver.familyName ?? ""}`.trim();
    if (!fullName) throw new Error(`Jolpica returned ${externalId} without a name.`);
    drivers.set(externalId, {
      externalId,
      fullName,
      givenName: driver.givenName ?? null,
      familyName: driver.familyName ?? null,
      code: driver.code ?? null,
      permanentNumber: driver.permanentNumber ?? null,
      nationality: driver.nationality ?? null,
      driverReferenceUrl: driver.url ?? null,
      raceResults: new Map(),
      standingTeams: [],
    });
  }

  return drivers.get(externalId);
}

function addConstructor(teamMap, constructor, round, started) {
  const externalId = String(constructor?.constructorId ?? "").trim();
  if (!externalId) return;

  if (!teamMap.has(externalId)) {
    teamMap.set(externalId, {
      externalId,
      name: constructor.name ?? externalId,
      nationality: constructor.nationality ?? null,
      referenceUrl: constructor.url ?? null,
      appearances: 0,
      starts: 0,
      firstAppearanceRound: null,
      lastAppearanceRound: null,
      lastStartRound: null,
    });
  }

  const team = teamMap.get(externalId);
  team.appearances += 1;
  team.firstAppearanceRound =
    team.firstAppearanceRound === null ? round : Math.min(team.firstAppearanceRound, round);
  team.lastAppearanceRound = Math.max(team.lastAppearanceRound ?? round, round);
  if (started) {
    team.starts += 1;
    team.lastStartRound = Math.max(team.lastStartRound ?? round, round);
  }
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

function inventoryDrivers(results, standings) {
  const drivers = new Map();

  for (const record of results) {
    const driver = getOrCreateDriver(drivers, record.result.Driver ?? {});
    const resultKey = `${record.round}:${driver.externalId}`;
    if (driver.raceResults.has(resultKey)) continue;
    driver.raceResults.set(resultKey, record);
  }

  for (const row of standings) {
    const driver = getOrCreateDriver(drivers, row.Driver ?? {});
    driver.standingTeams = row.Constructors ?? [];
  }

  return [...drivers.values()].map((driver) => {
    const teams = new Map();
    const raceResults = [...driver.raceResults.values()].sort((left, right) => left.round - right.round);

    for (const record of raceResults) {
      addConstructor(
        teams,
        record.result.Constructor,
        record.round,
        isRaceStart(record.result),
      );
    }

    if (teams.size === 0) {
      for (const constructor of driver.standingTeams) {
        addConstructor(teams, constructor, 0, false);
      }
    }

    const teamStints = [...teams.values()].sort(
      (left, right) =>
        (left.firstAppearanceRound ?? 0) - (right.firstAppearanceRound ?? 0) ||
        left.externalId.localeCompare(right.externalId),
    );
    const primaryTeam = choosePrimaryTeam(teamStints);
    if (!primaryTeam) {
      throw new Error(`Could not determine a team for ${driver.fullName}.`);
    }

    const starts = raceResults.filter(({ result }) => isRaceStart(result)).length;
    const lastStart = raceResults
      .filter(({ result }) => isRaceStart(result))
      .at(-1);

    return {
      ...driver,
      slug: slugify(driver.fullName),
      starts,
      appearances: raceResults.length,
      lastStartRound: lastStart?.round ?? null,
      teamStints,
      primaryTeam,
    };
  });
}

async function runConverter(sourcePath, outputPath) {
  const converterPath = path.join(root, "scripts", "convert-f1-driver-avatar.py");
  await new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, [converterPath, sourcePath, outputPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `Avatar converter exited with ${code}.`));
    });
  });
}

function validReview(review) {
  if (!["pending", "approved", "rejected"].includes(review?.status)) return null;
  return {
    status: review.status,
    reviewedAt: review.reviewedAt ?? null,
    note: review.note ?? null,
  };
}

async function syncSeason(season) {
  const [{ resultsUrl, records }, { standingsUrl, standings }] = await Promise.all([
    fetchSeasonResults(season),
    fetchSeasonStandings(season),
  ]);
  const inventory = inventoryDrivers(records, standings);
  const outputDir = path.join(root, "public", "drivers", "avatars", String(season));
  const manifestPath = path.join(outputDir, "manifest.json");
  const previousManifest = await readOptionalJson(manifestPath);
  const previousDrivers = new Map(
    (previousManifest?.drivers ?? []).map((driver) => [driver.externalId, driver]),
  );
  const slugOwners = new Map();
  const generatedAt = new Date().toISOString();
  const entries = [];

  await mkdir(outputDir, { recursive: true });

  for (const driver of inventory.sort((left, right) => left.fullName.localeCompare(right.fullName))) {
    const owner = slugOwners.get(driver.slug);
    if (owner && owner !== driver.externalId) {
      throw new Error(`Driver slug collision in ${season}: ${driver.slug} (${owner}, ${driver.externalId}).`);
    }
    slugOwners.set(driver.slug, driver.externalId);

    const previous = previousDrivers.get(driver.externalId) ?? null;
    const relativeFile = `/drivers/avatars/${season}/${driver.slug}.webp`;
    const outputPath = path.join(root, "public", relativeFile.replace(/^\//, ""));
    const seasonalPng = path.join(outputDir, `${driver.slug}.png`);
    const legacyPng = path.join(root, "public", "drivers", "avatars", `${driver.slug}.png`);
    const candidateSource = (await exists(seasonalPng))
      ? { kind: "generated", filePath: seasonalPng, relativePath: `/drivers/avatars/${season}/${driver.slug}.png` }
      : season === CURRENT_SEASON && (await exists(legacyPng))
        ? { kind: "legacy-current", filePath: legacyPng, relativePath: `/drivers/avatars/${driver.slug}.png` }
        : null;

    let sourceHash = null;
    let shouldConvert = false;
    if (candidateSource) {
      sourceHash = sha256(await readFile(candidateSource.filePath));
      shouldConvert =
        !(await exists(outputPath)) ||
        previous?.source?.sha256 !== sourceHash ||
        previous?.source?.sourceFile !== candidateSource.relativePath;
    }

    if (candidateSource && shouldConvert && !skipConversion) {
      await runConverter(candidateSource.filePath, outputPath);
      console.log(`converted ${season}/${driver.slug} from ${candidateSource.relativePath}`);
    }

    const hasFile = await exists(outputPath);
    const buffer = hasFile ? await readFile(outputPath) : null;
    const fileHash = buffer ? sha256(buffer) : null;
    const fileStats = hasFile ? await stat(outputPath) : null;
    const outputChanged = Boolean(previous?.sha256 && previous.sha256 !== fileHash);
    const sourceChanged = Boolean(
      previous?.source?.sha256 && sourceHash && previous.source.sha256 !== sourceHash,
    );
    const importedExistingCurrent =
      season === CURRENT_SEASON &&
      candidateSource?.kind === "legacy-current" &&
      hasFile &&
      !previous;

    let manualReview = validReview(previous?.manualReview) ?? {
      status: "pending",
      reviewedAt: null,
      note: null,
    };

    if (importedExistingCurrent) {
      manualReview = {
        status: "approved",
        reviewedAt: generatedAt,
        note: "Imported from the accepted RaceMate 2026 production avatar set.",
      };
    } else if (outputChanged || sourceChanged) {
      manualReview = {
        status: "pending",
        reviewedAt: null,
        note: "The source or rendered file changed after the previous review.",
      };
    }

    const helmetReferenceUrl = previous?.helmetReferenceUrl ?? null;

    if (season < CURRENT_SEASON && manualReview.status === "approved" && !helmetReferenceUrl) {
      manualReview = {
        status: "pending",
        reviewedAt: null,
        note: "A season-specific regular helmet visual reference is required before approval.",
      };
    }

    const identityReferenceUrl =
      previous?.identityReferenceUrl ??
      previous?.referenceUrl ??
      driver.driverReferenceUrl ??
      driver.primaryTeam.referenceUrl ??
      `${JOLPICA_BASE_URL}/drivers/${driver.externalId}.json`;
    const prompt = buildPrompt({
      fullName: driver.fullName,
      season,
      teamName: driver.primaryTeam.name,
    });

    entries.push({
      externalId: driver.externalId,
      slug: driver.slug,
      fullName: driver.fullName,
      givenName: driver.givenName,
      familyName: driver.familyName,
      code: driver.code,
      permanentNumber: driver.permanentNumber,
      nationality: driver.nationality,
      season,
      team: {
        externalId: driver.primaryTeam.externalId,
        name: driver.primaryTeam.name,
        referenceUrl: driver.primaryTeam.referenceUrl,
      },
      starts: driver.starts,
      appearances: driver.appearances,
      lastStartRound: driver.lastStartRound,
      primaryTeamRule: "most race starts; tie broken by latest race start",
      teamStints: driver.teamStints,
      file: relativeFile,
      source: hasFile
        ? {
            kind:
              candidateSource?.kind ??
              (previous?.source?.kind === "missing" ? null : previous?.source?.kind) ??
              "generated",
            sourceFile: candidateSource?.relativePath ?? previous?.source?.sourceFile ?? null,
            sha256: sourceHash ?? previous?.source?.sha256 ?? null,
          }
        : {
            kind: "missing",
            sourceFile: null,
            sha256: null,
          },
      identityReferenceUrl,
      helmetReferenceUrl,
      promptVersion: PROMPT_VERSION,
      prompt,
      sha256: fileHash,
      bytes: fileStats?.size ?? null,
      manualReview,
    });
  }

  const ready = entries.filter(
    (entry) =>
      entry.sha256 &&
      entry.bytes &&
      isApproved(entry.manualReview) &&
      (season === CURRENT_SEASON || entry.helmetReferenceUrl),
  ).length;
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    season,
    promptVersion: PROMPT_VERSION,
    helmetReferencePolicy: HELMET_REFERENCE_POLICY,
    generatedAt,
    source: {
      provider: "Jolpica F1",
      resultsUrl,
      standingsUrl,
      fetchedAt: generatedAt,
    },
    complete: entries.length > 0 && ready === entries.length,
    stats: {
      drivers: entries.length,
      raceResultRows: records.length,
      ready,
      pending: entries.length - ready,
    },
    drivers: entries,
  };

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${season}: ${ready}/${entries.length} avatars ready; manifest ${manifest.complete ? "complete" : "pending"}`);
  return manifest;
}

for (const season of seasons) {
  await syncSeason(season);
}
