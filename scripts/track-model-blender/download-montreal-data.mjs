import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export const MONTREAL_BOUNDS_WGS84 = {
  south: 45.4936,
  west: -73.5358,
  north: 45.5179,
  east: -73.5179,
};

export const MONTREAL_BOUNDS_MTM8 = {
  minX: 302_000,
  minY: 5_039_300,
  maxX: 303_400,
  maxY: 5_042_000,
};

const OSM_API_URL = `https://api.openstreetmap.org/api/0.6/map?bbox=${[
  MONTREAL_BOUNDS_WGS84.west,
  MONTREAL_BOUNDS_WGS84.south,
  MONTREAL_BOUNDS_WGS84.east,
  MONTREAL_BOUNDS_WGS84.north,
].join(",")}`;
const FIA_2026_PDF_URL =
  "https://www.fia.com/system/files/decision-document/2026_canadian_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_and_emergency_exits_map.pdf";
const GPCANADA_2024_MAP_URL =
  "https://www.gpcanada.ca/wp-content/uploads/2024/05/guide-visiteurwebsite.pdf";
const GPCANADA_2026_CATALOGUE_URL = "https://2026.gpcanada.ca/en/vitrine/2026/";
const CMM_ORTHOPHOTO_ITEM_URL =
  "https://www.arcgis.com/home/item.html?id=7b1a89daf9ed463d9abfa81b9bbea0a7";
const CMM_ORTHOPHOTO_SERVICE_URL =
  "https://gociteweb.longueuil.quebec/arcgis/rest/services/image/Orthophoto2019mercator/MapServer";
const HRDEM_WCS_URL =
  "https://datacube.services.geo.ca/wrapper/ogc/elevation-hrdem-mosaic";
const HRDEM_DATASET_URL =
  "https://open.canada.ca/data/en/dataset/0fe65119-e96e-4a57-8bfe-9d9245fba06b";

