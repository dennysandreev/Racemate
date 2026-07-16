import { createHash } from "node:crypto";
import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const MIN_SEASON = 2020;
const MAX_HISTORICAL_SEASON = 2025;
const FIA_SEASON_IDS = new Map([
  [2020, 1059],
  [2021, 1108],
  [2022, 2005],
  [2023, 2042],
  [2024, 2043],
  [2025, 2071],
]);
const FIA_DOCUMENT_OVERRIDES = new Map([
  [
    "2020-1",
    {
      title: "Circuit Map",
      url: "https://www.fia.com/sites/default/files/2020_austrian_grand_prix_-_circuit_map.pdf",
    },
  ],
  [
    "2021-16",
    {
      title: "Circuit Map",
      url: "https://www.fia.com/sites/default/files/doc_1_-_2021_turkish_grand_prix_-_circuit_map.pdf",
    },
  ],
  [
    "2021-21",
    {
      title: "Circuit Map",
      url: "https://www.fia.com/sites/default/files/doc_1_-_2021_saudi_arabian_grand_prix_-_circuit_map.pdf",
    },
  ],
  [
    "2024-16",
    {
      title: "Event Notes - Circuit Map, Pit Lane Drawing and Red Zones",
      url: "https://www.fia.com/sites/default/files/decision-document/2024%20Italian%20Grand%20Prix%20-%20Event%20Notes%20-%20Circuit%20Map%2C%20Pit%20Lane%20Drawing%20and%20Red%20Zones.pdf",
    },
  ],
  [
    "2024-17",
    {
      title: "Event Notes - Circuit Map, Pit Lane Drawing and Red Zones V2",
      url: "https://www.fia.com/sites/default/files/decision-document/2024%20Azerbaijan%20Grand%20Prix%20-%20Event%20Notes%20-%20Circuit%20Map%2C%20Pit%20Lane%20Drawing%20and%20Red%20Zones%20V2.pdf",
    },
  ],
  [
    "2024-24",
    {
      title: "Event Notes - Circuit Map, Pit Lane and Red Zones",
      url: "https://www.fia.com/sites/default/files/decision-document/2024%20Abu%20Dhabi%20Grand%20Prix%20-%20Event%20Notes%20-%20Circuit%20Map%2C%20Pit%20Lane%20and%20Red%20Zones.pdf",
    },
  ],
  [
    "2025-1",
    {
      title: "Event Notes - Circuit Map, Pit Lane and Quarantine Zone",
      url: "https://www.fia.com/system/files/decision-document/2025_australian_grand_prix_-_event_notes_-_circuit_map_pit_lane_and_quarantine_zone.pdf",
    },
  ],
  [
    "2025-24",
    {
      title: "Event Notes - Circuit Map, Pit Lane Drawing, Emergency Exits Map, Quarantine Zone and Red Zones",
      url: "https://www.fia.com/system/files/decision-document/2025_abu_dhabi_grand_prix_-_event_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_quarantine_zone_and_red_zones.pdf",
    },
  ],
]);
const root = process.cwd();
const seasonArg = process.argv.find((argument) => argument.startsWith("--season="));
const requestedSeason = seasonArg ? Number(seasonArg.split("=")[1]) : null;

if (
  requestedSeason !== null &&
  (!Number.isInteger(requestedSeason) ||
    requestedSeason < MIN_SEASON ||
    requestedSeason > MAX_HISTORICAL_SEASON)
) {
  throw new Error(`Season must be between ${MIN_SEASON} and ${MAX_HISTORICAL_SEASON}.`);
}

const seasons = requestedSeason
  ? [requestedSeason]
  : Array.from(
      { length: MAX_HISTORICAL_SEASON - MIN_SEASON + 1 },
      (_, index) => MIN_SEASON + index,
    );

