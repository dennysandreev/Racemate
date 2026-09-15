import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export const RED_BULL_RING_BOUNDS_WGS84 = {
  south: 47.2125,
  west: 14.7445,
  north: 47.2318,
  east: 14.7775,
};

export const RED_BULL_RING_BOUNDS_UTM33N = {
  minX: 480_650,
  minY: 5_228_810,
  maxX: 483_160,
  maxY: 5_230_950,
};

const OSM_API_URL = `https://api.openstreetmap.org/api/0.6/map?bbox=${[
  RED_BULL_RING_BOUNDS_WGS84.west,
  RED_BULL_RING_BOUNDS_WGS84.south,
  RED_BULL_RING_BOUNDS_WGS84.east,
  RED_BULL_RING_BOUNDS_WGS84.north,
].join(",")}`;
const FIA_2026_PDF_URL =
  "https://www.fia.com/system/files/decision-document/2026_austrian_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_and_red_zone.pdf";
const F1_2026_CIRCUIT_MAP_URL =
  "https://media.formula1.com/image/upload/c_fit,h_704/q_auto/v1740000001/common/f1/2026/track/2026trackspielbergdetailed.webp";
const ORTHOPHOTO_INFO_URL = "https://data.steiermark.at/cms/beitrag/12920756/97428847/";
const ORTHOPHOTO_SERVICE_URL =
  "https://gis.stmk.gv.at/image/rest/services/OGD_DOP/Orthofotos_akt/ImageServer";
const DTM_SERVICE_URL =
  "https://gis.stmk.gv.at/arcgis/services/OGD/ALSGelaendeinformation_1m_UTM33N/MapServer/WCSServer";
const DSM_SERVICE_URL =
  "https://gis.stmk.gv.at/arcgis/services/OGD/ALSHoeheninformation_1m_UTM33N/MapServer/WCSServer";

