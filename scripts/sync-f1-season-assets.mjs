import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
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
const syncMaps = !carsOnly;
const syncTeams = !mapsOnly;

if (requestedSeason && (!Number.isInteger(requestedSeason) || requestedSeason < MIN_SEASON || requestedSeason > CURRENT_SEASON)) {
  throw new Error(`Season must be between ${MIN_SEASON} and ${CURRENT_SEASON}.`);
}

const seasons = requestedSeason
  ? [requestedSeason]
  : Array.from({ length: CURRENT_SEASON - MIN_SEASON + 1 }, (_, index) => MIN_SEASON + index);

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
  await writeFile(outputPath, buffer);
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

function findTrackImageUrl(html) {
  const urls = Array.from(
    html.matchAll(/https:\/\/media\.formula1\.com\/image\/upload\/[^"'<>\s]+/g),
    ([url]) => decodeFormulaOneUrl(url),
  ).filter((url) => /\.(webp|png|jpe?g)(?:\?|$)/i.test(url));

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
  return payload?.MRData?.RaceTable?.Races ?? [];
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
  const sources = [];

  for (const race of races) {
    const round = Number(race.round);
    const eventSlug = eventSlugForRace(season, race.raceName);
    const pageUrl = `https://www.formula1.com/en/racing/${season}/${eventSlug}`;
    const html = await fetchText(pageUrl);
    const sourceUrl = findTrackImageUrl(html);

    if (!sourceUrl) {
      throw new Error(`Detailed circuit image was not found on ${pageUrl}.`);
    }

    const image = await fetchImage(sourceUrl);
    const relativeFile = `/f1/circuits/${season}/${padRound(round)}-${eventSlug}.webp`;
    await writeAsset(path.join(root, "public", relativeFile), image.buffer);
    sources.push({
      season,
      round,
      raceName: race.raceName,
      circuitId: race.Circuit?.circuitId ?? null,
      layoutSlug: eventSlug,
      file: relativeFile,
      pageUrl,
      sourceUrl,
      sha256: sha256(image.buffer),
    });
    console.log(`${dryRun ? "checked" : "saved"} map ${season}/${padRound(round)} ${eventSlug}`);
  }

  if (!dryRun) {
    await mkdir(outputDir, { recursive: true });
    await writeFile(
      path.join(outputDir, "manifest.json"),
      `${JSON.stringify({ season, downloadedAt: new Date().toISOString(), sources }, null, 2)}\n`,
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
