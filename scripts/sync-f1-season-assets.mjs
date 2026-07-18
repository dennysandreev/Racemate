import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

const MIN_SEASON = 2020;
const CURRENT_SEASON = 2026;
const F1_MEDIA_VERSION = "v1740000001";
const root = process.cwd();

const args = new Set(process.argv.slice(2));
const seasonArg = process.argv.find((arg) => arg.startsWith("--season="));
const requestedSeason = seasonArg ? Number(seasonArg.split("=")[1]) : null;
const dryRun = args.has("--dry-run");
const mapsOnly = args.has("--maps-only");
const carsOnly = args.has("--cars-only");
const liveMapsOnly = args.has("--live-maps");
const syncMaps = !carsOnly;
const syncTeams = !mapsOnly;
const CIRCUIT_MAP_SIZE = { width: 1252, height: 704 };
const ARCHIVE_PREFERENCE_WINDOW_DAYS = 270;
const RIGHTS_REVIEW = {
  status: "approved",
  reviewedAt: "2026-07-18",
  reviewer: "RaceMate product owner",
  note: "Use of the official Formula1.com circuit images was confirmed before release.",
};
const ARCHIVE_SOURCE_CACHE_DIR = path.join(tmpdir(), "racemate-f1-circuit-map-cache");
const archiveCaptureCache = new Map();
let localArchiveCaptureIndex = null;

if (requestedSeason && (!Number.isInteger(requestedSeason) || requestedSeason < MIN_SEASON || requestedSeason > CURRENT_SEASON)) {
  throw new Error(`Season must be between ${MIN_SEASON} and ${CURRENT_SEASON}.`);
}

const defaultMaxSeason = mapsOnly ? CURRENT_SEASON - 1 : CURRENT_SEASON;
const seasons = requestedSeason
  ? [requestedSeason]
  : Array.from({ length: defaultMaxSeason - MIN_SEASON + 1 }, (_, index) => MIN_SEASON + index);

const eventSlugOverrides = {
  "70th Anniversary Grand Prix": "70th-anniversary",
  "Abu Dhabi Grand Prix": "united-arab-emirates",
  "Australian Grand Prix": "australia",
  "Austrian Grand Prix": "austria",
  "Azerbaijan Grand Prix": "azerbaijan",
  "Bahrain Grand Prix": "bahrain",
  "Barcelona Grand Prix": "barcelona-catalunya",
  "Belgian Grand Prix": "belgium",
  "Brazilian Grand Prix": "brazil",
  "British Grand Prix": "great-britain",
  "Canadian Grand Prix": "canada",
  "Chinese Grand Prix": "china",
  "Dutch Grand Prix": "netherlands",
  "Eifel Grand Prix": "germany",
  "French Grand Prix": "france",
  "Hungarian Grand Prix": "hungary",
  "Italian Grand Prix": "italy",
  "Japanese Grand Prix": "japan",
  "Las Vegas Grand Prix": "las-vegas",
  "Mexico City Grand Prix": "mexico",
  "Miami Grand Prix": "miami",
  "Monaco Grand Prix": "monaco",
  "Portuguese Grand Prix": "portugal",
  "Qatar Grand Prix": "qatar",
  "Russian Grand Prix": "russia",
  "Sakhir Grand Prix": "sakhir",
  "Saudi Arabian Grand Prix": "saudi-arabia",
  "Singapore Grand Prix": "singapore",
  "Spanish Grand Prix": "spain",
  "Styrian Grand Prix": "styria",
  "São Paulo Grand Prix": "brazil",
  "Turkish Grand Prix": "turkey",
  "Tuscan Grand Prix": "tuscany",
  "United States Grand Prix": "united-states",
};

const teamMediaSlugs = {
  alfa: ["alfaromeo"],
  alpine: ["alpine"],
  alphatauri: ["alphatauri"],
  aston_martin: ["astonmartin"],
  audi: ["audi"],
  cadillac: ["cadillac"],
  ferrari: ["ferrari"],
  haas: ["haas"],
  mclaren: ["mclaren"],
  mercedes: ["mercedes"],
  racing_point: ["racingpoint"],
  rb: ["racingbulls", "rb"],
  red_bull: ["redbullracing", "redbull"],
  renault: ["renault"],
  sauber: ["kicksauber", "sauber"],
  williams: ["williams"],
};