const eventAliases = {
  "70th anniversary": ["70th anniversary grand prix"],
  "abu dhabi": ["abu dhabi grand prix", "united arab emirates grand prix"],
  "emilia romagna": ["emilia romagna grand prix"],
  "eifel": ["eifel grand prix"],
  "mexico city": ["mexico city grand prix", "mexican grand prix"],
  "sao paulo": ["sao paulo grand prix", "brazilian grand prix"],
  "sakhir": ["sakhir grand prix"],
  "styrian": ["styrian grand prix"],
  "tuscan": ["tuscan grand prix"],
};

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&#039;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("%C3%83O", "%C3%83O");
}

function stripTags(value) {
  return decodeHtml(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function normalizedName(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ÃO/gi, "AO")
    .toLowerCase()
    .replace(/grand prix|formula 1|fia/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function raceKey(raceName) {
  return normalizedName(raceName);
}

function similarity(left, right) {
  if (left === right) return 100;
  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union ? intersection / union : 0;
}

async function fetchResponse(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "RaceMateFiaCircuitAssetSync/1.0" },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }

  return response;
}

async function fetchText(url) {
  return fetchResponse(url).then((response) => response.text());
}

async function fetchBuffer(url) {
  const response = await fetchResponse(url);
  return Buffer.from(await response.arrayBuffer());
}

async function getCalendar(season) {
  const payload = JSON.parse(
    await fetchText(`https://api.jolpi.ca/ergast/f1/${season}.json?limit=100`),
  );
  return payload?.MRData?.RaceTable?.Races ?? [];
}

function getFiaEventOptions(html) {
  const select = html.match(/<select[^>]+id="facetapi_select_facet_form_2"[^>]*>([\s\S]*?)<\/select>/i)?.[1] ?? "";
  return Array.from(
    select.matchAll(/<option value="([^"]+)">([\s\S]*?)<\/option>/gi),
    ([, relativeUrl, label]) => ({
      label: stripTags(label),
      normalized: normalizedName(stripTags(label)),
      url: new URL(decodeHtml(relativeUrl), "https://www.fia.com").toString(),
    }),
  ).filter((event) => event.url.includes("/event/"));
}

function matchEvent(raceName, events) {
  const key = raceKey(raceName);
  const aliases = eventAliases[key] ?? [raceName];
  const candidates = aliases.map(normalizedName);
  const ranked = events
    .map((event) => ({
      event,
      score: Math.max(...candidates.map((candidate) => similarity(candidate, event.normalized))),
    }))
    .sort((left, right) => right.score - left.score);

  if (!ranked[0] || ranked[0].score < 0.5) {
    return null;
  }

  return ranked[0].event;
}

