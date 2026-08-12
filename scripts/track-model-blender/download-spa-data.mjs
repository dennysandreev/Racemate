import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export const SPA_BOUNDS_LAMBERT_2008 = {
  minX: 762_100,
  minY: 624_950,
  maxX: 765_600,
  maxY: 627_850,
};

const SPA_BOUNDS_WGS84 = {
  south: 50.421,
  west: 5.945,
  north: 50.454,
  east: 5.999,
};

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const WALLONIA_DTM_URL =
  "https://geoservices.wallonie.be/arcgis/rest/services/RELIEF/WALLONIE_MNT_2021_2022/MapServer/identify";
const WALLONIA_DSM_URL =
  "https://geoservices.wallonie.be/arcgis/rest/services/RELIEF/WALLONIE_MNS_2021_2022/MapServer/identify";
const WALLONIA_ORTHO_URL =
  "https://geoservices.wallonie.be/arcgis/rest/services/IMAGERIE/ORTHO_LAST/MapServer/export";
const FIA_2026_PDF_URL =
  "https://gp.news/media/documents/2026/Belgian_Grand_Prix/d07_Competition_Notes_-_Circuit_Map_Pit_Lane_Drawing_Emergency_Exits_Map_and_Red_Zone/document.pdf";
const RASTER_GRID = { height: 146, width: 176 };
const ORTHOPHOTO_SIZE = { height: 1_697, width: 2_048 };

export async function downloadSpaData({ force = false, sourceDirectory }) {
  await mkdir(sourceDirectory, { recursive: true });
  const manifestPath = path.join(sourceDirectory, "source-manifest.json");

  if (!force) {
    try {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      await Promise.all(manifest.sources.map((source) => stat(path.join(sourceDirectory, source.file))));
      return manifest;
    } catch {
      // A missing or partial cache is rebuilt below.
    }
  }

  const racewayQuery = `[out:json][timeout:180];(
way["highway"="raceway"](around:3500,50.4372,5.9714);
way["service"="pit_lane"](around:3500,50.4372,5.9714);
way["raceway"](around:3500,50.4372,5.9714);
node["raceway"](around:3500,50.4372,5.9714);
);out body geom;`;
  const buildingQuery = `[out:json][timeout:180];way["building"](${bboxWgs84()});out body geom;`;
  const barrierQuery = `[out:json][timeout:180];way["barrier"](${bboxWgs84()});out body geom;`;

  const overpassPromise = (async () => [
    await fetchOverpass(racewayQuery),
    await fetchOverpass(buildingQuery),
    await fetchOverpass(barrierQuery),
  ])();
  const [[raceway, buildings, barriers], dtm, dsm, orthophoto, fiaPdf] = await Promise.all([
    overpassPromise,
    sampleWalloniaRaster(WALLONIA_DTM_URL, "DTM"),
    sampleWalloniaRaster(WALLONIA_DSM_URL, "DSM"),
    fetchBinary(createOrthophotoUrl()),
    fetchBinary(FIA_2026_PDF_URL),
  ]);

  const files = [
    {
      body: Buffer.from(`${JSON.stringify(raceway, null, 2)}\n`),
      date: "2026-08-11",
      file: "openstreetmap-raceway.json",
      license: "ODbL 1.0",
      resolution: "surveyed vector centreline and pit-lane geometry",
      role: "main circuit centreline, pit lane and start/finish reference",
      url: "https://www.openstreetmap.org/copyright",
    },
    {
      body: Buffer.from(`${JSON.stringify(buildings, null, 2)}\n`),
      date: "2026-08-11",
      file: "openstreetmap-buildings.json",
      license: "ODbL 1.0",
      resolution: "current mapped building footprints",
      role: "permanent buildings and mapped grandstand footprints",
      url: "https://www.openstreetmap.org/copyright",
    },
    {
      body: Buffer.from(`${JSON.stringify(barriers, null, 2)}\n`),
      date: "2026-08-11",
      file: "openstreetmap-barriers.json",
      license: "ODbL 1.0",
      resolution: "current mapped line geometry",
      role: "safety fences, walls, guard rails and retaining walls",
      url: "https://www.openstreetmap.org/copyright",
    },
    {
      body: Buffer.from(`${JSON.stringify(dtm)}\n`),
      crs: "EPSG:3812",
      date: "2021-02-19/2022-03-05; corrected 2024-01-23",
      file: "wallonia-dtm-samples.json",
      license: "CC BY 4.0",
      resolution: "0.5 m source sampled to the web terrain grid",
      role: "bare-earth terrain and circuit elevation",
      url: WALLONIA_DTM_URL,
      verticalDatum: "DNG / EPSG:5710",
    },
    {
      body: Buffer.from(`${JSON.stringify(dsm)}\n`),
      crs: "EPSG:3812",
      date: "2021-02-19/2022-03-05; corrected 2024-01-23",
      file: "wallonia-dsm-samples.json",
      license: "CC BY 4.0",
      resolution: "0.5 m source sampled to the web terrain grid",
      role: "building, vegetation and infrastructure heights",
      url: WALLONIA_DSM_URL,
      verticalDatum: "DNG / EPSG:5710",
    },
    {
      body: orthophoto,
      crs: "EPSG:3812",
      date: "latest SPW campaign exposed by ORTHO_LAST (2023 at retrieval)",
      file: "wallonia-ortho-latest.jpg",
      license: "SPW geographic web-service terms",
      resolution: "25 cm source, exported at 1.71 m/pixel for the web asset",
      role: "measured ground colour, roads, vegetation and paddock context",
      url: createOrthophotoUrl(),
    },
    {
      body: fiaPdf,
      date: "2026-07-16",
      file: "fia-2026-belgian-grand-prix-doc-7.pdf",
      license: "official FIA event document; reference use",
      resolution: "vector PDF",
      role: "7.004 km lap, 19 turns, sectors, speed trap, pit lane and 42 garages",
      url: FIA_2026_PDF_URL,
    },
  ];

  const sources = [];
  for (const source of files) {
    await writeFile(path.join(sourceDirectory, source.file), source.body);
    sources.push({
      bbox: SPA_BOUNDS_LAMBERT_2008,
      bytes: source.body.length,
      crs: source.crs ?? "EPSG:4326",
      date: source.date,
      file: source.file,
      license: source.license,
      resolution: source.resolution,
      role: source.role,
      sha256: createHash("sha256").update(source.body).digest("hex"),
      url: source.url,
      verticalDatum: source.verticalDatum ?? null,
    });
  }

  const manifest = {
    bounds: SPA_BOUNDS_LAMBERT_2008,
    coordinateReferenceSystem: "ETRS89 / Belgian Lambert 2008 (EPSG:3812)",
    generatedAt: new Date().toISOString(),
    schemaVersion: 1,
    sources,
    verticalDatum: "DNG / EPSG:5710",
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

async function fetchOverpass(query) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const endpoint = OVERPASS_ENDPOINTS[attempt % OVERPASS_ENDPOINTS.length];
    try {
      const response = await fetch(endpoint, {
        body: new URLSearchParams({ data: query }),
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
          "user-agent": "RaceSide track digital-twin builder/1.0 (raceside.ru)",
        },
        method: "POST",
      });
      const text = await response.text();
      if (!response.ok || !text.trimStart().startsWith("{")) {
        throw new Error(`Overpass ${response.status}: ${text.slice(0, 180)}`);
      }
      return JSON.parse(text);
    } catch (error) {
      lastError = error;
      await delay(700 * (attempt + 1));
    }
  }
  throw lastError;
}

