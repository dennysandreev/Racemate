import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export const HUNGARORING_BOUNDS_WGS84 = {
  south: 47.5755,
  west: 19.239,
  north: 47.5905,
  east: 19.26,
};

export const HUNGARORING_BOUNDS_UTM34N = {
  minX: 367_550,
  minY: 5_270_600,
  maxX: 369_200,
  maxY: 5_272_270,
};

const OSM_API_URL = `https://api.openstreetmap.org/api/0.6/map?bbox=${[
  HUNGARORING_BOUNDS_WGS84.west,
  HUNGARORING_BOUNDS_WGS84.south,
  HUNGARORING_BOUNDS_WGS84.east,
  HUNGARORING_BOUNDS_WGS84.north,
].join(",")}`;
const FIA_2026_PDF_URL =
  "https://www.fia.com/system/files/decision-document/2026_hungarian_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_and_red_zone.pdf";
const CURRENT_EVENT_MAP_URL =
  "https://www.gpticketshop.com/en/f1/hungarian-f1-grand-prix/pdfpricelist.html?id=1137t";
const VERSATILES_DOCUMENTATION_URL = "https://docs.versatiles.org/basics/tilesets.html";
const HUNGARY_ORTHOPHOTO_METADATA_URL =
  "https://inspire-geoportal.ec.europa.eu/srv/api/records/orto2022m-2e5d-474c-9de5-910a2e8edd62";
const ORTHOPHOTO_ZOOM = 17;
const ELEVATION_ZOOM = 12;