function getCircuitMapDocument(html) {
  const documents = Array.from(
    html.matchAll(/<div class="panelizer-view-mode node node-teaser[\s\S]*?<a href="([^"]+\.pdf)"[\s\S]*?<div class="field field-name-title-field[\s\S]*?<div class="field-item even">([\s\S]*?)<\/div>/gi),
    ([, relativeUrl, title]) => ({
      title: stripTags(title),
      url: new URL(decodeHtml(relativeUrl), "https://www.fia.com").toString(),
    }),
  );
  const scored = documents
    .map((document, index) => {
      const value = normalizedName(`${document.title} ${document.url}`);
      let score = 0;
      if (value.includes("circuit map")) score += 100;
      if (value.includes("updated")) score += 25;
      if (value.includes("version")) score += 20;
      if (value.includes("pit lane")) score += 10;
      if (value.includes("red zone")) score += 5;
      return { ...document, index, score };
    })
    .filter((document) => document.score >= 100)
    .sort((left, right) => right.score - left.score || left.index - right.index);

  return scored[0] ?? null;
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

async function getPython() {
  const configured = process.env.RACEMATE_ASSET_PYTHON;
  return firstExisting(
    [
      configured,
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

async function renderPdf(pdfPath, outputPath) {
  const python = await getPython();
  if (!python) throw new Error("Python 3 with Pillow, NumPy, and pypdf is required.");

  return new Promise((resolve, reject) => {
    const child = spawn(
      python,
      [path.join(root, "scripts", "render-fia-circuit-map.py"), pdfPath, outputPath],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Number(stdout.trim()));
      } else {
        reject(new Error(stderr.trim() || `FIA map renderer exited with ${code}`));
      }
    });
  });
}

function padRound(round) {
  return String(round).padStart(2, "0");
}

async function syncSeason(season) {
  const archiveId = FIA_SEASON_IDS.get(season);
  const seasonUrl = `https://www.fia.com/documents/season/season-${season}-${archiveId}`;
  const [races, seasonHtml] = await Promise.all([getCalendar(season), fetchText(seasonUrl)]);
  const events = getFiaEventOptions(seasonHtml);
  const existingManifestPath = path.join(root, "public", "f1", "circuits", String(season), "manifest.json");
  const existingManifest = JSON.parse(await readFile(existingManifestPath, "utf8"));
  const existingByRound = new Map((existingManifest.sources ?? []).map((source) => [Number(source.round), source]));
  const sources = [];
  const missing = [];

  for (const race of races) {
    const round = Number(race.round);
    const event = matchEvent(race.raceName, events);
    if (!event) {
      missing.push({ round, raceName: race.raceName, reason: "fia_event_not_found" });
      continue;
    }

    const eventHtml = await fetchText(event.url);
    const document =
      FIA_DOCUMENT_OVERRIDES.get(`${season}-${round}`) ?? getCircuitMapDocument(eventHtml);
    if (!document) {
      missing.push({ round, raceName: race.raceName, event: event.label, reason: "fia_map_not_found" });
      continue;
    }

    const pdf = await fetchBuffer(document.url);
    const existing = existingByRound.get(round);
    const relativeFile = existing?.file ?? `/f1/circuits/${season}/${padRound(round)}-${raceKey(race.raceName).replaceAll(" ", "-")}.webp`;
    const outputPath = path.join(root, "public", relativeFile.replace(/^\//, ""));
    const temporaryPdf = path.join(tmpdir(), `racemate-fia-${season}-${padRound(round)}-${process.pid}.pdf`);
    await writeFile(temporaryPdf, pdf);

    try {
      const renderedPage = await renderPdf(temporaryPdf, outputPath);
      const output = await readFile(outputPath);
      const sourceDocumentSha256 = sha256(pdf);
      const renderedSha256 = sha256(output);
      const reviewUnchanged =
        existing?.sourceDocumentSha256 === sourceDocumentSha256 &&
        existing?.sha256 === renderedSha256 &&
        existing?.manualReview?.status === "approved";
      sources.push({
        season,
        round,
        raceName: race.raceName,
        circuitId: race.Circuit?.circuitId ?? existing?.circuitId ?? null,
        layoutSlug: existing?.layoutSlug ?? raceKey(race.raceName).replaceAll(" ", "-"),
        file: relativeFile,
        authority: "FIA",
        pageUrl: event.url,
        sourceUrl: document.url,
        sourceTitle: document.title,
        sourceDocumentSha256,
        renderedPage,
        sha256: renderedSha256,
        manualReview: reviewUnchanged
          ? existing.manualReview
          : { status: "pending" },
      });
      console.log(`saved FIA map ${season}/${padRound(round)} ${race.raceName}`);
    } finally {
      await unlink(temporaryPdf).catch(() => {});
    }
  }

  const outputDir = path.join(root, "public", "f1", "circuits", String(season));
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    path.join(outputDir, "manifest.json"),
    `${JSON.stringify(
      {
        season,
        downloadedAt: new Date().toISOString(),
        complete: sources.length === races.length && missing.length === 0,
        missing,
        sources,
      },
      null,
      2,
    )}\n`,
  );

  return { expected: races.length, saved: sources.length, missing };
}

for (const season of seasons) {
  const result = await syncSeason(season);
  console.log(`${season}: ${result.saved}/${result.expected} FIA circuit maps`);
  if (result.missing.length) {
    console.error(JSON.stringify(result.missing, null, 2));
    process.exitCode = 1;
  }
}