function padRound(round) {
  return String(round).padStart(2, "0");
}

function isSeasonCircuitFile(value, season) {
  return (
    typeof value === "string" &&
    new RegExp(`^/f1/circuits/${season}/[a-z0-9-]+\\.webp$`).test(value)
  );
}

function fileSlug(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function decodeFormulaOneUrl(url) {
  return url
    .replaceAll("\\u0026", "&")
    .replaceAll("&amp;", "&")
    .replaceAll("\\/", "/")
    .replace(/\\+$/, "");
}

function parseCircuitMapMetadata(html) {
  const decodedHtml = decodeFormulaOneUrl(html).replaceAll('\\"', '"');
  const block = decodedHtml.match(/"circuitMapImage":\{([^{}]+)\}/)?.[1] ?? "";
  const originalPath = block.match(/"path":"([^"]+)"/)?.[1] ?? null;
  const rawSourceUrl = block.match(/"url":"([^"]+)"/)?.[1] ?? null;
  const title = block.match(/"title":"([^"]+)"/)?.[1] ?? "Formula1 circuit map";
  const decodedRawSourceUrl = rawSourceUrl ? decodeFormulaOneUrl(rawSourceUrl) : null;
  const liveSourceUrl = isOfficialFormulaOneImageUrl(decodedRawSourceUrl)
    ? decodedRawSourceUrl
    : findTrackImageUrl(html, originalPath);

  if (!liveSourceUrl) {
    return null;
  }

  return {
    title,
    liveSourceUrl,
    rawSourceUrl: decodedRawSourceUrl,
    originalUrl: originalPath
      ? new URL(decodeFormulaOneUrl(originalPath), "https://www.formula1.com").toString()
      : liveSourceUrl,
  };
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function dateFromCompactTimestamp(value) {
  if (!/^\d{14}$/.test(value ?? "")) return null;
  return new Date(
    `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}Z`,
  );
}

function daysBetween(left, right) {
  return Math.round(Math.abs(left.getTime() - right.getTime()) / 86_400_000);
}