export async function downloadMontrealData({ force = false, sourceDirectory }) {
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

  const bbox = MONTREAL_BOUNDS_MTM8;
  const rasterBbox = [bbox.minX, bbox.minY, bbox.maxX, bbox.maxY].join(",");
  const orthophotoUrl = `${CMM_ORTHOPHOTO_SERVICE_URL}/export?${new URLSearchParams({
    bbox: rasterBbox,
    bboxSR: "32188",
    f: "image",
    format: "jpg",
    imageSR: "32188",
    size: "2124,4096",
  })}`;
  const coverageUrl = (identifier) => `${HRDEM_WCS_URL}?${new URLSearchParams({
    BOUNDINGBOX: `${rasterBbox},urn:ogc:def:crs:EPSG::32188`,
    FORMAT: "image/geotiff",
    GRIDBASECRS: "urn:ogc:def:crs:EPSG::32188",
    GRIDOFFSETS: "2,-2",
    GRIDORIGIN: `${bbox.minX},${bbox.maxY}`,
    Gridcs: "urn:ogc:def:cs:OGC:0.0:Grid2dSquareCS",
    IDENTIFIER: identifier,
    REQUEST: "GetCoverage",
    SERVICE: "WCS",
    VERSION: "1.1.1",
    gridtype: "urn:ogc:def:method:WCS:1.1:2dSimpleGrid",
  })}`;

  const [osmXml, fiaPdf, eventMap, eventCatalogue, orthophoto, dtm, dsm] = await Promise.all([
    fetchBinary(OSM_API_URL),
    fetchBinary(FIA_2026_PDF_URL),
    fetchBinary(GPCANADA_2024_MAP_URL),
    fetchBinary(GPCANADA_2026_CATALOGUE_URL),
    fetchBinary(orthophotoUrl),
    fetchBinary(coverageUrl("dtm")),
    fetchBinary(coverageUrl("dsm")),
  ]);
  assertSignature(fiaPdf, "%PDF", "FIA circuit document");
  assertSignature(eventMap, "%PDF", "Canadian GP spectator map");
  if (!eventCatalogue.includes("Tribune 47")) {
    throw new Error("Canadian GP 2026 catalogue does not contain the expected grandstand list");
  }
  assertTiff(dtm, "NRCan HRDEM DTM");
  assertTiff(dsm, "NRCan HRDEM DSM");

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
    ["fia-2026-canadian-grand-prix-doc-8.pdf", fiaPdf],
    ["gpcanada-2024-spectator-map.pdf", eventMap],
    ["gpcanada-2026-grandstand-catalogue.html", eventCatalogue],
    ["cmm-orthophoto-2019.jpg", orthophoto],
    ["canada-hrdem-dtm-2m.tif", dtm],
    ["canada-hrdem-dsm-2m.tif", dsm],
  ];
  await Promise.all(rawFiles.map(([file, body]) => writeFile(path.join(sourceDirectory, file), body)));

  const descriptions = [
    ["openstreetmap-map.osm", OSM_API_URL, "ODbL 1.0", "live snapshot at retrieval", "current circuit, pit lane, buildings, barriers and mapped trees", "surveyed vector geometry", "EPSG:4326", null],
    ...derivedFiles.map(([file]) => [file, "https://www.openstreetmap.org/copyright", "ODbL 1.0", "derived from the raw OSM snapshot", `Blender-ready ${file.replace("openstreetmap-", "").replace(".json", "")} layer`, "lossless geometry extraction", "EPSG:4326", null]),
    ["fia-2026-canadian-grand-prix-doc-8.pdf", FIA_2026_PDF_URL, "official FIA event document; reference use", "2026-05-21", "4.361 km lap, 14 turns, sectors, speed trap and 43-slot pit-lane drawing", "vector PDF", "document reference", null],
    ["gpcanada-2024-spectator-map.pdf", GPCANADA_2024_MAP_URL, "official promoter document; reference use", "2024 event", "geolocation baseline for named grandstand zones", "vector PDF", "document reference", null],
    ["gpcanada-2026-grandstand-catalogue.html", GPCANADA_2026_CATALOGUE_URL, "official promoter page; reference use", "2026 event", "current list of 13 active Formula 1 grandstands", "HTML snapshot", "document reference", null],
    ["cmm-orthophoto-2019.jpg", orthophotoUrl, "© Communauté métropolitaine de Montréal, 2005–2019", "2019", "measured terrain colour and permanent site context", "25 cm source; 2124 × 4096 projected export", "EPSG:32188", null],
    ["canada-hrdem-dtm-2m.tif", coverageUrl("dtm"), "Open Government Licence - Canada", "HRDEM Mosaic current at retrieval", "unexaggerated bare-earth terrain", "2 m WCS GeoTIFF extraction", "EPSG:32188", "CGVD2013"],
    ["canada-hrdem-dsm-2m.tif", coverageUrl("dsm"), "Open Government Licence - Canada", "HRDEM Mosaic current at retrieval", "surface heights for buildings, grandstands and vegetation", "2 m WCS GeoTIFF extraction", "EPSG:32188", "CGVD2013"],
  ];
  const sources = [];
  for (const [file, url, license, date, role, resolution, crs, verticalDatum] of descriptions) {
    const body = await readFile(path.join(sourceDirectory, file));
    sources.push({
      bbox,
      bytes: body.length,
      crs,
      date,
      file,
      license,
      resolution,
      role,
      sha256: sha256(body),
      url,
      verticalDatum,
    });
  }
  const manifest = {
    bounds: bbox,
    coordinateReferenceSystem: "NAD83 / MTM zone 8 (EPSG:32188)",
    generatedAt: new Date().toISOString(),
    schemaVersion: 1,
    sources,
    sourceNotes: {
      hrdemDataset: HRDEM_DATASET_URL,
      orthophotoItem: CMM_ORTHOPHOTO_ITEM_URL,
      orthophotoService: CMM_ORTHOPHOTO_SERVICE_URL,
    },
    verticalDatum: "Canadian Geodetic Vertical Datum of 2013 (CGVD2013); no vertical exaggeration",
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

function assertTiff(body, label) {
  const signature = body.subarray(0, 4).toString("binary");
  if (signature !== "II*\u0000" && signature !== "MM\u0000*") {
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
