const DEFAULT_RACE_DATA_BASE_URL =
  "https://huggingface.co/datasets/tracinginsights/RaceData/resolve/main";

export const HISTORICAL_SAFETY_EVENT_START_SEASON = 2000;

export async function loadHistoricalSafetyEventIndex({
  baseUrl = process.env.RACE_DATA_BASE_URL ?? DEFAULT_RACE_DATA_BASE_URL,
  fetchImpl = fetch,
  timeoutMs = Number(process.env.RACE_DATA_FETCH_TIMEOUT_MS ?? 20000),
} = {}) {
  const options = {
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  };
  const [safetyCarCsv, redFlagCsv, virtualSafetyCars] = await Promise.all([
    fetchText(fetchImpl, `${baseUrl}/safety_cars.csv`, options),
    fetchText(fetchImpl, `${baseUrl}/red_flags.csv`, options),
    fetchJson(fetchImpl, `${baseUrl}/virtual_safety_car_estimates.json`, options),
  ]);

  return buildHistoricalSafetyEventIndex({
    redFlagCsv,
    safetyCarCsv,
    virtualSafetyCars,
  });
}

export function buildHistoricalSafetyEventIndex({
  redFlagCsv = "",
  safetyCarCsv = "",
  virtualSafetyCars = {},
} = {}) {
  const safetyCars = countCsvEventsByRace(safetyCarCsv);
  const redFlags = countCsvEventsByRace(redFlagCsv);
  const virtualSafetyCarEvents = new Map();

  for (const [raceName, laps] of Object.entries(virtualSafetyCars ?? {})) {
    const race = parseDatasetRaceName(raceName);

    if (!race) {
      continue;
    }

    virtualSafetyCarEvents.set(
      makeRaceKey(race.season, race.raceName),
      countContiguousPeriods(laps),
    );
  }

  return {
    safetyCars,
    redFlags,
    virtualSafetyCars: virtualSafetyCarEvents,
  };
}

export function getHistoricalSafetyEventCounts(index, season, raceName) {
  const normalizedSeason = Number(season);

  if (!index || !Number.isFinite(normalizedSeason) || normalizedSeason < HISTORICAL_SAFETY_EVENT_START_SEASON) {
    return null;
  }

  const keys = getRaceKeyCandidates(normalizedSeason, raceName);

  return {
    safetyCarCount: getIndexedCount(index.safetyCars, keys),
    vscCount: normalizedSeason < 2015 ? 0 : getIndexedCount(index.virtualSafetyCars, keys),
    redFlagCount: getIndexedCount(index.redFlags, keys),
  };
}

export function countOpenF1SafetyEvents(messages) {
  const rows = Array.isArray(messages) ? messages : [];

  return {
    safetyCarCount: countDistinctEvents(rows, (row) => {
      const message = normalizeText(row?.message);
      return /\bsafety car deployed\b/.test(message) && !/\bvirtual safety car\b|\bvsc\b/.test(message);
    }),
    vscCount: countDistinctEvents(rows, (row) => {
      const message = normalizeText(row?.message);
      return /\bvirtual safety car deployed\b|\bvsc deployed\b/.test(message);
    }),
    redFlagCount: countDistinctEvents(rows, (row) => {
      const message = normalizeText(row?.message);
      const flag = normalizeText(row?.flag);
      const category = normalizeText(row?.category);
      const isRedFlag = flag === "red" || /\bred flag\b/.test(message);
      const isEndMessage = /withdrawn|ended|ending|clear|resume|restart|green flag/.test(message);

      return isRedFlag && !isEndMessage && (category === "flag" || /\bred flag\b/.test(message));
    }),
  };
}

export function countReportSafetyEvents(events) {
  const rows = Array.isArray(events) ? events : [];

  return {
    safetyCarCount: countDistinctEvents(rows, (row) => matchesReportEvent(row, "safety_car")),
    vscCount: countDistinctEvents(rows, (row) => matchesReportEvent(row, "vsc")),
    redFlagCount: countDistinctEvents(rows, (row) => matchesReportEvent(row, "red_flag")),
  };
}

export function countContiguousPeriods(values) {
  const laps = [...new Set((Array.isArray(values) ? values : [])
    .map(Number)
    .filter(Number.isFinite))]
    .sort((left, right) => left - right);

  return laps.reduce((count, lap, index) => {
    if (index === 0 || lap > laps[index - 1] + 1) {
      return count + 1;
    }

    return count;
  }, 0);
}