export async function downloadRedBullRingData({ force = false, sourceDirectory }) {
  await mkdir(sourceDirectory, { recursive: true });
  const manifestPath = path.join(sourceDirectory, "source-manifest.json");

  if (!force) {
    try {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      await Promise.all(manifest.sources.map((source) => stat(path.join(sourceDirectory, source.file))));
      await verifySources(sourceDirectory, manifest.sources);
      return manifest;
    } catch {
      // Missing, stale or partial source caches are rebuilt below.
    }
  }

  const bbox = RED_BULL_RING_BOUNDS_UTM33N;
  const rasterBbox = [bbox.minX, bbox.minY, bbox.maxX, bbox.maxY].join(",");
  const orthophotoUrl = `${ORTHOPHOTO_SERVICE_URL}/exportImage?${new URLSearchParams({
    f: "image",
    bbox: rasterBbox,
    bboxSR: "32633",
    imageSR: "32633",
    size: "4096,3492",
    format: "jpg",
    pixelType: "U8",
    noData: "0",
  })}`;
  const coverageParams = {
    service: "WCS",
    version: "1.0.0",
    request: "GetCoverage",
    coverage: "4",
    crs: "EPSG:32633",
    response_crs: "EPSG:32633",
    bbox: rasterBbox,
    width: String(bbox.maxX - bbox.minX),
    height: String(bbox.maxY - bbox.minY),
    format: "GeoTIFF",
  };
  const dtmUrl = `${DTM_SERVICE_URL}?${new URLSearchParams(coverageParams)}`;
  const dsmUrl = `${DSM_SERVICE_URL}?${new URLSearchParams(coverageParams)}`;

  const [osmXml, fiaPdf, f1Map, orthophoto, dtm, dsm] = await Promise.all([
    fetchBinary(OSM_API_URL),
    fetchBinary(FIA_2026_PDF_URL),
    fetchBinary(F1_2026_CIRCUIT_MAP_URL),
    fetchBinary(orthophotoUrl),
    fetchBinary(dtmUrl),
    fetchBinary(dsmUrl),
  ]);
  assertSignature(fiaPdf, "%PDF", "FIA circuit document");
  assertSignature(dtm, "II*", "Styria DTM GeoTIFF");
  assertSignature(dsm, "II*", "Styria DSM GeoTIFF");

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
  await Promise.all(derivedFiles.map(([file, body]) =>
    writeFile(path.join(sourceDirectory, file), `${JSON.stringify(body, null, 2)}\n`, "utf8")
  ));

  const rawFiles = [
    ["openstreetmap-map.osm", osmXml],
    ["fia-2026-austrian-grand-prix-doc-7.pdf", fiaPdf],
    ["formula1-2026-austria-circuit-map.webp", f1Map],
    ["styria-orthophoto-2024.jpg", orthophoto],
    ["styria-dtm-1m.tif", dtm],
    ["styria-dsm-1m.tif", dsm],
  ];
  await Promise.all(rawFiles.map(([file, body]) => writeFile(path.join(sourceDirectory, file), body)));

  const descriptions = [
    ["openstreetmap-map.osm", OSM_API_URL, "ODbL 1.0", "live snapshot at retrieval", "current circuit, pit lane, buildings, barriers and mapped trees", "surveyed vector geometry"],
    ...derivedFiles.map(([file]) => [file, "https://www.openstreetmap.org/copyright", "ODbL 1.0", "derived from the raw OSM snapshot", `Blender-ready ${file.replace("openstreetmap-", "").replace(".json", "")} layer`, "lossless geometry extraction"]),
    ["fia-2026-austrian-grand-prix-doc-7.pdf", FIA_2026_PDF_URL, "official FIA event document; reference use", "2026-06-25", "4.326 km lap, sectors, speed trap, 10 turns and 32-box pit-lane drawing", "vector PDF"],
    ["formula1-2026-austria-circuit-map.webp", F1_2026_CIRCUIT_MAP_URL, "official Formula1.com event image; reference use", "2026 season", "official visual cross-check for circuit direction and control markers", "1252 × 704 px"],
    ["styria-orthophoto-2024.jpg", orthophotoUrl, "CC BY 4.0 AT", "state 2024-04-26", "current terrain colour and measured surface context", "20 cm source; 4096 × 3492 export"],
    ["styria-dtm-1m.tif", dtmUrl, "CC BY 4.0 AT", "official ALS terrain model", "unexaggerated bare-earth terrain and track elevation profile", "1 m GeoTIFF"],
    ["styria-dsm-1m.tif", dsmUrl, "CC BY 4.0 AT", "official ALS surface model", "height support for permanent buildings and grandstands", "1 m GeoTIFF"],
  ];
  const sources = [];
  for (const [file, url, license, date, role, resolution] of descriptions) {
    const body = await readFile(path.join(sourceDirectory, file));
    sources.push({
      bbox,
      bytes: body.length,
      crs: file.endsWith(".tif") || file.includes("orthophoto") ? "EPSG:32633" : "EPSG:4326 / document reference",
      date,
      file,
      license,
      resolution,
      role,
      sha256: sha256(body),
      url,
      verticalDatum: file.includes("dtm") || file.includes("dsm") ? "official source orthometric metres" : null,
    });
  }
  const manifest = {
    bounds: bbox,
    coordinateReferenceSystem: "WGS 84 / UTM zone 33N (EPSG:32633)",
    generatedAt: new Date().toISOString(),
    schemaVersion: 1,
    sources,
    sourceNotes: {
      officialTerrainAndSurfaceData: "https://www.landesentwicklung.steiermark.at/cms/beitrag/12803182/143660187/",
      orthophoto: ORTHOPHOTO_INFO_URL,
      orthophotoService: ORTHOPHOTO_SERVICE_URL,
    },
    verticalDatum: "official source orthometric metres; no vertical exaggeration",
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

function filterOsm(osm, predicate) {
  return {
    elements: osm.elements.filter(predicate),
    generator: "RaceSide OSM map parser",
    osm3s: { copyright: "OpenStreetMap contributors, ODbL 1.0" },
    version: 0.6,
  };
}

function parseOsmXml(xml) {
  const nodes = new Map();
  const elements = [];
  for (const match of xml.matchAll(/<node\b([^>]*?)(?:\/>|>([\s\S]*?)<\/node>)/g)) {
    const attributes = parseAttributes(match[1]);
    const node = {
      id: Number(attributes.id),
      lat: Number(attributes.lat),
      lon: Number(attributes.lon),
      tags: parseTags(match[2] ?? ""),
      type: "node",
    };
    nodes.set(attributes.id, node);
    if (Object.keys(node.tags).length > 0) elements.push(node);
  }
  for (const match of xml.matchAll(/<way\b([^>]*)>([\s\S]*?)<\/way>/g)) {
    const attributes = parseAttributes(match[1]);
    const references = [...match[2].matchAll(/<nd ref="(\d+)"\s*\/>/g)].map((entry) => entry[1]);
    elements.push({
      geometry: references.map((reference) => nodes.get(reference)).filter(Boolean)
        .map(({ lat, lon }) => ({ lat, lon })),
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
  return Object.fromEntries([...value.matchAll(/([\w:.-]+)="([^"]*)"/g)]
    .map((match) => [match[1], decodeXml(match[2])]));
}

function parseTags(value) {
  return Object.fromEntries([...value.matchAll(/<tag k="([^"]+)" v="([^"]*)"\s*\/>/g)]
    .map((match) => [decodeXml(match[1]), decodeXml(match[2])]));
}

function decodeXml(value) {
  return value.replaceAll("&quot;", '"').replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
}

async function fetchBinary(url) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "RaceSide track digital-twin builder/1.0 (raceside.ru)" },
      });
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
  if (!body.subarray(0, signature.length).equals(Buffer.from(signature))) {
    throw new Error(`${label} returned an unexpected file format`);
  }
}

async function verifySources(sourceDirectory, sources) {
  await Promise.all(sources.map(async (source) => {
    const body = await readFile(path.join(sourceDirectory, source.file));
    if (body.length !== source.bytes || sha256(body) !== source.sha256) {
      throw new Error(`Cached source checksum mismatch: ${source.file}`);
    }
  }));
}

function sha256(body) {
  return createHash("sha256").update(body).digest("hex");
}
