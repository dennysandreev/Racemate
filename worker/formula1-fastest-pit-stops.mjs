const FORMULA1_BASE_URL = "https://www.formula1.com";
const loadCache = new Map();

export function getFormula1FastestPitStopsUrl(season) {
  return `${FORMULA1_BASE_URL}/en/results/${Number(season)}/awards/fastest-pit-stops`;
}

export async function loadFormula1FastestPitStops(
  season,
  {
    fetchImpl = fetch,
    timeoutMs = Number(process.env.FORMULA1_RESULTS_TIMEOUT_MS ?? 20_000),
  } = {},
) {
  const normalizedSeason = Number(season);

  if (!Number.isInteger(normalizedSeason) || normalizedSeason < 1950) {
    throw new Error(`Invalid Formula 1 season: ${season}`);
  }

  if (!loadCache.has(normalizedSeason)) {
    loadCache.set(normalizedSeason, fetchFormula1FastestPitStops(normalizedSeason, { fetchImpl, timeoutMs }));
  }

  try {
    return await loadCache.get(normalizedSeason);
  } catch (error) {
    loadCache.delete(normalizedSeason);
    throw error;
  }
}

export async function fetchFormula1FastestPitStops(
  season,
  {
    fetchImpl = fetch,
    timeoutMs = Number(process.env.FORMULA1_RESULTS_TIMEOUT_MS ?? 20_000),
  } = {},
) {
  const sourceUrl = getFormula1FastestPitStopsUrl(season);
  const response = await fetchImpl(sourceUrl, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "RaceSide/1.0 (+https://raceside.online)",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Formula 1 fastest pit stops failed: ${response.status}`);
  }

  const entries = parseFormula1FastestPitStops(await response.text(), season);

  if (!entries.length) {
    throw new Error(`Formula 1 fastest pit stops returned no rows for ${season}`);
  }

  return entries;
}

export function parseFormula1FastestPitStops(html, season) {
  const normalizedSeason = Number(season);
  const sourceUrl = getFormula1FastestPitStopsUrl(normalizedSeason);
  const entries = [];
  const rowPattern = /<tr\b[^>]*Table-module_body-row[^>]*>([\s\S]*?)<\/tr>/gi;

  for (const rowMatch of String(html ?? "").matchAll(rowPattern)) {
    const row = rowMatch[1];
    const raceMatch = row.match(
      new RegExp(`/en/results/${normalizedSeason}/races/(\\d+)/([^"/]+)/race-result`, "i"),
    );
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)]
      .map((match) => stripHtml(match[1]));
    const team = cells[1]?.trim();
    const durationMatch = cells[2]?.match(/(\d+(?:[.,]\d+)?)\s*s\b/i);
    const duration = durationMatch ? Number(durationMatch[1].replace(",", ".")) : NaN;

    if (!raceMatch || !team || !Number.isFinite(duration) || duration <= 0 || duration >= 10) {
      continue;
    }

    entries.push({
      duration,
      formula1RaceId: Number(raceMatch[1]),
      raceSlug: raceMatch[2].toLowerCase(),
      season: normalizedSeason,
      sourceUrl,
      team,
    });
  }

  return entries;
}

export function findFormula1FastestPitStop(entries, raceName) {
  const raceIdentity = normalizeRaceIdentity(raceName);

  return (Array.isArray(entries) ? entries : []).find(
    (entry) => normalizeRaceIdentity(entry?.raceSlug) === raceIdentity,
  ) ?? null;
}

function stripHtml(value) {
  return decodeHtmlEntities(
    String(value ?? "")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function decodeHtmlEntities(value) {
  const named = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    if (entity.startsWith("#")) {
      const hexadecimal = entity[1]?.toLowerCase() === "x";
      const codePoint = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    return named[entity.toLowerCase()] ?? match;
  });
}

function normalizeRaceIdentity(value) {
  const normalized = String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\bgrand prix\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const aliases = {
    australian: "australia",
    austrian: "austria",
    "barcelona catalunya": "barcelona catalunya",
    barcelona: "barcelona catalunya",
    belgian: "belgium",
    brazilian: "brazil",
    british: "great britain",
    canadian: "canada",
    chinese: "china",
    dutch: "netherlands",
    hungarian: "hungary",
    italian: "italy",
    japanese: "japan",
    malaysian: "malaysia",
    mexican: "mexico city",
    spanish: "spain",
  };

  return aliases[normalized] ?? normalized;
}