export function parseCsvRows(csv) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < String(csv ?? "").length; index += 1) {
    const character = csv[index];
    const next = csv[index + 1];

    if (character === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      quoted = !quoted;
      continue;
    }

    if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") {
        index += 1;
      }

      row.push(cell);
      if (row.some((value) => value.trim())) {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }

    cell += character;
  }

  if (cell || row.length) {
    row.push(cell);
    if (row.some((value) => value.trim())) {
      rows.push(row);
    }
  }

  return rows;
}

function countCsvEventsByRace(csv) {
  const rows = parseCsvRows(csv);
  const header = rows[0] ?? [];
  const raceIndex = header.findIndex((column) => normalizeText(column) === "race");
  const counts = new Map();

  if (raceIndex < 0) {
    return counts;
  }

  for (const row of rows.slice(1)) {
    const race = parseDatasetRaceName(row[raceIndex]);

    if (!race) {
      continue;
    }

    const key = makeRaceKey(race.season, race.raceName);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

function parseDatasetRaceName(value) {
  const match = String(value ?? "").trim().match(/^(\d{4})\s+(.+)$/);

  if (!match) {
    return null;
  }

  return {
    season: Number(match[1]),
    raceName: match[2],
  };
}

function getRaceKeyCandidates(season, raceName) {
  const normalized = normalizeRaceName(raceName);
  const aliases = [normalized];

  if (normalized === "sao paulo") {
    aliases.push("brazilian");
  } else if (normalized === "brazilian") {
    aliases.push("sao paulo");
  }

  if (normalized === "mexico city") {
    aliases.push("mexican");
  } else if (normalized === "mexican") {
    aliases.push("mexico city");
  }

  if (normalized === "barcelona catalunya") {
    aliases.push("spanish");
  } else if (normalized === "spanish") {
    aliases.push("barcelona catalunya");
  }

  return [...new Set(aliases)].map((name) => `${season}:${name}`);
}

function makeRaceKey(season, raceName) {
  return `${season}:${normalizeRaceName(raceName)}`;
}

function normalizeRaceName(value) {
  return normalizeText(value)
    .replace(/^\d{4}\s+/, "")
    .replace(/\bgrand prix\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getIndexedCount(map, keys) {
  for (const key of keys) {
    if (map?.has(key)) {
      return map.get(key);
    }
  }

  return 0;
}

function countDistinctEvents(rows, predicate) {
  const keys = new Set();

  rows.forEach((row, index) => {
    if (!predicate(row)) {
      return;
    }

    const lap = Number(row?.lap_number ?? row?.lap ?? row?.round);
    const timestamp = Date.parse(row?.date ?? row?.timestamp ?? row?.occurred_at ?? "");
    const key = Number.isFinite(lap)
      ? `lap:${lap}`
      : Number.isFinite(timestamp)
        ? `time:${Math.floor(timestamp / 300000)}`
        : `row:${index}`;
    keys.add(key);
  });

  return keys.size;
}

function matchesReportEvent(event, kind) {
  const type = normalizeText(event?.type);
  const text = [event?.title, event?.detail, event?.message, event?.category]
    .map(normalizeText)
    .join(" ");
  const combined = `${type} ${text}`;
  const isEndOrPenalty = /ending|ended|in this lap|withdrawn|restart|resum|clear|speeding|penalt|штраф|наруш|заверш|уход/.test(combined);

  if (isEndOrPenalty) {
    return false;
  }

  if (kind === "red_flag") {
    return type === "red_flag" || /red flag|красн/.test(combined);
  }

  if (kind === "vsc") {
    return type === "vsc" || /virtual safety car|\bvsc\b/.test(combined);
  }

  return (type === "safety_car" || /safety car deployed|пейс.?кар.*(?:выехал|выпущен|появил)|сейфти/.test(combined)) &&
    !/virtual safety car|\bvsc\b/.test(combined);
}

async function fetchText(fetchImpl, url, options) {
  const response = await fetchImpl(url, options);

  if (!response.ok) {
    throw new Error(`RaceData ${response.status}: ${url}`);
  }

  return response.text();
}

async function fetchJson(fetchImpl, url, options) {
  const response = await fetchImpl(url, options);

  if (!response.ok) {
    throw new Error(`RaceData ${response.status}: ${url}`);
  }

  return response.json();
}