function uploadDateFromUrl(url) {
  const timestamp = Number(url?.match(/\/v(\d{10})\//)?.[1]);
  return Number.isFinite(timestamp) ? new Date(timestamp * 1000) : null;
}

function archiveCaptureQuality(originalUrl) {
  const variant = originalUrl.match(/\.transform\/([^/]+)\//)?.[1] ?? null;
  if (!variant) return 100;

  return ({
    "9col-retina": 99,
    "9col": 98,
    "8col-retina": 97,
    "8col": 96,
    "7col-retina": 94,
    "7col": 92,
    "6col-retina": 90,
  })[variant] ?? 0;
}

async function readLocalArchiveCaptureIndex() {
  const indexPath = process.env.RACEMATE_WAYBACK_INDEX;
  if (!indexPath) return null;
  if (localArchiveCaptureIndex) return localArchiveCaptureIndex;

  localArchiveCaptureIndex = (async () => {
    const payload = JSON.parse(await readFile(indexPath, "utf8"));
    const [header, ...rows] = Array.isArray(payload) ? payload : [];
    if (!Array.isArray(header)) {
      throw new Error(`Invalid Wayback capture index: ${indexPath}`);
    }
    const columns = new Map(header.map((name, index) => [name, index]));
    return rows.map((row) => ({
      digest: row[columns.get("digest")],
      length: Number(row[columns.get("length")]),
      mimetype: columns.has("mimetype") ? row[columns.get("mimetype")] : "image/png",
      originalUrl: row[columns.get("original")],
      timestamp: row[columns.get("timestamp")],
    }));
  })();

  return localArchiveCaptureIndex;
}

async function fetchArchiveCaptureIndex(originalUrl) {
  if (archiveCaptureCache.has(originalUrl)) {
    return archiveCaptureCache.get(originalUrl);
  }

  const request = (async () => {
    const source = new URL(originalUrl);
    const localIndex = await readLocalArchiveCaptureIndex();
    if (localIndex) {
      const sourcePrefix = `${source.origin}${source.pathname}`;
      const localCaptures = localIndex.filter((capture) =>
        capture.originalUrl.startsWith(sourcePrefix),
      );
      if (localCaptures.length > 0) return localCaptures;
    }

    const cdxUrl = new URL("https://web.archive.org/cdx/search/cdx");
    cdxUrl.searchParams.set("url", `${source.hostname}${source.pathname}*`);
    cdxUrl.searchParams.set("output", "json");
    cdxUrl.searchParams.set("filter", "statuscode:200");
    cdxUrl.searchParams.set("fl", "timestamp,original,digest,mimetype,length");
    let lastError = null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const response = await fetch(cdxUrl, {
          headers: { "user-agent": "Mozilla/5.0 RaceMateHistoricalCircuitSync/1.0" },
          signal: AbortSignal.timeout(60_000),
        });
        if (response.ok) {
          const payload = await response.json();
          const [header, ...rows] = Array.isArray(payload) ? payload : [];
          if (!Array.isArray(header)) return [];
          const columns = new Map(header.map((name, index) => [name, index]));
          return rows
            .map((row) => ({
              digest: row[columns.get("digest")],
              length: Number(row[columns.get("length")]),
              mimetype: row[columns.get("mimetype")],
              originalUrl: row[columns.get("original")],
              timestamp: row[columns.get("timestamp")],
            }))
            .filter(
              (capture) =>
                /^\d{14}$/.test(capture.timestamp ?? "") &&
                String(capture.mimetype ?? "").startsWith("image/") &&
                /^https:\/\/(?:www\.)?formula1\.com\//i.test(capture.originalUrl ?? ""),
            );
        }

        lastError = new Error(`${cdxUrl} returned ${response.status}`);
        if (response.status < 500 && response.status !== 429) break;
      } catch (error) {
        lastError = error;
      }

      await sleep(750 * 2 ** attempt);
    }

    console.warn(
      `archive index unavailable for ${originalUrl}: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    );
    return [];
  })();

  archiveCaptureCache.set(originalUrl, request);
  return request;
}

function selectArchiveCapture(captures, raceDate, override) {
  if (override?.archiveTimestamp) {
    const pinned = captures
      .filter((capture) => capture.timestamp === override.archiveTimestamp)
      .sort((left, right) => {
        const quality = archiveCaptureQuality(right.originalUrl) - archiveCaptureQuality(left.originalUrl);
        if (quality !== 0) return quality;
        return right.length - left.length;
      });
    if (pinned[0] && archiveCaptureQuality(pinned[0].originalUrl) > 0) return pinned[0];
    throw new Error(
      `Pinned Formula1 archive capture ${override.archiveTimestamp} was not found at an accepted resolution.`,
    );
  }

  const eventDate = new Date(`${raceDate}T23:59:59Z`);
  const seasonEnd = new Date(`${raceDate.slice(0, 4)}-12-31T23:59:59Z`);
  return captures
    .filter((capture) => {
      const captureDate = dateFromCompactTimestamp(capture.timestamp);
      return archiveCaptureQuality(capture.originalUrl) > 0 && captureDate && captureDate <= seasonEnd;
    })
    .map((capture) => {
      const captureDate = dateFromCompactTimestamp(capture.timestamp);
      const distanceDays = captureDate ? daysBetween(captureDate, eventDate) : Number.POSITIVE_INFINITY;
      const afterEventPenalty = captureDate && captureDate > eventDate ? 7 : 0;
      return { capture, score: distanceDays + afterEventPenalty };
    })
    .sort((left, right) => {
      if (left.score !== right.score) return left.score - right.score;
      const quality =
        archiveCaptureQuality(right.capture.originalUrl) -
        archiveCaptureQuality(left.capture.originalUrl);
      if (quality !== 0) return quality;
      return right.capture.length - left.capture.length;
    })[0]?.capture ?? null;
}

async function fetchArchivedCircuitImage(originalUrl, raceDate, override) {
  const captures = await fetchArchiveCaptureIndex(originalUrl);
  const capture = selectArchiveCapture(captures, raceDate, override);
  if (!capture) return null;

  const archiveRequestUrl = `https://web.archive.org/web/${capture.timestamp}id_/${capture.originalUrl}`;
  const cachePath = path.join(
    ARCHIVE_SOURCE_CACHE_DIR,
    `${sha256(Buffer.from(archiveRequestUrl))}.image`,
  );
  try {
    const cachedBuffer = await readFile(cachePath);
    if (cachedBuffer.length > 1_000) {
      return {
        archiveTimestamp: capture.timestamp,
        archiveUrl: archiveRequestUrl,
        buffer: cachedBuffer,
        capturedBeforeEvent:
          capture.timestamp <= `${raceDate.replaceAll("-", "")}235959`,
        contentType: "image/archive-cache",
      };
    }
  } catch {
    // The source cache is optional. Fetch and populate it below.
  }
  let lastError = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(archiveRequestUrl, {
        headers: { "user-agent": "Mozilla/5.0 RaceMateHistoricalCircuitSync/1.0" },
        redirect: "follow",
        signal: AbortSignal.timeout(60_000),
      });
      const contentType = response.headers.get("content-type") ?? "";

      if (response.ok && contentType.startsWith("image/")) {
        const buffer = Buffer.from(await response.arrayBuffer());
        if (!dryRun) {
          await mkdir(ARCHIVE_SOURCE_CACHE_DIR, { recursive: true });
          const temporaryCachePath = `${cachePath}.${process.pid}-${Date.now()}.tmp`;
          await writeFile(temporaryCachePath, buffer);
          await rename(temporaryCachePath, cachePath);
        }
        return {
          archiveTimestamp: capture.timestamp,
          archiveUrl: response.url,
          buffer,
          capturedBeforeEvent:
            capture.timestamp <= `${raceDate.replaceAll("-", "")}235959`,
          contentType,
        };
      }

      lastError = new Error(
        `${archiveRequestUrl} returned ${response.status} (${contentType || "unknown content type"})`,
      );
      if (response.status < 500 && response.status !== 429) break;
    } catch (error) {
      lastError = error;
    }

    await sleep(500 * 2 ** attempt);
  }

  console.warn(
    `archive unavailable for ${originalUrl}: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
  return null;
}

function shouldUseArchivedMap({ archive, metadata, override, raceDate, season }) {
  if (!archive || liveMapsOnly) return false;
  if (override?.archiveTimestamp) return true;

  const archiveDate = dateFromCompactTimestamp(archive.archiveTimestamp);
  if (!archiveDate) return true;

  const eventDate = new Date(`${raceDate}T12:00:00Z`);
  const archiveDistanceDays = daysBetween(archiveDate, eventDate);
  const rawUploadDate = uploadDateFromUrl(metadata.rawSourceUrl);
  const rawUploadDistanceDays = rawUploadDate ? daysBetween(rawUploadDate, eventDate) : null;
  const rawUploadPredatesEvent = rawUploadDate && rawUploadDate <= new Date(`${raceDate}T23:59:59Z`);

  if (
    season >= 2023 &&
    archiveDistanceDays > ARCHIVE_PREFERENCE_WINDOW_DAYS &&
    rawUploadPredatesEvent &&
    rawUploadDistanceDays <= ARCHIVE_PREFERENCE_WINDOW_DAYS
  ) {
    return false;
  }

  return archiveDistanceDays <= 400;
}

async function firstExisting(paths) {
  for (const candidate of paths) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue to the next local runtime candidate.
    }
  }
  return null;
}

async function getAssetPython() {
  return firstExisting(
    [
      process.env.RACEMATE_ASSET_PYTHON,
      path.join(
        homedir(),
        ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3",
      ),
      "/opt/homebrew/bin/python3",
      "/usr/local/bin/python3",
      "/usr/bin/python3",
    ].filter(Boolean),
  );
}

async function normalizeCircuitImage(buffer, label, transform = null) {
  const python = await getAssetPython();
  if (!python) throw new Error("Python 3 with Pillow is required to normalize circuit maps.");

  const nonce = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const temporaryInput = path.join(tmpdir(), `racemate-circuit-${nonce}.image`);
  const temporaryOutput = path.join(tmpdir(), `racemate-circuit-${nonce}.webp`);
  await writeFile(temporaryInput, buffer);

  try {
    const normalizerArgs = [
      path.join(root, "scripts", "normalize-f1-circuit-map.py"),
      temporaryInput,
      temporaryOutput,
    ];
    if (Array.isArray(transform?.crop) && transform.crop.length === 4) {
      normalizerArgs.push("--crop", transform.crop.join(","));
    }
    if (transform?.whiteToTransparent === true) {
      normalizerArgs.push("--white-to-transparent");
    }

    await new Promise((resolve, reject) => {
      const child = spawn(
        python,
        normalizerArgs,
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      let stderr = "";
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr.trim() || `Circuit normalizer failed for ${label}`));
      });
    });

    return await readFile(temporaryOutput);
  } finally {
    await unlink(temporaryInput).catch(() => {});
    await unlink(temporaryOutput).catch(() => {});
  }
}

async function fetchResponse(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 RaceMateSeasonAssetSync/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }

  return response;
}

async function fetchJson(url) {
  return fetchResponse(url).then((response) => response.json());
}

async function fetchText(url) {
  return fetchResponse(url).then((response) => response.text());
}

async function fetchImage(url) {
  const response = await fetchResponse(url);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/") || contentType.includes("gif")) {
    throw new Error(`${url} did not return a supported image (${contentType || "unknown"}).`);
  }

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType,
  };
}

async function tryFetchImage(urls) {
  for (const url of urls) {
    try {
      const image = await fetchImage(url);
      if (image.contentType === "image/webp") {
        return { ...image, sourceUrl: url };
      }
    } catch {
      // The media archive is not uniform across seasons. Try the next official candidate.
    }
  }

  return null;
}

async function writeAsset(outputPath, buffer) {
  if (dryRun) {
    return;
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}-${Date.now()}.tmp`;
  try {
    await writeFile(temporaryPath, buffer);
    await rename(temporaryPath, outputPath);
  } finally {
    await unlink(temporaryPath).catch(() => {});
  }
}

async function readOptionalJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

function isOfficialFormulaOneImageUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      ["formula1.com", "www.formula1.com", "media.formula1.com"].includes(url.hostname) &&
      /\.(webp|png|jpe?g)(?:\?|$)/i.test(url.toString())
    );
  } catch {
    return false;
  }
}

