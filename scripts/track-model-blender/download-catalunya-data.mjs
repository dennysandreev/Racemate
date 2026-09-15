import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const CATALUNYA_BOUNDS_WGS84 = {
  south: 41.560,
  west: 2.245,
  north: 41.580,
  east: 2.275,
};

export const CATALUNYA_BOUNDS_UTM31N = {
  minX: 437_000,
  minY: 4_601_100,
  maxX: 439_700,
  maxY: 4_603_500,
};

const OSM_API_URL = `https://api.openstreetmap.org/api/0.6/map?bbox=${[
  CATALUNYA_BOUNDS_WGS84.west,
  CATALUNYA_BOUNDS_WGS84.south,
  CATALUNYA_BOUNDS_WGS84.east,
  CATALUNYA_BOUNDS_WGS84.north,
].join(",")}`;
const FIA_2026_PDF_URL =
  "https://www.fia.com/system/files/decision-document/2026_barcelona_event_-_circuit_map_-_barcelona_2026.pdf";
const FIA_2026_PIT_LANE_PDF_URL =
  "https://www.fia.com/system/files/decision-document/2026_barcelona-catalunya_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_and_emergency_exits_map.pdf";
const OFFICIAL_EVENT_MAP_URL =
  "https://www.circuitcat.com/wp-content/uploads/2026/06/Wayfinding-Map-F1-2026.pdf";
const ICGC_ORTHOPHOTO_WMS = "https://geoserveis.icgc.cat/servei/catalunya/orto-territorial/wms";
const ICGC_DTM_WCS = "https://geoserveis.icgc.cat/icc_mdt/wcs/service";
const ICGC_SURFACE_WMS = "https://geoserveis.icgc.cat/servei/catalunya/elevacions-territorial/wms";
const ORTHOPHOTO_LAYER = "ortofoto_25cm_color_2025";
const SURFACE_LAYER = "model-superficies-catalunya-correlacio-1m-2024";