async function sampleWalloniaRaster(url, kind) {
  const points = [];
  for (let row = 0; row < RASTER_GRID.height; row += 1) {
    const y = SPA_BOUNDS_LAMBERT_2008.maxY -
      (SPA_BOUNDS_LAMBERT_2008.maxY - SPA_BOUNDS_LAMBERT_2008.minY) *
      row / (RASTER_GRID.height - 1);
    for (let column = 0; column < RASTER_GRID.width; column += 1) {
      const x = SPA_BOUNDS_LAMBERT_2008.minX +
        (SPA_BOUNDS_LAMBERT_2008.maxX - SPA_BOUNDS_LAMBERT_2008.minX) *
        column / (RASTER_GRID.width - 1);
      points.push([round(x, 3), round(y, 3)]);
    }
  }

  const batchSize = 1_200;
  const batches = [];
  for (let index = 0; index < points.length; index += batchSize) {
    batches.push(points.slice(index, index + batchSize));
  }
  const valuesByBatch = await concurrentMap(batches, 4, (batch) => identifyRasterBatch(url, batch));
  const values = valuesByBatch.flat();
  if (values.length !== points.length || values.some((value) => !Number.isFinite(value))) {
    throw new Error(`${kind} sample grid is incomplete`);
  }

  return {
    bounds: SPA_BOUNDS_LAMBERT_2008,
    height: RASTER_GRID.height,
    sourceResolutionMeters: 0.5,
    spatialReference: "EPSG:3812",
    values,
    verticalDatum: "DNG / EPSG:5710",
    width: RASTER_GRID.width,
  };
}

async function identifyRasterBatch(url, points) {
  const body = new URLSearchParams({
    f: "json",
    geometry: JSON.stringify({ points }),
    geometryType: "esriGeometryMultipoint",
    imageDisplay: `${RASTER_GRID.width},${RASTER_GRID.height},96`,
    layers: "all:0",
    mapExtent: boundsCsv(),
    returnGeometry: "false",
    sr: "3812",
    tolerance: "0",
  });

  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        body,
        headers: { "content-type": "application/x-www-form-urlencoded" },
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok || payload.error || payload.results?.length !== points.length) {
        throw new Error(JSON.stringify(payload.error ?? payload).slice(0, 240));
      }
      return payload.results.map((result) => {
        const entry = Object.entries(result.attributes ?? {})
          .find(([key]) => key.toLowerCase().includes("pixel value"));
        return Number(entry?.[1]);
      });
    } catch (error) {
      lastError = error;
      await delay(500 * (attempt + 1));
    }
  }
  throw lastError;
}

function createOrthophotoUrl() {
  const query = new URLSearchParams({
    bbox: boundsCsv(),
    bboxSR: "3812",
    dpi: "96",
    f: "image",
    format: "jpg",
    imageSR: "3812",
    size: `${ORTHOPHOTO_SIZE.width},${ORTHOPHOTO_SIZE.height}`,
    transparent: "false",
  });
  return `${WALLONIA_ORTHO_URL}?${query}`;
}

async function fetchBinary(url) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      await delay(500 * (attempt + 1));
    }
  }
  throw lastError;
}

async function concurrentMap(values, concurrency, iteratee) {
  const result = new Array(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      result[index] = await iteratee(values[index], index);
    }
  }));
  return result;
}

function boundsCsv() {
  const bounds = SPA_BOUNDS_LAMBERT_2008;
  return `${bounds.minX},${bounds.minY},${bounds.maxX},${bounds.maxY}`;
}

function bboxWgs84() {
  const bounds = SPA_BOUNDS_WGS84;
  return `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function round(value, digits) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