function findTrackImageUrl(html, originalPath = null) {
  const urls = Array.from(
    html.matchAll(/https:\/\/media\.formula1\.com\/image\/upload\/[^"'<>\s]+/g),
    ([url]) => decodeFormulaOneUrl(url),
  ).filter((url) => /\.(webp|png|jpe?g)(?:\?|$)/i.test(url));
  const originalName = originalPath
    ? decodeURIComponent(originalPath).split("/").at(-1)?.split(".")[0]?.toLowerCase()
    : null;

  const score = (url) => {
    let value = 0;
    if (url.includes("c_fit,h_704")) value += 100;
    if (/detailed/i.test(url)) value += 90;
    if (/Circuit%20maps%2016x9/i.test(url)) value += 80;
    if (/\/track\//i.test(url)) value += 70;
    if (/circuit/i.test(url)) value += 40;
    if (/Track%20icons/i.test(url)) value -= 150;
    if (/card\//i.test(url)) value -= 100;
    if (/\.webp(?:\?|$)/i.test(url)) value += 20;
    if (originalName && decodeURIComponent(url).toLowerCase().includes(originalName)) value += 250;
    return value;
  };

  return urls.sort((left, right) => score(right) - score(left))[0] ?? null;
}

function eventSlugForRace(season, raceName) {
  if (raceName === "Emilia Romagna Grand Prix") {
    return season === 2020 ? "emilia-romagna" : "emiliaromagna";
  }
  return eventSlugOverrides[raceName] ?? fileSlug(raceName.replace(/ Grand Prix$/i, ""));
}

async function getCalendar(season) {
  const payload = await fetchJson(`https://api.jolpi.ca/ergast/f1/${season}.json?limit=100`);
  const races = payload?.MRData?.RaceTable?.Races;
  if (!Array.isArray(races) || races.length < 15 || races.length > 25) {
    throw new Error(`Jolpica returned an invalid ${season} calendar.`);
  }
  if (races.some((race, index) => Number(race.round) !== index + 1 || !race.date)) {
    throw new Error(`Jolpica returned non-contiguous ${season} calendar rounds.`);
  }
  return races;
}

async function getConstructors(season) {
  const payload = await fetchJson(
    `https://api.jolpi.ca/ergast/f1/${season}/constructorstandings.json?limit=100`,
  );
  const lists = payload?.MRData?.StandingsTable?.StandingsLists ?? [];
  return (lists.at(-1)?.ConstructorStandings ?? []).map(({ Constructor }) => Constructor);
}

async function syncCircuitMaps(season, races) {
  const outputDir = path.join(root, "public", "f1", "circuits", String(season));
  const manifestPath = path.join(outputDir, "manifest.json");
  const existingManifest = await readOptionalJson(manifestPath);
  const overrides = await readOptionalJson(
    path.join(root, "scripts", "f1-historical-circuit-map-overrides.json"),
  );
  const existingByRound = new Map(
    (existingManifest.sources ?? []).map((source) => [Number(source.round), source]),
  );
  const sources = [];
  const missing = [];

  for (const race of races) {
    const round = Number(race.round);
    const eventSlug = eventSlugForRace(season, race.raceName);
    const racePageUrl = `https://www.formula1.com/en/racing/${season}/${eventSlug}`;
    const override =
      overrides?.[season]?.[`round-${round}`] ??
      overrides?.[season]?.[race.Circuit?.circuitId] ??
      null;
    const usesExternalOfficialAsset = override?.selection === "official-external";
    const metadata = usesExternalOfficialAsset
      ? {
          title: override.sourceTitle ?? `${race.raceName} official track map`,
          liveSourceUrl: null,
          rawSourceUrl: null,
          originalUrl: null,
        }
      : parseCircuitMapMetadata(await fetchText(racePageUrl));

    if (!metadata) {
      throw new Error(`Detailed circuit image was not found on ${racePageUrl}.`);
    }
    if (
      usesExternalOfficialAsset &&
      (!override.authority || !override.pageUrl || !override.sourceUrl)
    ) {
      throw new Error(`Official external circuit source is incomplete for ${season}/${round}.`);
    }

    const archive =
      season < CURRENT_SEASON &&
      !liveMapsOnly &&
      override?.selection !== "live" &&
      !usesExternalOfficialAsset
      ? await fetchArchivedCircuitImage(metadata.originalUrl, race.date, override)
      : null;
    if (
      season < CURRENT_SEASON &&
      !liveMapsOnly &&
      override?.selection !== "live" &&
      !usesExternalOfficialAsset &&
      !archive
    ) {
      throw new Error(
        `No archived Formula1 circuit map is available for ${season}/${round}; add a reviewed live override before syncing.`,
      );
    }
    const useArchive = shouldUseArchivedMap({
      archive,
      metadata,
      override,
      raceDate: race.date,
      season,
    });
    if (
      season < CURRENT_SEASON &&
      !liveMapsOnly &&
      !usesExternalOfficialAsset &&
      override?.selection !== "live" &&
      !useArchive
    ) {
      throw new Error(
        `Archived Formula1 circuit map was rejected for ${season}/${round}; pin an event version or add a reviewed source override.`,
      );
    }
    const selectedImage = usesExternalOfficialAsset
      ? await fetchImage(override.sourceUrl)
      : useArchive
        ? archive
        : await fetchImage(metadata.liveSourceUrl);
    const existing = existingByRound.get(round);
    const relativeFile = isSeasonCircuitFile(existing?.file, season)
      ? existing.file
      : `/f1/circuits/${season}/${padRound(round)}-${eventSlug}.webp`;
    const outputPath = path.resolve(root, "public", relativeFile.replace(/^\//, ""));
    const seasonOutputPrefix = `${path.resolve(outputDir)}${path.sep}`;
    if (!outputPath.startsWith(seasonOutputPrefix)) {
      throw new Error(`Circuit output path escapes the ${season} directory: ${relativeFile}`);
    }
    const output = await normalizeCircuitImage(
      selectedImage.buffer,
      `${season}/${padRound(round)} ${eventSlug}`,
      override?.transform ?? null,
    );
    await writeAsset(outputPath, output);
    const outputSha256 = sha256(output);
    const sourceImageSha256 = sha256(selectedImage.buffer);
    const archiveTimestamp = useArchive ? archive.archiveTimestamp : null;
    const archiveDate = dateFromCompactTimestamp(archiveTimestamp);
    const archiveDistanceDays = archiveDate
      ? daysBetween(archiveDate, new Date(`${race.date}T12:00:00Z`))
      : null;
    const approvalUnchanged =
      existing?.sha256 === outputSha256 &&
      existing?.sourceImageSha256 === sourceImageSha256 &&
      existing?.archiveTimestamp === archiveTimestamp &&
      existing?.manualReview?.status === "approved";

    sources.push({
      season,
      round,
      raceName: race.raceName,
      circuitId: race.Circuit?.circuitId ?? null,
      layoutSlug: existing?.layoutSlug ?? eventSlug,
      file: relativeFile,
      authority: usesExternalOfficialAsset ? override.authority : "Formula1.com",
      pageUrl: usesExternalOfficialAsset ? override.pageUrl : racePageUrl,
      racePageUrl,
      sourceUrl: usesExternalOfficialAsset
        ? override.sourceUrl
        : useArchive
          ? metadata.originalUrl
          : metadata.liveSourceUrl,
      sourceTitle: usesExternalOfficialAsset
        ? (override.sourceTitle ?? `${race.raceName} official track map`)
        : metadata.title,
      liveSourceUrl: metadata.liveSourceUrl,
      archiveUrl: useArchive ? archive.archiveUrl : null,
      archiveTimestamp,
      archiveDistanceDays,
      sourceSelection: usesExternalOfficialAsset
        ? "official-team-event-media"
        : useArchive
          ? override?.archiveTimestamp
            ? "wayback-pinned-event-version"
            : "wayback-nearest-to-race-date"
          : "official-season-page-live-asset",
      sourceNote: override?.note ?? null,
      transform: override?.transform ?? null,
      raceDate: race.date,
      sourceImageSha256,
      sha256: outputSha256,
      width: CIRCUIT_MAP_SIZE.width,
      height: CIRCUIT_MAP_SIZE.height,
      manualReview: approvalUnchanged
        ? existing.manualReview
        : { status: "pending" },
    });
    console.log(
      `${dryRun ? "checked" : "saved"} map ${season}/${padRound(round)} ${eventSlug} (${usesExternalOfficialAsset ? "official team" : useArchive ? archiveTimestamp : "live"})`,
    );
    if (useArchive) {
      await sleep(400);
    }
  }

  if (!dryRun) {
    await mkdir(outputDir, { recursive: true });
    await writeAsset(
      manifestPath,
      Buffer.from(`${JSON.stringify(
        {
          season,
          expectedRaces: races.length,
          downloadedAt: new Date().toISOString(),
          complete: sources.length === races.length && missing.length === 0,
          missing,
          rightsReviewRequired: true,
          rightsReview: RIGHTS_REVIEW,
          sources,
        },
        null,
        2,
      )}\n`),
    );
  }

  return sources;
}

function officialMediaCandidates(season, constructorId, kind) {
  const mediaSlugs = teamMediaSlugs[constructorId] ?? [constructorId.replaceAll("_", "")];
  const suffix = kind === "car" ? "carright" : "logowhite";
  const transform = kind === "car" ? "c_lfill,w_3392" : "c_fit,h_96";

  return mediaSlugs.map(
    (slug) =>
      `https://media.formula1.com/image/upload/${transform}/q_auto/${F1_MEDIA_VERSION}/common/f1/${season}/${slug}/${season}${slug}${suffix}.webp`,
  );
}

async function existingCurrentCar(constructorId) {
  if (CURRENT_SEASON !== 2026) return null;
  const aliases = {
    aston_martin: "aston-martin",
    red_bull: "red-bull",
    rb: "racing-bulls",
  };
  const sourceSlug = aliases[constructorId] ?? fileSlug(constructorId);
  const sourcePath = path.join(root, "public", "f1", "teams", "cars", "2026", `${sourceSlug}.webp`);
  try {
    await access(sourcePath);
    return readFile(sourcePath);
  } catch {
    return null;
  }
}

async function syncTeamAssets(season, constructors) {
  const overridePath = path.join(root, "scripts", "f1-season-asset-sources.json");
  const overrides = await readOptionalJson(overridePath);
  const sources = [];
  const missing = [];

  for (const constructor of constructors) {
    const constructorId = constructor.constructorId;
    const outputSlug = fileSlug(constructorId);
    const carOverride = overrides?.[season]?.[constructorId]?.car ?? null;
    const logoOverride = overrides?.[season]?.[constructorId]?.logo ?? null;
    let car = await tryFetchImage([
      ...(carOverride ? [carOverride] : []),
      ...officialMediaCandidates(season, constructorId, "car"),
    ]);
    const logo = await tryFetchImage([
      ...(logoOverride ? [logoOverride] : []),
      ...officialMediaCandidates(season, constructorId, "logo"),
    ]);

    if (!car && season === 2026) {
      const buffer = await existingCurrentCar(constructorId);
      if (buffer) {
        car = {
          buffer,
          contentType: "image/webp",
          sourceUrl: "legacy-local-2026",
        };
      }
    }

    const row = {
      season,
      constructorId,
      name: constructor.name,
      car: null,
      logo: null,
    };

    if (car) {
      const relativeFile = `/f1/teams/cars/${season}/${outputSlug}.webp`;
      await writeAsset(path.join(root, "public", relativeFile), car.buffer);
      row.car = { file: relativeFile, sourceUrl: car.sourceUrl, sha256: sha256(car.buffer) };
    }

    if (logo) {
      const relativeFile = `/f1/teams/logos/${season}/${outputSlug}.webp`;
      await writeAsset(path.join(root, "public", relativeFile), logo.buffer);
      row.logo = { file: relativeFile, sourceUrl: logo.sourceUrl, sha256: sha256(logo.buffer) };
    }

    if (!row.car || !row.logo) {
      missing.push({ constructorId, car: !row.car, logo: !row.logo });
    }
    sources.push(row);
    console.log(`${row.car && row.logo ? dryRun ? "checked" : "saved" : "incomplete"} team ${season}/${constructorId}`);
  }

  if (!dryRun) {
    const outputDir = path.join(root, "public", "f1", "teams", "manifests");
    await mkdir(outputDir, { recursive: true });
    await writeFile(
      path.join(outputDir, `${season}.json`),
      `${JSON.stringify({ season, downloadedAt: new Date().toISOString(), complete: missing.length === 0, missing, sources }, null, 2)}\n`,
    );
  }

  return { sources, missing };
}

for (const season of seasons) {
  const races = await getCalendar(season);
  const constructors = await getConstructors(season);
  console.log(`syncing ${season}: ${races.length} races, ${constructors.length} constructors`);

  if (syncMaps) {
    await syncCircuitMaps(season, races);
  }
  if (syncTeams) {
    await syncTeamAssets(season, constructors);
  }
}