export async function downloadCatalunyaData({ force = false, sourceDirectory }) {
  await mkdir(sourceDirectory, { recursive: true });
  const manifestPath = path.join(sourceDirectory, "source-manifest.json");
  if (!force) {
    try {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      await verifySources(sourceDirectory, manifest.sources);
      return manifest;
    } catch {
      // Missing, stale or partial source caches are rebuilt below.
    }
  }

  const bounds = CATALUNYA_BOUNDS_UTM31N;
  const rasterBbox = [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].join(",");
  const orthophotoUrl = `${ICGC_ORTHOPHOTO_WMS}?${new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetMap",
    LAYERS: ORTHOPHOTO_LAYER,
    STYLES: "",
    CRS: "EPSG:25831",
    BBOX: rasterBbox,
    WIDTH: "2048",
    HEIGHT: "1820",
    FORMAT: "image/jpeg",
  })}`;
  const dtmUrl = `${ICGC_DTM_WCS}?${new URLSearchParams({
    SERVICE: "WCS",
    REQUEST: "GetCoverage",
    VERSION: "1.0.0",
    CRS: "EPSG:25831",
    COVERAGE: "icc:met",
    WIDTH: "180",
    HEIGHT: "160",
    FORMAT: "ArcGrid",
    EXCEPTIONS: "XML",
    BBOX: rasterBbox,
  })}`;
  const [osmXml, fiaPdf, pitLanePdf, eventMap, orthophoto, dtm] = await Promise.all([
    fetchBinary(OSM_API_URL),
    fetchBinary(FIA_2026_PDF_URL),
    fetchBinary(FIA_2026_PIT_LANE_PDF_URL),
    fetchBinary(OFFICIAL_EVENT_MAP_URL),
    fetchBinary(orthophotoUrl),
    fetchBinary(dtmUrl),
  ]);
  assertSignature(fiaPdf, "%PDF", "FIA Barcelona circuit document");
  assertSignature(pitLanePdf, "%PDF", "FIA Barcelona pit-lane document");
  assertSignature(eventMap, "%PDF", "Circuit de Barcelona-Catalunya event map");
  if (!dtm.toString("utf8", 0, 16).startsWith("NCOLS")) {
    throw new Error("ICGC DTM returned an unexpected format");
  }

  const osm = parseOsmXml(osmXml.toString("utf8"));
  const derivedFiles = [
    ["openstreetmap-raceway.json", filterOsm(osm, (element) =>
      element.type === "way"
        && (element.tags?.highway === "raceway" || element.tags?.service === "pit_lane"))],
    ["openstreetmap-buildings.json", filterOsm(osm, (element) =>
      element.type === "way" && Boolean(element.tags?.building))],
    ["openstreetmap-barriers.json", filterOsm(osm, (element) =>
      element.type === "way" && Boolean(element.tags?.barrier))],
    ["openstreetmap-trees.json", filterOsm(osm, (element) =>
      element.type === "node" && element.tags?.natural === "tree")],
  ];
  const buildings = derivedFiles.find(([file]) => file === "openstreetmap-buildings.json")[1];
  const surfaceCandidates = buildings.elements
    .map((feature) => ({ feature, metrics: footprintMetrics(feature.geometry ?? []) }))
    .filter(({ metrics }) => metrics && insideBounds(metrics, bounds))
    .sort((first, second) => {
      const firstPriority = first.feature.tags?.building === "grandstand" || first.feature.tags?.leisure === "bleachers" ? 1_000_000 : first.metrics.area;
      const secondPriority = second.feature.tags?.building === "grandstand" || second.feature.tags?.leisure === "bleachers" ? 1_000_000 : second.metrics.area;
      return secondPriority - firstPriority;
    })
    .slice(0, 110);
  const surfaceSamples = await concurrentMap(surfaceCandidates, 6, async ({ feature, metrics }) => ({
    buildingId: feature.id,
    bounds: { maxX: round(metrics.maxX), maxY: round(metrics.maxY), minX: round(metrics.minX), minY: round(metrics.minY) },
    footprintAreaSquareMeters: round(metrics.area),
    surfaceElevationMeters: await querySurfaceElevation(metrics.x, metrics.y),
    x: round(metrics.x),
    y: round(metrics.y),
  }));
  derivedFiles.push(["icgc-building-surface-samples.json", {
    coordinateReferenceSystem: "EPSG:25831",
    elements: surfaceSamples.filter((sample) => Number.isFinite(sample.surfaceElevationMeters)),
    generator: "RaceSide ICGC WMS GetFeatureInfo sampler",
    layer: SURFACE_LAYER,
    schemaVersion: 1,
  }]);

  await Promise.all(derivedFiles.map(([file, body]) =>
    writeFile(path.join(sourceDirectory, file), `${JSON.stringify(body, null, 2)}\n`, "utf8")
  ));
  const rawFiles = [
    ["openstreetmap-map.osm", osmXml],
    ["fia-2026-barcelona-circuit-map.pdf", fiaPdf],
    ["fia-2026-barcelona-pit-lane-drawing.pdf", pitLanePdf],
    ["circuitcat-2026-formula-1-event-map.pdf", eventMap],
    ["icgc-orthophoto-2025.jpg", orthophoto],
    ["icgc-dtm-15m.asc", dtm],
  ];
  await Promise.all(rawFiles.map(([file, body]) => writeFile(path.join(sourceDirectory, file), body)));

  const descriptions = [
    ["openstreetmap-map.osm", OSM_API_URL, "ODbL 1.0", "live snapshot at retrieval", "current circuit, pit lane, buildings, grandstands, barriers and mapped trees", "surveyed vector geometry"],
    ...derivedFiles.slice(0, 4).map(([file]) => [file, "https://www.openstreetmap.org/copyright", "ODbL 1.0", "derived from raw OSM snapshot", `Blender-ready ${file.replace("openstreetmap-", "").replace(".json", "")} layer`, "lossless geometry extraction"]),
    ["icgc-building-surface-samples.json", ICGC_SURFACE_WMS, "CC BY 4.0", "ICGC 2024 surface model", "official surface heights for all grandstands and the largest permanent buildings", "1 m source sampled at footprint centroids"],
    ["fia-2026-barcelona-circuit-map.pdf", FIA_2026_PDF_URL, "official FIA event document; reference use", "2026-05-28", "4.657 km lap, 14 turns, sectors and speed trap", "vector PDF"],
    ["fia-2026-barcelona-pit-lane-drawing.pdf", FIA_2026_PIT_LANE_PDF_URL, "official FIA event document; reference use", "2026 event", "pit-lane route and garage allocation cross-check", "vector PDF"],
    ["circuitcat-2026-formula-1-event-map.pdf", OFFICIAL_EVENT_MAP_URL, "official venue event document; reference use", "2026 event", "named grandstand, pit and paddock inventory cross-check", "vector PDF"],
    ["icgc-orthophoto-2025.jpg", orthophotoUrl, "CC BY 4.0", "ICGC territorial orthophoto 2025", "current real terrain colour and surface context", "25 cm source; 2048 × 1820 delivery texture"],
    ["icgc-dtm-15m.asc", dtmUrl, "CC BY 4.0", "ICGC territorial terrain model", "unexaggerated bare-earth terrain and elevation profile", "15 m ArcGrid export"],
  ];
  const sources = [];
  for (const [file, url, license, date, role, resolution] of descriptions) {
    const body = await readFile(path.join(sourceDirectory, file));
    sources.push({
      bbox: bounds,
      bytes: body.length,
      crs: file.includes("icgc-") && !file.endsWith(".pdf") ? "EPSG:25831" : "EPSG:4326 / document reference",
      date,
      file,
      license,
      resolution,
      role,
      sha256: sha256(body),
      url,
      verticalDatum: file.includes("dtm") || file.includes("surface") ? "ICGC source elevation metres" : null,
    });
  }
  const manifest = {
    bounds,
    coordinateReferenceSystem: "ETRS89 / UTM zone 31N (EPSG:25831)",
    generatedAt: new Date().toISOString(),
    schemaVersion: 1,
    sources,
    sourceNotes: {
      icgcReuse: "https://www.icgc.cat/en/ICGC/Public-Information/Transparency/Re-use-information",
      orthophotoMetadata: "https://www.icgc.cat/es/Geoinformacion-y-mapas/Datos-y-productos/Imagen/Ortofoto-Territorial",
      terrainMetadata: "https://www.icgc.cat/es/Geoinformacion-y-mapas/Datos-y-productos/Elevaciones/Modelo-de-elevaciones-del-terreno-de-Cataluna",
    },
    verticalDatum: "ICGC source elevation metres; no vertical exaggeration",
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

async function querySurfaceElevation(x, y) {
  const radius = 5;
  const url = `${ICGC_SURFACE_WMS}?${new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetFeatureInfo",
    LAYERS: SURFACE_LAYER,
    QUERY_LAYERS: SURFACE_LAYER,
    STYLES: "",
    CRS: "EPSG:25831",
    BBOX: [x - radius, y - radius, x + radius, y + radius].join(","),
    WIDTH: "11",
    HEIGHT: "11",
    I: "5",
    J: "5",
    INFO_FORMAT: "text/plain",
    FEATURE_COUNT: "1",
  })}`;
  const response = (await fetchBinary(url)).toString("utf8");
  const match = response.match(/value_0\s*=\s*['\"]?(-?\d+(?:\.\d+)?)/i);
  return match ? Number(match[1]) : null;
}

function filterOsm(osm, predicate) {
  return {
    elements: osm.elements.filter(predicate),
    generator: "RaceSide OSM map parser",
    osm3s: { copyright: "OpenStreetMap contributors, ODbL 1.0" },
    version: 0.6,
  };
}

function footprintMetrics(geometry) {
  if (geometry.length < 3) return null;
  const points = geometry.map(({ lat, lon }) => utm31nFromWgs84(lat, lon));
  let twiceArea = 0;
  let weightedX = 0;
  let weightedY = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[index + 1];
    const cross = x1 * y2 - x2 * y1;
    twiceArea += cross;
    weightedX += (x1 + x2) * cross;
    weightedY += (y1 + y2) * cross;
  }
  if (Math.abs(twiceArea) < 1e-6) return null;
  return {
    area: Math.abs(twiceArea) / 2,
    maxX: Math.max(...points.map(([x]) => x)),
    maxY: Math.max(...points.map(([, y]) => y)),
    minX: Math.min(...points.map(([x]) => x)),
    minY: Math.min(...points.map(([, y]) => y)),
    x: weightedX / (3 * twiceArea),
    y: weightedY / (3 * twiceArea),
  };
}

function insideBounds(point, bounds) {
  return point.x >= bounds.minX && point.x <= bounds.maxX
    && point.y >= bounds.minY && point.y <= bounds.maxY;
}

function parseOsmXml(xml) {
  const nodes = new Map();
  const elements = [];
  for (const match of xml.matchAll(/<node\b([^>]*?)(?:\/>|>([\s\S]*?)<\/node>)/g)) {
    const attributes = parseAttributes(match[1]);
    const node = { id: Number(attributes.id), lat: Number(attributes.lat), lon: Number(attributes.lon), tags: parseTags(match[2] ?? ""), type: "node" };
    nodes.set(attributes.id, node);
    if (Object.keys(node.tags).length > 0) elements.push(node);
  }
  for (const match of xml.matchAll(/<way\b([^>]*)>([\s\S]*?)<\/way>/g)) {
    const attributes = parseAttributes(match[1]);
    const references = [...match[2].matchAll(/<nd ref="(\d+)"\s*\/>/g)].map((entry) => entry[1]);
    elements.push({
      geometry: references.map((reference) => nodes.get(reference)).filter(Boolean).map(({ lat, lon }) => ({ lat, lon })),
      id: Number(attributes.id),
      tags: parseTags(match[2]),
      timestamp: attributes.timestamp,
      type: "way",
      version: Number(attributes.version),
    });
  }
  return { elements };
}

function parseAttributes(value) {
  return Object.fromEntries([...value.matchAll(/([\w:.-]+)="([^"]*)"/g)].map((match) => [match[1], decodeXml(match[2])]));
}

function parseTags(value) {
  return Object.fromEntries([...value.matchAll(/<tag k="([^"]+)" v="([^"]*)"\s*\/>/g)].map((match) => [decodeXml(match[1]), decodeXml(match[2])]));
}

function decodeXml(value) {
  return value.replaceAll("&quot;", '"').replaceAll("&apos;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
}

function utm31nFromWgs84(lat, lon) {
  const semiMajor = 6_378_137;
  const flattening = 1 / 298.257223563;
  const scale = 0.9996;
  const e2 = flattening * (2 - flattening);
  const ep2 = e2 / (1 - e2);
  const phi = lat * Math.PI / 180;
  const delta = (lon - 3) * Math.PI / 180;
  const sin = Math.sin(phi);
  const cos = Math.cos(phi);
  const tan = Math.tan(phi);
  const n = semiMajor / Math.sqrt(1 - e2 * sin ** 2);
  const t = tan ** 2;
  const c = ep2 * cos ** 2;
  const a = cos * delta;
  const m = semiMajor * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * phi - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * phi) + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * phi) - 35 * e2 ** 3 / 3072 * Math.sin(6 * phi));
  return [500_000 + scale * n * (a + (1 - t + c) * a ** 3 / 6 + (5 - 18 * t + t ** 2 + 72 * c - 58 * ep2) * a ** 5 / 120), scale * (m + n * tan * (a ** 2 / 2 + (5 - t + 9 * c + 4 * c ** 2) * a ** 4 / 24 + (61 - 58 * t + t ** 2 + 600 * c - 330 * ep2) * a ** 6 / 720))];
}

async function fetchBinary(url) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "user-agent": "RaceSide track digital-twin builder/1.0 (raceside.ru)" } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}

function assertSignature(body, signature, label) {
  if (!body.subarray(0, signature.length).equals(Buffer.from(signature))) throw new Error(`${label} returned an unexpected file format`);
}

async function verifySources(sourceDirectory, sources) {
  await Promise.all(sources.map(async (source) => {
    const body = await readFile(path.join(sourceDirectory, source.file));
    if (body.length !== source.bytes || sha256(body) !== source.sha256) throw new Error(`Cached source checksum mismatch: ${source.file}`);
  }));
}

async function concurrentMap(values, concurrency, iteratee) {
  const result = new Array(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      result[index] = await iteratee(values[index], index);
    }
  }));
  return result;
}

function sha256(body) {
  return createHash("sha256").update(body).digest("hex");
}

function round(value) {
  return Math.round(value * 1_000) / 1_000;
}