export async function downloadHungaroringData({ force = false, sourceDirectory }) {
  await mkdir(sourceDirectory, { recursive: true });
  const manifestPath = path.join(sourceDirectory, "source-manifest.json");

  if (!force) {
    try {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      await Promise.all(manifest.sources.map((source) => stat(path.join(sourceDirectory, source.file))));
      await verifyTileMembers(sourceDirectory, manifest);
      return manifest;
    } catch {
      // A missing or partial cache is rebuilt below.
    }
  }

  const [osmXml, fiaPdf, eventMap] = await Promise.all([
    fetchBinary(OSM_API_URL),
    fetchBinary(FIA_2026_PDF_URL),
    fetchBinary(CURRENT_EVENT_MAP_URL),
  ]);
  const osm = parseOsmXml(osmXml.toString("utf8"));
  const raceway = {
    elements: osm.elements.filter((element) =>
      element.type === "node"
        ? element.tags?.raceway
        : element.tags?.highway === "raceway" || element.tags?.service === "pit_lane"
    ),
    generator: "RaceSide OSM map parser",
    osm3s: { copyright: "OpenStreetMap contributors, ODbL 1.0" },
    version: 0.6,
  };
  const buildings = {
    elements: osm.elements.filter((element) => element.type === "way" && element.tags?.building),
    generator: "RaceSide OSM map parser",
    osm3s: { copyright: "OpenStreetMap contributors, ODbL 1.0" },
    version: 0.6,
  };
  const barriers = {
    elements: osm.elements.filter((element) => element.type === "way" && element.tags?.barrier),
    generator: "RaceSide OSM map parser",
    osm3s: { copyright: "OpenStreetMap contributors, ODbL 1.0" },
    version: 0.6,
  };
  const trees = {
    elements: osm.elements.filter((element) => element.type === "node" && element.tags?.natural === "tree"),
    generator: "RaceSide OSM map parser",
    osm3s: { copyright: "OpenStreetMap contributors, ODbL 1.0" },
    version: 0.6,
  };
  const ground = {
    elements: osm.elements.filter((element) =>
      element.type === "way" && isGroundDetail(element)
    ),
    generator: "RaceSide OSM map parser",
    osm3s: { copyright: "OpenStreetMap contributors, ODbL 1.0" },
    version: 0.6,
  };

  const derivedFiles = [
    ["openstreetmap-raceway.json", raceway],
    ["openstreetmap-buildings.json", buildings],
    ["openstreetmap-barriers.json", barriers],
    ["openstreetmap-trees.json", trees],
    ["openstreetmap-ground.json", ground],
  ];
  await Promise.all(derivedFiles.map(([file, body]) =>
    writeFile(path.join(sourceDirectory, file), `${JSON.stringify(body, null, 2)}\n`, "utf8")
  ));

  const [orthophotoTiles, elevationTiles] = await Promise.all([
    downloadTileSet({
      bounds: HUNGARORING_BOUNDS_WGS84,
      directory: path.join(sourceDirectory, "orthophoto-tiles"),
      kind: "satellite",
      tileSize: 512,
      zoom: ORTHOPHOTO_ZOOM,
    }),
    downloadTileSet({
      bounds: HUNGARORING_BOUNDS_WGS84,
      directory: path.join(sourceDirectory, "elevation-tiles"),
      kind: "elevation",
      tileSize: 512,
      zoom: ELEVATION_ZOOM,
    }),
  ]);
  const tileManifest = {
    boundsWgs84: HUNGARORING_BOUNDS_WGS84,
    elevation: elevationTiles,
    orthophoto: orthophotoTiles,
    schemaVersion: 1,
  };
  const tileManifestBody = Buffer.from(`${JSON.stringify(tileManifest, null, 2)}\n`);

  const files = [
    {
      body: osmXml,
      date: "live OSM snapshot at retrieval",
      file: "openstreetmap-map.osm",
      license: "ODbL 1.0",
      resolution: "surveyed vector geometry inside the circuit bbox",
      role: "raw current circuit, pit lane, buildings, barriers and mapped trees",
      url: OSM_API_URL,
    },
    ...derivedFiles.map(([file]) => ({
      body: null,
      date: "derived from the raw OSM snapshot",
      file,
      license: "ODbL 1.0",
      resolution: "lossless geometry extraction with original ids and tags",
      role: `Blender-ready ${file.replace("openstreetmap-", "").replace(".json", "")} layer`,
      url: "https://www.openstreetmap.org/copyright",
    })),
    {
      body: tileManifestBody,
      date: "VersaTiles public satellite/orthophoto composite; tiles retrieved 2026-08-11",
      file: "terrain-tile-manifest.json",
      license: "CC BY 4.0",
      members: [...orthophotoTiles.members, ...elevationTiles.members],
      resolution: "512 px z17 display grid; effective imagery detail is overview-grade; elevation z12 Terrarium (~19 m/pixel)",
      role: "real 2022 macro terrain colour and unexaggerated elevation; not used as the fine-detail layer",
      url: VERSATILES_DOCUMENTATION_URL,
    },
    {
      body: fiaPdf,
      date: "2026-07-23",
      file: "fia-2026-hungarian-grand-prix-doc-5.pdf",
      license: "official FIA event document; reference use",
      resolution: "vector PDF",
      role: "4.381 km lap, 14 turns, sectors, speed trap, pit-lane drawing and garage order",
      url: FIA_2026_PDF_URL,
    },
    {
      body: eventMap,
      date: "current 2026 event map at retrieval",
      file: "hungaroring-2026-ticket-map.pdf",
      license: "official event ticket map; reference use",
      resolution: "vector PDF",
      role: "current named grandstand inventory and spectator layout after circuit renovation",
      url: CURRENT_EVENT_MAP_URL,
    },
  ];

  await writeFile(path.join(sourceDirectory, "terrain-tile-manifest.json"), tileManifestBody);
  await writeFile(path.join(sourceDirectory, "fia-2026-hungarian-grand-prix-doc-5.pdf"), fiaPdf);
  await writeFile(path.join(sourceDirectory, "hungaroring-2026-ticket-map.pdf"), eventMap);
  await writeFile(path.join(sourceDirectory, "openstreetmap-map.osm"), osmXml);

  const sources = [];
  for (const source of files) {
    const body = source.body ?? await readFile(path.join(sourceDirectory, source.file));
    sources.push({
      bbox: HUNGARORING_BOUNDS_UTM34N,
      bytes: body.length,
      crs: source.file.includes("openstreetmap") || source.file.endsWith(".pdf")
        ? "EPSG:4326 / document reference"
        : "EPSG:3857 tiles prepared to EPSG:32634",
      date: source.date,
      file: source.file,
      license: source.license,
      members: source.members,
      resolution: source.resolution,
      role: source.role,
      sha256: sha256(body),
      url: source.url,
      verticalDatum: source.file === "terrain-tile-manifest.json" ? "Terrarium ellipsoidal/DEM metres" : null,
    });
  }

  const manifest = {
    bounds: HUNGARORING_BOUNDS_UTM34N,
    coordinateReferenceSystem: "WGS 84 / UTM zone 34N (EPSG:32634)",
    generatedAt: new Date().toISOString(),
    schemaVersion: 1,
    sources,
    sourceNotes: {
      elevation: VERSATILES_DOCUMENTATION_URL,
      orthophotoMetadata: HUNGARY_ORTHOPHOTO_METADATA_URL,
      publicTileService: VERSATILES_DOCUMENTATION_URL,
    },
    verticalDatum: "source DEM metres; no vertical exaggeration",
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

function isGroundDetail(element) {
  const tags = element.tags ?? {};
  const isClosed = element.geometry?.length >= 4
    && element.geometry[0].lat === element.geometry.at(-1).lat
    && element.geometry[0].lon === element.geometry.at(-1).lon;
  const polygon = isClosed && (
    ["farmland", "forest", "grass", "industrial", "residential"].includes(tags.landuse)
    || ["grassland", "scrub", "shingle", "water", "wood"].includes(tags.natural)
    || ["pitch", "sports_centre", "track", "water_park"].includes(tags.leisure)
    || tags.amenity === "parking"
  );
  const line = [
    "footway",
    "path",
    "residential",
    "service",
    "steps",
    "tertiary",
    "tertiary_link",
    "track",
    "unclassified",
  ].includes(tags.highway) || tags.natural === "tree_row";
  return polygon || line;
}

async function downloadTileSet({ bounds, directory, kind, tileSize, zoom }) {
  await mkdir(directory, { recursive: true });
  const northWest = lonLatToTile(bounds.west, bounds.north, zoom);
  const southEast = lonLatToTile(bounds.east, bounds.south, zoom);
  const requests = [];
  for (let y = northWest.y; y <= southEast.y; y += 1) {
    for (let x = northWest.x; x <= southEast.x; x += 1) {
      requests.push({ x, y });
    }
  }
  const members = await concurrentMap(requests, 8, async ({ x, y }) => {
    const relativeFile = `${path.basename(directory)}/${zoom}-${x}-${y}.webp`;
    const url = `https://tiles.versatiles.org/tiles/${kind}/${zoom}/${x}/${y}`;
    const body = await fetchBinary(url);
    await writeFile(path.join(path.dirname(directory), relativeFile), body);
    return { bytes: body.length, file: relativeFile, sha256: sha256(body), url, x, y };
  });
  return {
    maxX: southEast.x,
    maxY: southEast.y,
    members,
    minX: northWest.x,
    minY: northWest.y,
    tileSize,
    zoom,
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
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function lonLatToTile(lon, lat, zoom) {
  const scale = 2 ** zoom;
  return {
    x: Math.floor((lon + 180) / 360 * scale),
    y: Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * scale),
  };
}

async function verifyTileMembers(sourceDirectory, manifest) {
  const members = manifest.sources.flatMap((source) => source.members ?? []);
  await Promise.all(members.map(async (member) => {
    const body = await readFile(path.join(sourceDirectory, member.file));
    if (body.length !== member.bytes || sha256(body) !== member.sha256) {
      throw new Error(`Cached source checksum mismatch: ${member.file}`);
    }
  }));
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

function sha256(body) {
  return createHash("sha256").update(body).digest("hex");
}
